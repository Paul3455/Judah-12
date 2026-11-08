import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { pool, one } from './db.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { corsForWeb, securityHeaders } from './middleware/auth.js';

import authRoutes from './routes/auth.js';
import courseRoutes from './routes/courses.js';
import sessionRoutes from './routes/sessions.js';
import attendanceRoutes from './routes/attendance.js';
import timetableRoutes from './routes/timetable.js';
import reportRoutes from './routes/reports.js';
import adminRoutes from './routes/admin.js';
import notificationRoutes from './routes/notifications.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(securityHeaders);
app.use(corsForWeb);
app.use(express.json({ limit: '128kb' }));
app.use(cookieParser());

app.get('/api', (req, res) => {
  res.json({
    name: 'CampusCheck API',
    version: '1.0.0',
    docs: 'docs/API.md',
    endpoints: [
      '/api/auth',
      '/api/timetable',
      '/api/courses',
      '/api/sessions',
      '/api/attendance',
      '/api/reports',
      '/api/admin',
      '/api/notifications',
    ],
  });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime_s: Math.round(process.uptime()) }));

app.get(
  '/api/ready',
  async (req, res) => {
    try {
      await one('select 1 as ok');
      res.json({ status: 'ready' });
    } catch (err) {
      res.status(503).json({ status: 'unavailable', reason: err.message });
    }
  },
);

app.use('/api/auth', authRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

app.use(notFound);
app.use(errorHandler);

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`[api] CampusCheck API listening on 0.0.0.0:${config.port} (${config.env})`);
  if (!config.isProd) {
    console.log('[api] development settings: emails log to stdout, verification links returned in API responses');
  }
});

async function shutdown(signal) {
  console.log(`[api] ${signal} received, shutting down`);
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
