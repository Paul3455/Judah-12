import express from 'express';
import { z } from 'zod';
import { many, one, tx } from '../db.js';
import { HttpError, wrap } from '../middleware/errors.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { courseForUser, sessionForUser } from '../services/access.js';
import { currentCode, markAbsentees, sessionLive } from '../services/attendance.js';
import { logAudit, diff } from '../lib/audit.js';
import { notifyMany } from '../lib/notify.js';

const router = express.Router();
router.use(authenticate);

const SESSION_SELECT = `
  select s.*, c.code as course_code, c.title as course_title, c.semester,
         c.geofence_lat, c.geofence_lng, c.geofence_radius_m,
         u.name as lecturer_name,
         (select count(*)::int from enrollments e where e.course_id = s.course_id) as enrolled_count,
         (select count(*)::int from attendance_records r where r.session_id = s.id) as checked_in_count
  from sessions s
  join courses c on c.id = s.course_id
  left join users u on u.id = s.lecturer_id
`;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

const createSchema = z.object({
  course_id: z.string().uuid(),
  date: isoDate.optional(),
  start_time: z.string().min(10),
  end_time: z.string().min(10),
  venue: z.string().trim().min(1).max(160),
  check_in_opens_at: z.string().min(10).optional(),
  check_in_closes_at: z.string().min(10).optional(),
  require_geofence: z.boolean().optional(),
});

const TIME_FIELDS = ['start_time', 'end_time', 'venue', 'check_in_opens_at', 'check_in_closes_at', 'require_geofence'];

router.get(
  '/',
  wrap(async (req, res) => {
    const { course_id: courseId, from, to, status } = req.query;
    const conditions = [];
    const params = [];
    const add = (template, value) => {
      params.push(value);
      conditions.push(template.replace('$?', `$${params.length}`));
    };

    if (req.user.role === 'student') {
      add('exists (select 1 from enrollments e where e.course_id = s.course_id and e.student_id = $?)', req.user.id);
    } else if (req.user.role === 'lecturer') {
      add('c.lecturer_id = $?', req.user.id);
    }
    if (courseId) add('s.course_id = $?', courseId);
    if (from) add('s.date >= $?', from);
    if (to) add('s.date <= $?', to);
    if (status) add('s.status = $?', status);

    const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
    const sessions = await many(`${SESSION_SELECT} ${where} order by s.start_time desc limit 200`, params);
    res.json({ sessions });
  }),
);

router.post(
  '/',
  requireRole('lecturer', 'admin'),
  wrap(async (req, res) => {
    const input = createSchema.parse(req.body);
    const course = await courseForUser(req.user, input.course_id, { write: true });

    const start = new Date(input.start_time);
    const end = new Date(input.end_time);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      throw new HttpError(400, 'Enter a valid start and end time.', 'invalid_time');
    }
    if (end <= start) throw new HttpError(400, 'The session must end after it starts.', 'invalid_time');

    const opens = input.check_in_opens_at ? new Date(input.check_in_opens_at) : new Date(start.getTime() - 15 * 60_000);
    const closes = input.check_in_closes_at ? new Date(input.check_in_closes_at) : end;
    if (closes <= opens) throw new HttpError(400, 'The check-in window must close after it opens.', 'invalid_window');

    const date = input.date || start.toISOString().slice(0, 10);

    const session = await one(
      `insert into sessions (course_id, lecturer_id, date, start_time, end_time, venue,
                             check_in_opens_at, check_in_closes_at, status, require_geofence)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled', $9)
       returning *`,
      [
        course.id,
        course.lecturer_id || req.user.id,
        date,
        start.toISOString(),
        end.toISOString(),
        input.venue,
        opens.toISOString(),
        closes.toISOString(),
        Boolean(input.require_geofence ?? course.geofence_enabled),
      ],
    );

    await logAudit(null, {
      actorId: req.user.id,
      action: 'session.create',
      entityType: 'session',
      entityId: session.id,
      newValue: { course: course.code, date, start: start.toISOString(), venue: input.venue },
      ip: req.ip,
    });

    res.status(201).json({ session });
  }),
);

router.get(
  '/:id',
  wrap(async (req, res) => {
    const session = await sessionForUser(req.user, req.params.id);
    res.json({ session });
  }),
);

router.patch(
  '/:id',
  requireRole('lecturer', 'admin'),
  wrap(async (req, res) => {
    const session = await sessionForUser(req.user, req.params.id, { write: true });
    const input = createSchema.partial().omit({ course_id: true }).parse(req.body);

    const patch = {
      start_time: input.start_time ? new Date(input.start_time).toISOString() : session.start_time,
      end_time: input.end_time ? new Date(input.end_time).toISOString() : session.end_time,
      venue: input.venue ?? session.venue,
      check_in_opens_at: input.check_in_opens_at
        ? new Date(input.check_in_opens_at).toISOString()
        : session.check_in_opens_at,
      check_in_closes_at: input.check_in_closes_at
        ? new Date(input.check_in_closes_at).toISOString()
        : session.check_in_closes_at,
      require_geofence: input.require_geofence ?? session.require_geofence,
    };

    const updated = await tx(async (client) => {
      const result = await client.query(
        `update sessions set start_time = $2, end_time = $3, venue = $4,
                             check_in_opens_at = $5, check_in_closes_at = $6, require_geofence = $7
         where id = $1 returning *`,
        [
          session.id,
          patch.start_time,
          patch.end_time,
          patch.venue,
          patch.check_in_opens_at,
          patch.check_in_closes_at,
          patch.require_geofence,
        ],
      );
      const changes = diff(session, result.rows[0], TIME_FIELDS);
      if (Object.keys(changes).length) {
        await logAudit(client, {
          actorId: req.user.id,
          action: 'session.update',
          entityType: 'session',
          entityId: session.id,
          oldValue: Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value.old])),
          newValue: Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value.new])),
          ip: req.ip,
        });
      }
      return result.rows[0];
    });

    res.json({ session: updated });
  }),
);

router.post(
  '/:id/open',
  requireRole('lecturer', 'admin'),
  wrap(async (req, res) => {
    const session = await sessionForUser(req.user, req.params.id, { write: true });
    if (session.status === 'open') {
      return res.json({ session, code: await currentCode(session) });
    }
    if (session.status === 'cancelled') {
      throw new HttpError(422, 'A cancelled session cannot be opened.', 'session_cancelled');
    }

    // Starting the session now makes check-in available immediately, while
    // keeping the originally planned window if it is still ahead.
    const now = new Date();
    const opens = new Date(Math.min(new Date(session.check_in_opens_at).getTime(), now.getTime()));
    const closes = new Date(Math.max(new Date(session.check_in_closes_at).getTime(), now.getTime() + 10 * 60_000));

    const updated = await one(
      `update sessions set status = 'open', check_in_opens_at = $2, check_in_closes_at = $3
       where id = $1 returning *`,
      [session.id, opens.toISOString(), closes.toISOString()],
    );

    await logAudit(null, {
      actorId: req.user.id,
      action: 'session.open',
      entityType: 'session',
      entityId: session.id,
      newValue: { status: 'open', check_in_closes_at: closes.toISOString() },
      ip: req.ip,
    });

    const students = await many('select student_id from enrollments where course_id = $1', [session.course_id]);
    await notifyMany(
      students.map((row) => ({ id: row.student_id })),
      {
        type: 'session_starting',
        title: `Check in now: ${session.course_code}`,
        body: `${session.course_code} has started in ${session.venue}. Check-in closes at ${new Date(closes).toISOString().slice(11, 16)} UTC.`,
        data: { session_id: session.id },
      },
    );

    res.json({ session: updated, code: await currentCode(updated) });
  }),
);

router.post(
  '/:id/close',
  requireRole('lecturer', 'admin'),
  wrap(async (req, res) => {
    const session = await sessionForUser(req.user, req.params.id, { write: true });
    const { created } = await markAbsentees(session.id, req.user.id, req.ip);

    const updated = await one(
      `update sessions set status = 'closed', check_in_closes_at = least(check_in_closes_at, now())
       where id = $1 returning *`,
      [session.id],
    );

    await logAudit(null, {
      actorId: req.user.id,
      action: 'session.close',
      entityType: 'session',
      entityId: session.id,
      newValue: { status: 'closed', marked_absent: created.length },
      ip: req.ip,
    });

    res.json({ session: updated, marked_absent: created.length });
  }),
);

router.get(
  '/:id/code',
  requireRole('lecturer', 'admin'),
  wrap(async (req, res) => {
    const session = await sessionForUser(req.user, req.params.id, { write: true });
    if (session.status !== 'open') {
      throw new HttpError(422, 'Start the session to display a check-in code.', 'session_not_open');
    }
    res.json(await currentCode(session));
  }),
);

router.get(
  '/:id/live',
  requireRole('lecturer', 'admin'),
  wrap(async (req, res) => {
    const session = await sessionForUser(req.user, req.params.id, { write: true });
    const live = await sessionLive(session);
    res.json({
      session,
      ...live,
      server_time: new Date().toISOString(),
    });
  }),
);

export default router;
