import express from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { many, one, query, tx } from '../db.js';
import { HttpError, wrap } from '../middleware/errors.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { auditTrail, purgeExpiredAttendance } from '../services/reports.js';
import { getSettings, saveSetting } from '../lib/settings.js';
import { logAudit, diff } from '../lib/audit.js';

const router = express.Router();
router.use(authenticate, requireRole('admin'));

const USER_SELECT = `
  select u.id, u.name, u.email, u.role, u.status, u.department_id, u.created_at, u.email_verified_at,
         d.name as department_name, d.code as department_code,
         st.matric_number, st.program, st.level, lec.staff_id,
         (select count(*)::int from enrollments e where e.student_id = u.id) as course_count
  from users u
  left join departments d on d.id = u.department_id
  left join students st on st.user_id = u.id
  left join lecturers lec on lec.user_id = u.id
`;

// ---------------------------------------------------------------- departments

router.get(
  '/departments',
  wrap(async (req, res) => {
    const departments = await many(
      `select d.*,
              (select count(*)::int from courses c where c.department_id = d.id) as course_count,
              (select count(*)::int from users u where u.department_id = d.id and u.role = 'lecturer') as lecturer_count
       from departments d order by d.name`,
    );
    res.json({ departments });
  }),
);

router.post(
  '/departments',
  wrap(async (req, res) => {
    const input = z
      .object({ name: z.string().trim().min(2).max(120), code: z.string().trim().min(2).max(12) })
      .parse(req.body);

    const department = await one(
      'insert into departments (name, code) values ($1, $2) returning *',
      [input.name, input.code.toUpperCase()],
    );
    await logAudit(null, {
      actorId: req.user.id,
      action: 'department.create',
      entityType: 'department',
      entityId: department.id,
      newValue: { name: department.name, code: department.code },
      ip: req.ip,
    });
    res.status(201).json({ department });
  }),
);

router.patch(
  '/departments/:id',
  wrap(async (req, res) => {
    const input = z
      .object({ name: z.string().trim().min(2).max(120).optional(), code: z.string().trim().min(2).max(12).optional() })
      .parse(req.body);
    const before = await one('select * from departments where id = $1', [req.params.id]);
    if (!before) throw new HttpError(404, 'Department not found.', 'not_found');

    const after = await one(
      'update departments set name = $2, code = $3 where id = $1 returning *',
      [before.id, input.name ?? before.name, (input.code ?? before.code).toUpperCase()],
    );
    await logAudit(null, {
      actorId: req.user.id,
      action: 'department.update',
      entityType: 'department',
      entityId: before.id,
      oldValue: { name: before.name, code: before.code },
      newValue: { name: after.name, code: after.code },
      ip: req.ip,
    });
    res.json({ department: after });
  }),
);

// ---------------------------------------------------------------- users

router.get(
  '/users',
  wrap(async (req, res) => {
    const { role, status, q } = req.query;
    const conditions = [];
    const params = [];
    const add = (template, value) => {
      params.push(value);
      conditions.push(template.replace('$?', `$${params.length}`));
    };
    if (role) add('u.role = $?', String(role));
    if (status) add('u.status = $?', String(status));
    if (q) {
      params.push(`%${q}%`);
      conditions.push(`(u.name ilike $${params.length} or u.email ilike $${params.length})`);
    }

    const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
    const users = await many(`${USER_SELECT} ${where} order by u.name limit 300`, params);
    res.json({ users });
  }),
);

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
  role: z.enum(['student', 'lecturer', 'admin']),
  department_id: z.string().uuid().nullable().optional(),
  staff_id: z.string().trim().max(40).optional(),
  matric_number: z.string().trim().max(40).optional(),
  program: z.string().trim().max(120).optional(),
  level: z.coerce.number().int().min(100).max(700).optional(),
});

router.post(
  '/users',
  wrap(async (req, res) => {
    const input = createUserSchema.parse(req.body);
    const email = input.email.toLowerCase();

    if (input.role === 'lecturer' && !input.staff_id) {
      throw new HttpError(400, 'A staff id is required for a lecturer.', 'staff_id_required');
    }
    if (input.role === 'student' && !input.matric_number) {
      throw new HttpError(400, 'A matric number is required for a student.', 'matric_required');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const user = await tx(async (client) => {
      const inserted = await client.query(
        `insert into users (name, email, password_hash, role, department_id, status, email_verified_at)
         values ($1, $2, $3, $4, $5, 'active', now())
         returning id, name, email, role, status`,
        [input.name, email, passwordHash, input.role, input.department_id ?? null],
      );
      const row = inserted.rows[0];

      if (input.role === 'student') {
        await client.query(
          `insert into students (user_id, matric_number, program, level) values ($1, $2, $3, $4)`,
          [row.id, input.matric_number, input.program ?? 'Unassigned', input.level ?? 100],
        );
      }
      if (input.role === 'lecturer') {
        await client.query(`insert into lecturers (user_id, staff_id, department_id) values ($1, $2, $3)`, [
          row.id,
          input.staff_id,
          input.department_id ?? null,
        ]);
      }

      await client.query(
        `insert into audit_logs (actor_id, action, entity_type, entity_id, new_value)
         values ($1, 'user.create', 'user', $2, $3)`,
        [req.user.id, row.id, JSON.stringify({ role: input.role, email })],
      );
      return row;
    });

    res.status(201).json({ user });
  }),
);

router.patch(
  '/users/:id',
  wrap(async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(120).optional(),
        role: z.enum(['student', 'lecturer', 'admin']).optional(),
        status: z.enum(['pending', 'active', 'suspended']).optional(),
        department_id: z.string().uuid().nullable().optional(),
        staff_id: z.string().trim().max(40).optional(),
        matric_number: z.string().trim().max(40).optional(),
        program: z.string().trim().max(120).optional(),
        level: z.coerce.number().int().min(100).max(700).optional(),
      })
      .parse(req.body);

    const before = await one('select * from users where id = $1', [req.params.id]);
    if (!before) throw new HttpError(404, 'User not found.', 'not_found');
    if (before.id === req.user.id && input.status === 'suspended') {
      throw new HttpError(400, 'You cannot suspend your own account.', 'self_suspend');
    }

    const after = await tx(async (client) => {
      const updated = await client.query(
        `update users set name = $2, role = $3, status = $4, department_id = $5, updated_at = now()
         where id = $1 returning *`,
        [
          before.id,
          input.name ?? before.name,
          input.role ?? before.role,
          input.status ?? before.status,
          input.department_id !== undefined ? input.department_id : before.department_id,
        ],
      );
      const row = updated.rows[0];

      if (row.role === 'lecturer') {
        const existing = await client.query('select 1 from lecturers where user_id = $1', [row.id]);
        if (!existing.rowCount) {
          if (!input.staff_id) throw new HttpError(400, 'A staff id is required to make this user a lecturer.', 'staff_id_required');
          await client.query('insert into lecturers (user_id, staff_id, department_id) values ($1, $2, $3)', [
            row.id,
            input.staff_id,
            row.department_id,
          ]);
        }
      }
      if (row.role === 'student') {
        const existing = await client.query('select 1 from students where user_id = $1', [row.id]);
        if (!existing.rowCount) {
          if (!input.matric_number) throw new HttpError(400, 'A matric number is required to make this user a student.', 'matric_required');
          await client.query('insert into students (user_id, matric_number, program, level) values ($1, $2, $3, $4)', [
            row.id,
            input.matric_number,
            input.program ?? 'Unassigned',
            input.level ?? 100,
          ]);
        }
      }

      await client.query(
        `insert into audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
         values ($1, 'user.update', 'user', $2, $3, $4)`,
        [
          req.user.id,
          row.id,
          JSON.stringify({ role: before.role, status: before.status, department_id: before.department_id }),
          JSON.stringify({ role: row.role, status: row.status, department_id: row.department_id }),
        ],
      );
      return row;
    });

    res.json({
      user: await one(`${USER_SELECT} where u.id = $1`, [after.id]),
    });
  }),
);

// ---------------------------------------------------------------- audit trail

router.get(
  '/audit',
  wrap(async (req, res) => {
    const entries = await auditTrail({
      entityType: req.query.entity_type ? String(req.query.entity_type) : undefined,
      entityId: req.query.entity_id ? String(req.query.entity_id) : undefined,
      actorId: req.query.actor_id ? String(req.query.actor_id) : undefined,
      from: req.query.from ? String(req.query.from) : undefined,
      to: req.query.to ? String(req.query.to) : undefined,
      limit: req.query.limit,
    });
    res.json({ entries });
  }),
);

// ---------------------------------------------------------------- settings

router.get(
  '/settings',
  wrap(async (req, res) => {
    res.json({ settings: await getSettings({ fresh: true }) });
  }),
);

router.put(
  '/settings',
  wrap(async (req, res) => {
    const input = z
      .object({
        warning_threshold: z.coerce.number().int().min(0).max(100).optional(),
        retention_days: z.coerce.number().int().min(1).max(3650).optional(),
        late_grace_minutes: z.coerce.number().int().min(0).max(120).optional(),
        qr_step_seconds: z.coerce.number().int().min(30).max(60).optional(),
      })
      .parse(req.body);

    const mapping = {
      warning_threshold: ['attendance.warning_threshold', input.warning_threshold],
      retention_days: ['retention.attendance_days', input.retention_days],
      late_grace_minutes: ['attendance.late_grace_minutes', input.late_grace_minutes],
      qr_step_seconds: ['checkin.qr_step_seconds', input.qr_step_seconds],
    };

    const before = await getSettings({ fresh: true });
    const applied = {};
    for (const [key, value] of Object.values(mapping)) {
      if (value !== undefined) {
        await saveSetting(key, value, req.user.id);
        applied[key] = value;
      }
    }

    await logAudit(null, {
      actorId: req.user.id,
      action: 'settings.update',
      entityType: 'app_settings',
      oldValue: before,
      newValue: applied,
      ip: req.ip,
    });

    res.json({ settings: await getSettings({ fresh: true }) });
  }),
);

router.post(
  '/retention/purge',
  wrap(async (req, res) => {
    const settings = await getSettings({ fresh: true });
    const result = await purgeExpiredAttendance({ retentionDays: settings.retentionDays, actorId: req.user.id });
    await logAudit(null, {
      actorId: req.user.id,
      action: 'retention.purge',
      entityType: 'app_settings',
      newValue: result,
      reason: `Retention policy: ${settings.retentionDays} days`,
      ip: req.ip,
    });
    res.json(result);
  }),
);

export default router;
