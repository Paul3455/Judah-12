import express from 'express';
import { many, one, query } from '../db.js';
import { HttpError, wrap } from '../middleware/errors.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get(
  '/',
  wrap(async (req, res) => {
    const notifications = await many(
      `select id, type, title, body, data, read_at, created_at
       from notifications where user_id = $1
       order by created_at desc limit 50`,
      [req.user.id],
    );
    const unread = await one('select count(*)::int as count from notifications where user_id = $1 and read_at is null', [
      req.user.id,
    ]);
    res.json({ notifications, unread: unread?.count ?? 0 });
  }),
);

router.post(
  '/:id/read',
  wrap(async (req, res) => {
    const updated = await query(
      'update notifications set read_at = now() where id = $1 and user_id = $2 returning id',
      [req.params.id, req.user.id],
    );
    if (!updated.rowCount) throw new HttpError(404, 'Notification not found.', 'not_found');
    res.json({ ok: true });
  }),
);

router.post(
  '/read-all',
  wrap(async (req, res) => {
    await query('update notifications set read_at = now() where user_id = $1 and read_at is null', [req.user.id]);
    res.json({ ok: true });
  }),
);

export default router;
