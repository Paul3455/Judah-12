import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { one, pool, tx } from '../src/db.js';

const DEMO_PASSWORD = 'Campus123!';
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);
const atUtc = (date, hour, minute = 0) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute));

/** Monday of the week containing `date` (UTC). */
function mondayOf(date) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay();
  copy.setUTCDate(copy.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return copy;
}

const STUDENTS = [
  ['Ada Obi', 'ada.student@campus.edu', 'CSC/22/1043', 'Computer Science', 300],
  ['Bola Adeyemi', 'bola.student@campus.edu', 'CSC/22/1051', 'Computer Science', 300],
  ['Chika Eze', 'chika.student@campus.edu', 'CSC/22/1067', 'Computer Science', 300],
  ['David Musa', 'david.student@campus.edu', 'CSC/22/1072', 'Computer Science', 300],
  ['Esther Nwosu', 'esther.student@campus.edu', 'CSC/22/1088', 'Computer Science', 300],
  ['Femi Balogun', 'femi.student@campus.edu', 'CSC/22/1094', 'Computer Science', 300],
  ['Grace Umar', 'grace.student@campus.edu', 'CSC/22/1101', 'Computer Science', 300],
  ['Hassan Ali', 'hassan.student@campus.edu', 'ENG/21/2210', 'Mechanical Engineering', 200],
  ['Ifeoma Paul', 'ifeoma.student@campus.edu', 'ENG/21/2224', 'Mechanical Engineering', 200],
  ['Jide Ojo', 'jide.student@campus.edu', 'BUS/23/3301', 'Business Administration', 100],
];

async function main() {
  if (!config.seedDemo) {
    console.log('[seed] SEED_DEMO is not enabled, skipping demo data.');
    await pool.end();
    return;
  }

  const existing = await one('select count(*)::int as count from users');
  if (existing.count > 0) {
    console.log('[seed] users already exist, skipping demo data.');
    await pool.end();
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  await tx(async (client) => {
    // ------------------------------------------------------------ departments
    const departmentIds = {};
    for (const [name, code] of [
      ['Computer Science', 'CSC'],
      ['Engineering', 'ENG'],
      ['Business Administration', 'BUS'],
    ]) {
      const result = await client.query('insert into departments (name, code) values ($1, $2) returning id', [
        name,
        code,
      ]);
      departmentIds[code] = result.rows[0].id;
    }

    const makeUser = async (name, email, role, departmentId) => {
      const result = await client.query(
        `insert into users (name, email, password_hash, role, department_id, status, email_verified_at)
         values ($1, $2, $3, $4, $5, 'active', now())
         returning id`,
        [name, email, passwordHash, role, departmentId],
      );
      return result.rows[0].id;
    };

    const adminId = await makeUser('Ngozi Eze', 'admin@campus.edu', 'admin', departmentIds.CSC);
    const okaforId = await makeUser('Dr. Chidi Okafor', 'okafor@campus.edu', 'lecturer', departmentIds.CSC);
    const belloId = await makeUser('Dr. Amina Bello', 'bello@campus.edu', 'lecturer', departmentIds.ENG);

    await client.query(
      `insert into lecturers (user_id, staff_id, department_id) values
         ($1, 'CSC-1042', $2), ($3, 'ENG-2201', $4)`,
      [okaforId, departmentIds.CSC, belloId, departmentIds.ENG],
    );

    const studentIds = [];
    for (const [name, email, matric, program, level] of STUDENTS) {
      const id = await makeUser(name, email, 'student', program === 'Computer Science' ? departmentIds.CSC : null);
      await client.query('insert into students (user_id, matric_number, program, level) values ($1, $2, $3, $4)', [
        id,
        matric,
        program,
        level,
      ]);
      studentIds.push(id);
    }

    // ------------------------------------------------------------ courses
    const makeCourse = async (course) => {
      const result = await client.query(
        `insert into courses (code, title, department_id, lecturer_id, semester, schedule, venue,
                              geofence_enabled, geofence_lat, geofence_lng, geofence_radius_m)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         returning id`,
        [
          course.code,
          course.title,
          course.departmentId,
          course.lecturerId,
          '2026/2027-1',
          course.schedule,
          course.venue,
          Boolean(course.geofence?.enabled),
          course.geofence?.lat ?? null,
          course.geofence?.lng ?? null,
          course.geofence?.radiusM ?? 150,
        ],
      );
      return result.rows[0].id;
    };

    const csc301 = await makeCourse({
      code: 'CSC 301',
      title: 'Data Structures & Algorithms',
      departmentId: departmentIds.CSC,
      lecturerId: okaforId,
      schedule: 'Mon 10:00-12:00',
      venue: 'Lecture Theatre 2',
      geofence: { enabled: false, lat: 6.5244, lng: 3.3792, radiusM: 150 },
    });
    const csc305 = await makeCourse({
      code: 'CSC 305',
      title: 'Database Systems',
      departmentId: departmentIds.CSC,
      lecturerId: okaforId,
      schedule: 'Tue 14:00-16:00',
      venue: 'Computer Lab 4',
      geofence: { enabled: false, lat: 6.5244, lng: 3.3792, radiusM: 120 },
    });
    const eng210 = await makeCourse({
      code: 'ENG 210',
      title: 'Thermodynamics',
      departmentId: departmentIds.ENG,
      lecturerId: belloId,
      schedule: 'Wed 09:00-11:00',
      venue: 'Engineering Hall A',
      geofence: { enabled: false },
    });

    const enroll = async (courseId, ids) => {
      for (const studentId of ids) {
        await client.query(
          `insert into enrollments (student_id, course_id, semester) values ($1, $2, '2026/2027-1')
           on conflict do nothing`,
          [studentId, courseId],
        );
      }
    };
    await enroll(csc301, studentIds.slice(0, 7));
    await enroll(csc305, studentIds.slice(0, 7));
    await enroll(eng210, [studentIds[7], studentIds[8], studentIds[0], studentIds[1]]);

    // ------------------------------------------------------------ sessions
    const makeSession = async ({ courseId, lecturerId, start, end, venue, status, requireGeofence = false }) => {
      const opens = new Date(start.getTime() - 15 * MINUTE_MS);
      const closes = end;
      const result = await client.query(
        `insert into sessions (course_id, lecturer_id, date, start_time, end_time, venue,
                               check_in_opens_at, check_in_closes_at, status, require_geofence)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning id`,
        [
          courseId,
          lecturerId,
          start.toISOString().slice(0, 10),
          start.toISOString(),
          end.toISOString(),
          venue,
          opens.toISOString(),
          closes.toISOString(),
          status,
          requireGeofence,
        ],
      );
      return result.rows[0].id;
    };

    const monday = mondayOf(today);
    const csc301Sessions = [];
    for (let week = 5; week >= 1; week -= 1) {
      const start = atUtc(addDays(monday, -7 * week), 10);
      csc301Sessions.push({
        id: await makeSession({
          courseId: csc301,
          lecturerId: okaforId,
          start,
          end: new Date(start.getTime() + 2 * HOUR_MS),
          venue: 'Lecture Theatre 2',
          status: 'closed',
        }),
        start,
      });
    }

    const csc305Sessions = [];
    for (let week = 4; week >= 1; week -= 1) {
      const start = atUtc(addDays(monday, -7 * week + 1), 14);
      csc305Sessions.push({
        id: await makeSession({
          courseId: csc305,
          lecturerId: okaforId,
          start,
          end: new Date(start.getTime() + 2 * HOUR_MS),
          venue: 'Computer Lab 4',
          status: 'closed',
        }),
        start,
      });
    }

    const engStart = atUtc(addDays(monday, -7 * 2 + 2), 9);
    const engSessionId = await makeSession({
      courseId: eng210,
      lecturerId: belloId,
      start: engStart,
      end: new Date(engStart.getTime() + 2 * HOUR_MS),
      venue: 'Engineering Hall A',
      status: 'closed',
    });

    // Live session for the demo: check-in is open right now. Starting it a
    // couple of minutes ago means a check-in shortly after boot is "present";
    // after the late grace it becomes "late", which is also correct.
    const liveStart = new Date(now.getTime() - 2 * MINUTE_MS);
    const liveEnd = new Date(now.getTime() + 58 * MINUTE_MS);
    const liveSessionId = await makeSession({
      courseId: csc301,
      lecturerId: okaforId,
      start: liveStart,
      end: liveEnd,
      venue: 'Lecture Theatre 2',
      status: 'open',
    });
    await client.query(
      `update sessions set check_in_opens_at = $2, check_in_closes_at = $3 where id = $1`,
      [liveSessionId, new Date(now.getTime() - 12 * MINUTE_MS).toISOString(), new Date(now.getTime() + 50 * MINUTE_MS).toISOString()],
    );

    // Tomorrow's tutorial, still scheduled.
    const tomorrow = addDays(today, 1);
    const scheduledStart = atUtc(tomorrow, 14);
    await makeSession({
      courseId: csc305,
      lecturerId: okaforId,
      start: scheduledStart,
      end: new Date(scheduledStart.getTime() + 2 * HOUR_MS),
      venue: 'Computer Lab 4',
      status: 'scheduled',
    });

    // ------------------------------------------------------------ attendance history
    const insertRecord = async (sessionId, studentId, index, sessionIndex, courseHint) => {
      const session = courseHint === 'csc305' ? csc305Sessions[sessionIndex] : csc301Sessions[sessionIndex];
      const start = session.start;

      let status = 'present';
      if (courseHint === 'csc305') {
        if (index === 0) {
          status = ['absent', 'absent', 'late', 'present'][sessionIndex] ?? 'present';
        } else if ((index + sessionIndex) % 11 === 0) {
          status = 'absent';
        } else if ((index + sessionIndex) % 7 === 0) {
          status = 'late';
        }
      } else if ((index + sessionIndex * 3) % 13 === 0) {
        status = 'absent';
      } else if ((index + sessionIndex) % 6 === 0) {
        status = 'late';
      } else if ((index + sessionIndex) % 17 === 0) {
        status = 'excused';
      }

      const checkedInAt =
        status === 'absent'
          ? null
          : new Date(start.getTime() + (status === 'late' ? 19 : 2 + (index % 5)) * MINUTE_MS);
      const distance = 18 + ((index * 13 + sessionIndex * 7) % 70);

      await client.query(
        `insert into attendance_records
           (session_id, student_id, status, checked_in_at, check_in_method,
            location_verified, location_distance_m, device_id_hash, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
         on conflict (session_id, student_id) do nothing`,
        [
          session.id,
          studentId,
          status,
          checkedInAt ? checkedInAt.toISOString() : null,
          status === 'absent' || status === 'excused' ? null : index % 2 === 0 ? 'qr' : 'code',
          status === 'present' || status === 'late' ? true : null,
          status === 'present' || status === 'late' ? distance : null,
          `seed-device-${index}`,
          checkedInAt ? checkedInAt.toISOString() : start.toISOString(),
        ],
      );
    };

    for (let sessionIndex = 0; sessionIndex < csc301Sessions.length; sessionIndex += 1) {
      for (let index = 0; index < 7; index += 1) {
        await insertRecord(csc301Sessions[sessionIndex].id, studentIds[index], index, sessionIndex, 'csc301');
      }
    }
    for (let sessionIndex = 0; sessionIndex < csc305Sessions.length; sessionIndex += 1) {
      for (let index = 0; index < 7; index += 1) {
        await insertRecord(csc305Sessions[sessionIndex].id, studentIds[index], index, sessionIndex, 'csc305');
      }
    }

    // ENG 210 held one lecture; its four students attended.
    const engStudents = [studentIds[7], studentIds[8], studentIds[0], studentIds[1]];
    for (let index = 0; index < engStudents.length; index += 1) {
      const late = index === 2;
      await client.query(
        `insert into attendance_records
           (session_id, student_id, status, checked_in_at, check_in_method,
            location_verified, location_distance_m, device_id_hash, created_at, updated_at)
         values ($1, $2, $3, $4, 'qr', true, $5, $6, $4, $4)
         on conflict (session_id, student_id) do nothing`,
        [
          engSessionId,
          engStudents[index],
          late ? 'late' : 'present',
          new Date(engStart.getTime() + (late ? 18 : 3 + index) * MINUTE_MS).toISOString(),
          24 + index * 11,
          `seed-device-eng-${index}`,
        ],
      );
    }

    // ------------------------------------------------------------ notifications
    const notify = (userId, type, title, body) =>
      client.query('insert into notifications (user_id, type, title, body) values ($1, $2, $3, $4)', [
        userId,
        type,
        title,
        body,
      ]);

    await notify(
      studentIds[0],
      'low_attendance',
      'Low attendance: CSC 305',
      'Your attendance in CSC 305 is below the 75% threshold. Speak to Dr. Chidi Okafor if this is incorrect.',
    );
    await notify(
      studentIds[0],
      'missed_class',
      'Marked absent: CSC 301',
      'You were marked absent for a CSC 301 lecture. If this is wrong, contact your lecturer.',
    );

    // ------------------------------------------------------------ audit note
    await client.query(
      `insert into audit_logs (actor_id, action, entity_type, entity_id, new_value, reason)
       values ($1, 'system.seed', 'app_settings', null, $2, 'Demo data seeded for the pilot environment')`,
      [adminId, JSON.stringify({ students: studentIds.length, courses: 3 })],
    );
  });

  console.log(`[seed] demo data ready. Sign in with the demo accounts below (password: ${DEMO_PASSWORD})`);
  console.log('[seed]   admin@campus.edu    okafor@campus.edu    ada.student@campus.edu');
  await pool.end();
}

main().catch(async (err) => {
  console.error('[seed] failed:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
