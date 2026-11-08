import express from 'express';
import { many } from '../db.js';
import { wrap } from '../middleware/errors.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Monday 00:00 UTC of the week containing `date`. */
function startOfWeek(date) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay(); // 0 = Sunday
  const delta = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + delta);
  return copy;
}

/** Parses timetable strings like "Mon 10:00-12:00" into a weekly slot. */
function parseSchedule(schedule) {
  const match = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s+(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/i.exec(
    schedule || '',
  );
  if (!match) return null;
  const [, dayName, startHour, startMinute, endHour, endMinute] = match;
  const dayIndex = DAY_NAMES.findIndex((name) => name.toLowerCase() === dayName.slice(0, 3).toLowerCase());
  if (dayIndex < 0) return null;
  return {
    dayIndex,
    start: `${startHour.padStart(2, '0')}:${startMinute}`,
    end: `${endHour.padStart(2, '0')}:${endMinute}`,
  };
}

router.get(
  '/',
  requireRole('student'),
  wrap(async (req, res) => {
    const weekStart = startOfWeek(req.query.week ? new Date(`${req.query.week}T00:00:00Z`) : new Date());
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const courses = await many(
      `select c.id, c.code, c.title, c.schedule, c.venue, c.semester, u.name as lecturer_name
       from enrollments e
       join courses c on c.id = e.course_id
       left join users u on u.id = c.lecturer_id
       where e.student_id = $1
       order by c.code`,
      [req.user.id],
    );

    const sessions = await many(
      `select s.id, s.date, s.start_time, s.end_time, s.venue, s.status,
              c.code as course_code, c.title as course_title
       from sessions s
       join courses c on c.id = s.course_id
       join enrollments e on e.course_id = c.id and e.student_id = $1
       where s.date >= $2::date and s.date < $3::date
       order by s.start_time`,
      [req.user.id, weekStart.toISOString().slice(0, 10), weekEnd.toISOString().slice(0, 10)],
    );

    const days = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const day = new Date(weekStart.getTime() + offset * 24 * 60 * 60 * 1000);
      const dateKey = day.toISOString().slice(0, 10);
      const items = [];

      for (const course of courses) {
        const slot = parseSchedule(course.schedule);
        if (slot && slot.dayIndex === day.getUTCDay()) {
          items.push({
            kind: 'class',
            course_code: course.code,
            course_title: course.title,
            venue: course.venue,
            start: slot.start,
            end: slot.end,
            lecturer_name: course.lecturer_name,
          });
        }
      }

      for (const session of sessions) {
        if (session.date.toISOString?.().slice(0, 10) === dateKey || String(session.date).slice(0, 10) === dateKey) {
          items.push({
            kind: 'session',
            session_id: session.id,
            course_code: session.course_code,
            course_title: session.course_title,
            venue: session.venue,
            start: new Date(session.start_time).toISOString().slice(11, 16),
            end: new Date(session.end_time).toISOString().slice(11, 16),
            status: session.status,
          });
        }
      }

      items.sort((a, b) => a.start.localeCompare(b.start));
      days.push({ date: dateKey, weekday: DAY_NAMES[day.getUTCDay()], items });
    }

    res.json({
      week_start: weekStart.toISOString().slice(0, 10),
      days,
      courses,
    });
  }),
);

export default router;
