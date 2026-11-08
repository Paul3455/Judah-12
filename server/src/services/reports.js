import { many, one } from '../db.js';

const BASE_FROM = `
  from attendance_records r
  join sessions s on s.id = r.session_id
  join courses c on c.id = s.course_id
  join users u on u.id = r.student_id
  left join students st on st.user_id = u.id
  left join users lec on lec.id = c.lecturer_id
  left join departments d on d.id = c.department_id
`;

/**
 * Builds the WHERE clause for report queries from validated filters.
 * `scopeLecturerId` restricts a lecturer to their own courses (never trusted
 * from the client, always taken from the session).
 */
export function buildFilter(filters = {}, { scopeLecturerId = null } = {}) {
  const conditions = [];
  const params = [];
  const add = (template, value) => {
    params.push(value);
    conditions.push(template.replace('$?', `$${params.length}`));
  };

  if (filters.from) add('s.date >= $?', filters.from);
  if (filters.to) add('s.date <= $?', filters.to);
  if (filters.departmentId) add('c.department_id = $?', filters.departmentId);
  if (filters.courseId) add('c.id = $?', filters.courseId);
  if (filters.lecturerId) add('c.lecturer_id = $?', filters.lecturerId);
  if (filters.studentId) add('r.student_id = $?', filters.studentId);
  if (filters.sessionId) add('r.session_id = $?', filters.sessionId);
  if (filters.status) add('r.status = $?', filters.status);
  if (scopeLecturerId) add('c.lecturer_id = $?', scopeLecturerId);

  return { where: conditions.length ? `where ${conditions.join(' and ')}` : '', params };
}

const rate = (present, late, total) => (total ? Math.round(((present + late) / total) * 100) : null);

export async function analytics(filters, scope = {}) {
  const { where, params } = buildFilter(filters, scope);

  const [overallRow] = await many(
    `select count(*)::int as records,
            count(*) filter (where r.status = 'present')::int as present,
            count(*) filter (where r.status = 'late')::int as late,
            count(*) filter (where r.status = 'absent')::int as absent,
            count(*) filter (where r.status = 'excused')::int as excused,
            count(*) filter (where r.flagged)::int as flagged,
            count(distinct s.id)::int as sessions,
            count(distinct c.id)::int as courses,
            count(distinct r.student_id)::int as students
     ${BASE_FROM} ${where}`,
    params,
  );

  const byCourse = await many(
    `select c.id, c.code, c.title, d.name as department, lec.name as lecturer,
            count(*)::int as records,
            count(*) filter (where r.status = 'present')::int as present,
            count(*) filter (where r.status = 'late')::int as late,
            count(*) filter (where r.status = 'absent')::int as absent,
            count(distinct s.id)::int as sessions,
            count(*) filter (where r.flagged)::int as flagged
     ${BASE_FROM} ${where}
     group by c.id, c.code, c.title, d.name, lec.name
     order by c.code`,
    params,
  );

  const byDepartment = await many(
    `select d.id, d.name, d.code,
            count(*)::int as records,
            count(*) filter (where r.status in ('present','late'))::int as attended,
            count(*) filter (where r.status = 'absent')::int as absent
     ${BASE_FROM} ${where}
     group by d.id, d.name, d.code
     order by d.name`,
    params,
  );

  const byLecturer = await many(
    `select lec.id, lec.name,
            count(*)::int as records,
            count(*) filter (where r.status in ('present','late'))::int as attended,
            count(*) filter (where r.status = 'absent')::int as absent
     ${BASE_FROM} ${where}
     group by lec.id, lec.name
     order by lec.name`,
    params,
  );

  const byStudent = await many(
    `select u.id, u.name, st.matric_number,
            count(*)::int as records,
            count(*) filter (where r.status in ('present','late'))::int as attended,
            count(*) filter (where r.status = 'absent')::int as absent,
            count(*) filter (where r.flagged)::int as flagged
     ${BASE_FROM} ${where}
     group by u.id, u.name, st.matric_number
     order by u.name
     limit 200`,
    params,
  );

  const byDate = await many(
    `select s.date, count(*)::int as records,
            count(*) filter (where r.status in ('present','late'))::int as attended
     ${BASE_FROM} ${where}
     group by s.date
     order by s.date`,
    params,
  );

  return {
    overall: {
      ...overallRow,
      attendance_rate: rate(overallRow.present, overallRow.late, overallRow.records),
    },
    by_course: byCourse.map((row) => ({ ...row, attendance_rate: rate(row.present, row.late, row.records) })),
    by_department: byDepartment.map((row) => ({
      ...row,
      attendance_rate: rate(row.attended, 0, row.records),
    })),
    by_lecturer: byLecturer.map((row) => ({ ...row, attendance_rate: rate(row.attended, 0, row.records) })),
    by_student: byStudent.map((row) => ({ ...row, attendance_rate: rate(row.attended, 0, row.records) })),
    by_date: byDate.map((row) => ({ ...row, attendance_rate: rate(row.attended, 0, row.records) })),
  };
}

export async function reportRows(filters, scope = {}) {
  const { where, params } = buildFilter(filters, scope);
  return many(
    `select s.date::text as date, c.code as course_code, c.title as course_title,
            d.name as department, lec.name as lecturer,
            u.name as student, st.matric_number,
            r.status, r.checked_in_at, r.check_in_method,
            r.location_verified, r.location_distance_m,
            r.flag_reason, r.override_reason,
            rec.name as recorded_by
     ${BASE_FROM}
     left join users rec on rec.id = r.recorded_by
     ${where}
     order by s.date desc, c.code, u.name
     limit 50000`,
    params,
  );
}

export async function auditTrail({ entityType, entityId, actorId, from, to, limit = 200 }) {
  const conditions = [];
  const params = [];
  const add = (template, value) => {
    params.push(value);
    conditions.push(template.replace('$?', `$${params.length}`));
  };
  if (entityType) add('a.entity_type = $?', entityType);
  if (entityId) add('a.entity_id = $?', entityId);
  if (actorId) add('a.actor_id = $?', actorId);
  if (from) add('a.created_at >= $?', from);
  if (to) add('a.created_at <= $?', `${to} 23:59:59`);

  params.push(Math.min(500, Number(limit) || 200));
  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';

  return many(
    `select a.id, a.action, a.entity_type, a.entity_id, a.old_value, a.new_value,
            a.reason, a.ip, a.created_at, u.name as actor_name, u.email as actor_email
     from audit_logs a
     left join users u on u.id = a.actor_id
     ${where}
     order by a.created_at desc
     limit $${params.length}`,
    params,
  );
}

export async function purgeExpiredAttendance({ retentionDays, actorId }) {
  const days = Math.max(1, Number(retentionDays) || 365);
  const deleted = await one(
    `with removed as (
       delete from attendance_records r
       using sessions s
       where s.id = r.session_id and s.start_time < now() - ($1 || ' days')::interval
       returning r.id
     )
     select count(*)::int as count from removed`,
    [String(days)],
  );

  // Records that survive keep their status but lose the location detail once
  // the session is older than the retention period.
  const scrubbed = await one(
    `with updated as (
       update attendance_records r
       set location_distance_m = null, location_verified = null
       from sessions s
       where s.id = r.session_id
         and s.start_time < now() - ($1 || ' days')::interval
         and r.location_distance_m is not null
       returning r.id
     )
     select count(*)::int as count from updated`,
    [String(days)],
  );

  return {
    deleted: deleted?.count ?? 0,
    location_fields_scrubbed: scrubbed?.count ?? 0,
    retention_days: days,
  };
}
