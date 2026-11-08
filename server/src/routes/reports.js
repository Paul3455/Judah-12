import express from 'express';
import { z } from 'zod';
import { wrap } from '../middleware/errors.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { analytics, reportRows } from '../services/reports.js';
import { ATTENDANCE_COLUMNS, toCsv, toXlsx } from '../lib/exports.js';

const router = express.Router();
router.use(authenticate, requireRole('lecturer', 'admin'));

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

const filterSchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  department_id: z.string().uuid().optional(),
  course_id: z.string().uuid().optional(),
  lecturer_id: z.string().uuid().optional(),
  student_id: z.string().uuid().optional(),
  session_id: z.string().uuid().optional(),
  status: z.enum(['present', 'late', 'absent', 'excused']).optional(),
});

function parseFilters(raw) {
  const input = filterSchema.parse(raw);
  return {
    from: input.from,
    to: input.to,
    departmentId: input.department_id,
    courseId: input.course_id,
    lecturerId: input.lecturer_id,
    studentId: input.student_id,
    sessionId: input.session_id,
    status: input.status,
  };
}

/** Lecturers only ever see their own courses; admins see everything. */
const scopeFor = (user) => (user.role === 'lecturer' ? { scopeLecturerId: user.id } : {});

router.get(
  '/summary',
  wrap(async (req, res) => {
    const filters = parseFilters(req.query);
    res.json(await analytics(filters, scopeFor(req.user)));
  }),
);

router.get(
  '/export',
  wrap(async (req, res) => {
    const format = String(req.query.format || 'csv').toLowerCase();
    if (!['csv', 'xlsx'].includes(format)) {
      return res.status(400).json({ error: { code: 'bad_format', message: 'format must be csv or xlsx' } });
    }

    const filters = parseFilters(req.query);
    const rows = await reportRows(filters, scopeFor(req.user));
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `campuscheck-attendance-${stamp}.${format}`;

    if (format === 'csv') {
      const csv = toCsv(ATTENDANCE_COLUMNS, rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csv);
    }

    const buffer = await toXlsx(ATTENDANCE_COLUMNS, rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  }),
);

export default router;
