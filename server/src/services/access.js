import { one } from '../db.js';
import { HttpError } from '../middleware/errors.js';

const COURSE_SQL = `
  select c.*, d.name as department_name, d.code as department_code, u.name as lecturer_name,
         (select count(*)::int from enrollments e where e.course_id = c.id) as enrolled_count,
         (select count(*)::int from sessions s where s.course_id = c.id) as session_count
  from courses c
  join departments d on d.id = c.department_id
  left join users u on u.id = c.lecturer_id
  where c.id = $1
`;

const SESSION_SQL = `
  select s.*, c.code as course_code, c.title as course_title, c.semester, c.lecturer_id,
         c.geofence_lat, c.geofence_lng, c.geofence_radius_m,
         u.name as lecturer_name,
         (select count(*)::int from enrollments e where e.course_id = s.course_id) as enrolled_count
  from sessions s
  join courses c on c.id = s.course_id
  left join users u on u.id = s.lecturer_id
  where s.id = $1
`;

export async function findCourse(courseId) {
  return one(COURSE_SQL, [courseId]);
}

export async function findSession(sessionId) {
  return one(SESSION_SQL, [sessionId]);
}

/**
 * Returns the course if the caller may see it; 404 otherwise (never 403, so
 * ids of other lecturers' objects are not confirmed to exist).
 */
export async function courseForUser(user, courseId, { write = false } = {}) {
  const course = await findCourse(courseId);
  if (!course) throw new HttpError(404, 'Course not found.', 'not_found');
  if (user.role === 'admin') return course;
  if (user.role === 'lecturer' && course.lecturer_id === user.id) return course;
  if (!write && user.role === 'student') {
    const enrolled = await one('select 1 from enrollments where course_id = $1 and student_id = $2', [
      courseId,
      user.id,
    ]);
    if (enrolled) return course;
  }
  throw new HttpError(404, 'Course not found.', 'not_found');
}

export async function sessionForUser(user, sessionId, { write = false } = {}) {
  const session = await findSession(sessionId);
  if (!session) throw new HttpError(404, 'Session not found.', 'not_found');
  if (user.role === 'admin') return session;
  if (user.role === 'lecturer' && session.lecturer_id === user.id) return session;
  if (!write && user.role === 'student') {
    const enrolled = await one('select 1 from enrollments where course_id = $1 and student_id = $2', [
      session.course_id,
      user.id,
    ]);
    if (enrolled) return session;
  }
  throw new HttpError(404, 'Session not found.', 'not_found');
}

export async function isEnrolled(studentId, courseId) {
  return Boolean(
    await one('select 1 from enrollments where course_id = $1 and student_id = $2', [courseId, studentId]),
  );
}
