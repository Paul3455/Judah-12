import express from 'express';
import { z } from 'zod';
import { wrap } from '../middleware/errors.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { sessionForUser } from '../services/access.js';
import {
  checkIn,
  markAbsentees,
  overrideRecord,
  studentHistory,
  studentSummary,
} from '../services/attendance.js';

const router = express.Router();
router.use(authenticate);

const checkInLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  key: (req) => `checkin:${req.user?.id ?? req.ip}`,
  message: 'Too many check-in attempts. Wait a minute and try again.',
});

const checkInSchema = z.object({
  session_id: z.string().uuid().optional(),
  qr_payload: z.string().trim().max(400).optional(),
  code: z.string().trim().max(12).optional(),
  device_id: z.string().trim().min(8).max(128).optional(),
  captured_at: z.string().trim().optional(),
  location: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .nullable()
    .optional(),
});

router.post(
  '/check-in',
  requireRole('student'),
  checkInLimiter,
  wrap(async (req, res) => {
    const input = checkInSchema.parse(req.body);
    const result = await checkIn({ student: req.user, input, ip: req.ip });
    res.status(201).json(result);
  }),
);

router.get(
  '/me',
  requireRole('student'),
  wrap(async (req, res) => {
    const courseId = req.query.course_id ? String(req.query.course_id) : null;
    const records = await studentHistory(req.user.id, { courseId });
    res.json({ records });
  }),
);

router.get(
  '/me/summary',
  requireRole('student'),
  wrap(async (req, res) => {
    res.json(await studentSummary(req.user.id));
  }),
);

router.patch(
  '/:id',
  requireRole('lecturer', 'admin'),
  wrap(async (req, res) => {
    const input = z
      .object({
        status: z.enum(['present', 'late', 'absent', 'excused']),
        reason: z.string().trim().min(4, 'Give a short reason for the correction.').max(500),
      })
      .parse(req.body);

    const record = await overrideRecord({
      actor: req.user,
      recordId: req.params.id,
      status: input.status,
      reason: input.reason,
      ip: req.ip,
    });
    res.json({ record });
  }),
);

router.post(
  '/sessions/:id/mark-absent',
  requireRole('lecturer', 'admin'),
  wrap(async (req, res) => {
    const session = await sessionForUser(req.user, req.params.id, { write: true });
    const { created } = await markAbsentees(session.id, req.user.id, req.ip);
    res.json({ marked_absent: created.length });
  }),
);

export default router;
