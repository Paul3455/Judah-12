import express from 'express';
import { z } from 'zod';
import { many, one, query, tx } from '../db.js';
import { HttpError, wrap } from '../middleware/errors.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { courseForUser } from '../services/access.js';
import { logAudit, diff } from '../lib/audit.js';

const router = express.Router();
router.use(authenticate);

const COURSE_SELECT = `
  select c.*, d.name as department_name, d.code as department_code,
         u.name as lecturer_name,
         (select count(*)::int from enrollments e where e.course_id = c.id) as enrolled_count,
         (select count(*)::int from sessions s where s.course_id = c.id) as session_count
  from courses c
  join departments d on d.id = c.department_id
  left join users u on u.id = c.lecturer_id
`;

const geofenceSchema = z
  .object({
    enabled: z.boolean().optional(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    radius_m: z.number().int().min(10).max(5000).optional(),
  })
  .optional();

const courseSchema = z.object({
  code: z.string().trim().min(2).max(24),
  title: z.string().trim().min(2).max(200),
  department_id: z.string().uuid(),
  lecturer_id: z.string().uuid().optional(),
  semester: z.string().trim().min(2).max(40),
  schedule: z.string().trim().max(160).optional(),
  venue: z.string().trim().max(160).optional(),
  geofence: geofenceSchema,
});

router.get(
  '/',
  wrap(async (req, res) => {
    const user = req.user;
    let courses;
    if (user.role === 'student') {
      courses = await many(
        `${COURSE_SELECT}
         join enrollments e on e.course_id = c.id and e.student_id = $1
         order by c.code`,
        [user.id],
      );
    } else if (user.role === 'lecturer') {
      courses = await many(`${COURSE_SELECT} where c.lecturer_id = $1 order by c.code`, [user.id]);
    } else {
      courses = await many(`${COURSE_SELECT} order by c.code`);
    }
    res.json({ courses });
  }),
);

router.post(
  '/',
  requireRole('lecturer', 'admin'),
  wrap(async (req, res) => {
    const input = courseSchema.parse(req.body);
    const lecturerId = req.user.role === 'lecturer' ? req.user.id : input.lecturer_id ?? null;
    const geofence = input.geofence ?? {};

    const course = await one(
      `insert into courses (code, title, department_id, lecturer_id, semester, schedule, venue,
                            geofence_enabled, geofence_lat, geofence_lng, geofence_radius_m)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning *`,
      [
        input.code,
        input.title,
        input.department_id,
        lecturerId,
        input.semester,
        input.schedule ?? '',
        input.venue ?? '',
        Boolean(geofence.enabled),
        geofence.lat ?? null,
        geofence.lng ?? null,
        geofence.radius_m ?? 150,
      ],
    );

    await logAudit(null, {
      actorId: req.user.id,
      action: 'course.create',
      entityType: 'course',
      entityId: course.id,
      newValue: { code: course.code, title: course.title },
      ip: req.ip,
    });

    res.status(201).json({ course });
  }),
);

router.get(
  '/:id',
  wrap(async (req, res) => {
    const course = await courseForUser(req.user, req.params.id);
    res.json({ course });
  }),
);

router.patch(
  '/:id',
  requireRole('lecturer', 'admin'),
  wrap(async (req, res) => {
    const course = await courseForUser(req.user, req.params.id, { write: true });
    const input = courseSchema.partial().parse(req.body);
    const geofence = input.geofence ?? {};

    const patch = {
      title: input.title ?? course.title,
      code: input.code ?? course.code,
      semester: input.semester ?? course.semester,
      schedule: input.schedule ?? course.schedule,
      venue: input.venue ?? course.venue,
      department_id: input.department_id ?? course.department_id,
      lecturer_id: req.user.role === 'admin' ? input.lecturer_id ?? course.lecturer_id : course.lecturer_id,
      geofence_enabled: geofence.enabled ?? course.geofence_enabled,
      geofence_lat: geofence.lat !== undefined ? geofence.lat : course.geofence_lat,
      geofence_lng: geofence.lng !== undefined ? geofence.lng : course.geofence_lng,
      geofence_radius_m: geofence.radius_m ?? course.geofence_radius_m,
    };

    const updated = await tx(async (client) => {
      const result = await client.query(
        `update courses set code = $2, title = $3, department_id = $4, lecturer_id = $5, semester = $6,
                            schedule = $7, venue = $8, geofence_enabled = $9, geofence_lat = $10,
                            geofence_lng = $11, geofence_radius_m = $12
         where id = $1 returning *`,
        [
          course.id,
          patch.code,
          patch.title,
          patch.department_id,
          patch.lecturer_id,
          patch.semester,
          patch.schedule,
          patch.venue,
          patch.geofence_enabled,
          patch.geofence_lat,
          patch.geofence_lng,
          patch.geofence_radius_m,
        ],
      );
      const changes = diff(course, result.rows[0], Object.keys(patch));
      if (Object.keys(changes).length) {
        await logAudit(client, {
          actorId: req.user.id,
          action: 'course.update',
          entityType: 'course',
          entityId: course.id,
          oldValue: Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value.old])),
          newValue: Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value.new])),
          ip: req.ip,
        });
      }
      return result.rows[0];
    });

    res.json({ course: updated });
  }),
);

router.get(
  '/:id/students',
  wrap(async (req, res) => {
    const course = await courseForUser(req.user, req.params.id, { write: true });
    const students = await many(
      `select u.id, u.name, u.email, st.matric_number, st.program, st.level, e.semester, e.created_at as enrolled_at
       from enrollments e
       join users u on u.id = e.student_id
       left join students st on st.user_id = u.id
       where e.course_id = $1
       order by u.name`,
      [course.id],
    );
    res.json({ students });
  }),
);

router.post(
  '/:id/enroll',
  requireRole('lecturer', 'admin'),
  wrap(async (req, res) => {
    const course = await courseForUser(req.user, req.params.id, { write: true });
    const input = z
      .object({
        student_ids: z.array(z.string().uuid()).optional(),
        matric_numbers: z.array(z.string().trim().min(1)).optional(),
      })
      .parse(req.body);

    let ids = input.student_ids ?? [];
    if (input.matric_numbers?.length) {
      const rows = await many(
        `select user_id from students where upper(matric_number) = any($1::text[])`,
        [input.matric_numbers.map((value) => value.toUpperCase())],
      );
      ids = [...ids, ...rows.map((row) => row.user_id)];
    }
    ids = [...new Set(ids)];
    if (!ids.length) throw new HttpError(400, 'Choose at least one student to enrol.', 'no_students');

    const eligible = await many(`select id from users where id = any($1::uuid[]) and role = 'student'`, [ids]);
    if (eligible.length !== ids.length) {
      throw new HttpError(400, 'One or more of those accounts is not a student account.', 'invalid_students');
    }

    const inserted = await many(
      `insert into enrollments (student_id, course_id, semester)
       select unnest($1::uuid[]), $2, $3
       on conflict (student_id, course_id, semester) do nothing
       returning student_id`,
      [ids, course.id, course.semester],
    );

    await logAudit(null, {
      actorId: req.user.id,
      action: 'course.enroll',
      entityType: 'course',
      entityId: course.id,
      newValue: { added: inserted.length, requested: ids.length },
      ip: req.ip,
    });

    res.status(201).json({ enrolled: inserted.length, requested: ids.length });
  }),
);

router.delete(
  '/:id/enroll/:studentId',
  requireRole('lecturer', 'admin'),
  wrap(async (req, res) => {
    const course = await courseForUser(req.user, req.params.id, { write: true });
    const removed = await query('delete from enrollments where course_id = $1 and student_id = $2', [
      course.id,
      req.params.studentId,
    ]);
    if (!removed.rowCount) throw new HttpError(404, 'That student is not enrolled in this course.', 'not_found');

    await logAudit(null, {
      actorId: req.user.id,
      action: 'course.unenroll',
      entityType: 'course',
      entityId: course.id,
      oldValue: { student_id: req.params.studentId },
      ip: req.ip,
    });
    res.status(204).end();
  }),
);

export default router;
