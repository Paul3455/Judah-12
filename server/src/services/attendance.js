import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { many, one, tx } from '../db.js';
import { HttpError } from '../middleware/errors.js';
import { logAudit, diff } from '../lib/audit.js';
import { notify, notifyMany } from '../lib/notify.js';
import { haversineMeters, isValidCoordinate } from '../lib/geo.js';
import {
  deriveCode,
  buildPayload,
  verifyPayload,
  verifyCode,
  acceptedStepsFor,
  timeStep,
  stepExpiry,
} from '../lib/qr.js';
import { getSettings } from '../lib/settings.js';
import { findSession, isEnrolled } from './access.js';

export const ATTENDANCE_STATUSES = ['present', 'late', 'absent', 'excused'];
const COUNTED_AS_ATTENDED = new Set(['present', 'late']);

export const hashDevice = (deviceId) =>
  crypto.createHmac('sha256', config.deviceSecret).update(String(deviceId)).digest('hex').slice(0, 32);

const iso = (value) => (value ? new Date(value).toISOString() : null);
const timeLabel = (value) =>
  new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

// ---------------------------------------------------------------- dynamic code

/** Current QR payload, 6-digit code and expiry for a session. */
export async function currentCode(session) {
  const settings = await getSettings();
  const stepSeconds = settings.qrStepSeconds;
  const now = Date.now();
  const step = timeStep(now, stepSeconds);
  const expiresAt = stepExpiry(step, stepSeconds);

  const payload = buildPayload(config.qrSecret, session.id, step);
  const code6 = deriveCode(session.qr_secret, session.id, step);
  const qrImage = await QRCode.toDataURL(payload, {
    margin: 1,
    width: 520,
    errorCorrectionLevel: 'M',
    color: { dark: '#0b1020', light: '#ffffff' },
  });

  return {
    session_id: session.id,
    step,
    step_seconds: stepSeconds,
    expires_at: expiresAt.toISOString(),
    seconds_remaining: Math.max(0, Math.round((expiresAt.getTime() - now) / 1000)),
    code6,
    qr_payload: payload,
    qr_image: qrImage,
  };
}

// ---------------------------------------------------------------- check-in

function parseCapturedAt(raw) {
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  if (!Number.isFinite(ms)) return null;
  const now = Date.now();
  if (ms > now + 60_000) return null; // client clock ahead: ignore
  if (ms < now - config.defaults.offlineSyncGraceMinutes * 60_000) return null; // too old to trust
  return ms;
}

function statusFor(session, at, settings) {
  const lateAfter = new Date(session.start_time).getTime() + settings.lateGraceMinutes * 60_000;
  return at.getTime() > lateAfter ? 'late' : 'present';
}

function codeError(reason) {
  if (reason === 'expired') {
    return new HttpError(
      422,
      'That code has expired. Ask your lecturer for the current one — it changes every minute.',
      'code_expired',
    );
  }
  return new HttpError(422, 'That check-in code is not valid.', 'invalid_code');
}

async function resolveTarget({ qrPayload, code, capturedAtMs }, settings) {
  const acceptedSteps = acceptedStepsFor({
    stepSeconds: settings.qrStepSeconds,
    capturedAtMs,
    graceMinutes: config.defaults.offlineSyncGraceMinutes,
  });

  if (qrPayload) {
    const parsed = verifyPayload(config.qrSecret, qrPayload, { acceptedSteps });
    if (!parsed.ok) throw codeError(parsed.reason);
    const session = await findSession(parsed.sessionId);
    if (!session) throw new HttpError(422, 'This check-in code is no longer valid.', 'invalid_code');
    return { session, method: 'qr' };
  }

  if (code) {
    // Candidate sessions: open now, or recently open (a queued offline check-in
    // may arrive after the lecturer closed the session).
    const candidates = await many(
      `select id, qr_secret from sessions
       where check_in_closes_at > now() - interval '3 hours'
         and check_in_opens_at < now() + interval '1 hour'
         and (status = 'open' or ($1::timestamptz is not null and status = 'closed'))
       order by start_time desc
       limit 50`,
      [capturedAtMs ? new Date(capturedAtMs).toISOString() : null],
    );
    for (const candidate of candidates) {
      const result = verifyCode(candidate.qr_secret, candidate.id, code, { acceptedSteps });
      if (result.ok) {
        const session = await findSession(candidate.id);
        if (session) return { session, method: 'code' };
      }
    }
    throw new HttpError(422, 'That code is not active. Ask your lecturer for the current code.', 'invalid_code');
  }

  throw new HttpError(400, 'Enter the six-digit code from class, or scan the QR code.', 'code_required');
}

export async function checkIn({ student, input, ip }) {
  const settings = await getSettings();
  // The HTTP layer validates snake_case payloads; normalise once here.
  const code = input.code;
  const qrPayload = input.qr_payload;
  const deviceId = input.device_id;
  const location = input.location;
  const capturedAtMs = parseCapturedAt(input.captured_at);

  const { session, method } = await resolveTarget({ code, qrPayload, capturedAtMs }, settings);

  const now = Date.now();
  const opens = new Date(session.check_in_opens_at).getTime();
  const closes = new Date(session.check_in_closes_at).getTime();
  const effective = new Date(Math.min(now, Math.max(opens, capturedAtMs ?? now)));

  if (session.status === 'cancelled') {
    throw new HttpError(422, 'This session was cancelled.', 'session_cancelled');
  }
  if (session.status === 'scheduled') {
    throw new HttpError(422, 'This session has not started yet. Check-in opens when your lecturer starts it.', 'session_not_open');
  }
  if (session.status === 'closed' && !capturedAtMs) {
    throw new HttpError(422, 'Check-in for this session is closed.', 'check_in_closed');
  }
  if (effective.getTime() < opens) {
    throw new HttpError(422, `Check-in opens at ${timeLabel(session.check_in_opens_at)}.`, 'check_in_not_open');
  }
  if (effective.getTime() > closes) {
    throw new HttpError(422, 'Check-in for this session has closed.', 'check_in_closed');
  }

  if (!(await isEnrolled(student.id, session.course_id))) {
    throw new HttpError(403, `You are not enrolled in ${session.course_code}.`, 'not_enrolled');
  }

  const existing = await one(
    'select * from attendance_records where session_id = $1 and student_id = $2',
    [session.id, student.id],
  );
  if (existing) {
    throw new HttpError(
      409,
      `You already checked in at ${iso(existing.checked_in_at)?.slice(11, 16)} (${existing.status}).`,
      'already_checked_in',
      { record_id: existing.id, status: existing.status, checked_in_at: iso(existing.checked_in_at) },
    );
  }

  // --- location verification: only the distance is ever persisted
  const venue = { lat: session.geofence_lat, lng: session.geofence_lng };
  const hasVenue = Number.isFinite(venue.lat) && Number.isFinite(venue.lng);
  const radiusM = session.geofence_radius_m || 150;
  const hasLocation = location && isValidCoordinate(location.lat, location.lng);
  const point = hasLocation ? { lat: Number(location.lat), lng: Number(location.lng) } : null;

  let locationVerified = null;
  let distanceM = null;
  let flagged = false;
  let flagReason = null;

  if (session.require_geofence && hasVenue) {
    if (!point) {
      throw new HttpError(
        422,
        'This session verifies your location to confirm you are in the venue. Allow location access and try again.',
        'location_required',
      );
    }
    distanceM = haversineMeters(point, venue);
    locationVerified = distanceM <= radiusM;
    if (!locationVerified) {
      throw new HttpError(
        422,
        `You appear to be ${distanceM} m from ${session.venue} (limit ${radiusM} m).`,
        'geofence_failed',
        { distanceM, radiusM },
      );
    }
  } else if (point && hasVenue) {
    distanceM = haversineMeters(point, venue);
    locationVerified = distanceM <= radiusM;
    if (!locationVerified) {
      flagged = true;
      flagReason = 'outside_venue';
    }
  }

  const deviceHash = deviceId ? hashDevice(deviceId) : null;
  if (deviceHash) {
    const shared = await one(
      `select 1 from attendance_records
       where session_id = $1 and device_id_hash = $2 and student_id <> $3 limit 1`,
      [session.id, deviceHash, student.id],
    );
    if (shared) {
      flagged = true;
      flagReason = flagReason || 'shared_device';
    }
  }

  const status = statusFor(session, effective, settings);

  let record;
  try {
    record = await tx(async (client) => {
      const inserted = await client.query(
        `insert into attendance_records
           (session_id, student_id, status, checked_in_at, check_in_method,
            location_verified, location_distance_m, device_id_hash, flagged, flag_reason)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning *`,
        [
          session.id,
          student.id,
          status,
          effective.toISOString(),
          method,
          locationVerified,
          distanceM,
          deviceHash,
          flagged,
          flagReason,
        ],
      );
      const row = inserted.rows[0];
      await logAudit(client, {
        actorId: student.id,
        action: 'attendance.check_in',
        entityType: 'attendance_record',
        entityId: row.id,
        newValue: { status, sessionId: session.id, method, locationVerified, checkedInAt: iso(row.checked_in_at) },
        ip,
      });
      return row;
    });
  } catch (err) {
    if (err.code === '23505') {
      throw new HttpError(409, 'You already checked in to this session.', 'already_checked_in');
    }
    throw err;
  }

  if (distanceM !== null && !locationVerified && !session.require_geofence) {
    await notify({
      userId: session.lecturer_id,
      type: 'attendance_corrected',
      title: `Check-in flagged: ${session.course_code}`,
      body: `${student.name} checked in ${distanceM} m from ${session.venue}.`,
      data: { sessionId: session.id, recordId: record.id },
    });
  }

  return {
    record: {
      id: record.id,
      status: record.status,
      checked_in_at: iso(record.checked_in_at),
      check_in_method: record.check_in_method,
      location_verified: record.location_verified,
      location_distance_m: record.location_distance_m,
      flagged: record.flagged,
      flag_reason: record.flag_reason,
    },
    session: {
      id: session.id,
      course_code: session.course_code,
      course_title: session.course_title,
      venue: session.venue,
      start_time: iso(session.start_time),
    },
    counted_as_attended: COUNTED_AS_ATTENDED.has(status),
  };
}

// ---------------------------------------------------------------- session views

export async function markAbsentees(sessionId, actorId, ip = null) {
  const session = await findSession(sessionId);
  if (!session) throw new HttpError(404, 'Session not found.', 'not_found');

  const created = await many(
    `with inserted as (
       insert into attendance_records (session_id, student_id, status, recorded_by)
       select $1, e.student_id, 'absent', $2
       from enrollments e
       where e.course_id = $3
         and not exists (
           select 1 from attendance_records r where r.session_id = $1 and r.student_id = e.student_id
         )
       on conflict (session_id, student_id) do nothing
       returning id, student_id
     )
     select inserted.id, inserted.student_id, u.name, u.email
     from inserted join users u on u.id = inserted.student_id`,
    [sessionId, actorId, session.course_id],
  );

  if (created.length) {
    await logAudit(null, {
      actorId,
      action: 'attendance.mark_absent',
      entityType: 'session',
      entityId: sessionId,
      newValue: { createdAbsent: created.length },
      ip,
    });
    await notifyMany(
      created.map((row) => ({ id: row.student_id })),
      {
        type: 'missed_class',
        title: `Marked absent: ${session.course_code}`,
        body: `You were marked absent for ${session.course_code} on ${session.date}. If this is wrong, contact your lecturer.`,
        data: { sessionId },
      },
    );
  }

  return { session, created };
}

export async function sessionLive(session) {
  const rows = await many(
    `select u.id as student_id, u.name, st.matric_number, st.program, st.level,
            r.id as record_id, r.status, r.checked_in_at, r.check_in_method,
            r.location_verified, r.location_distance_m, r.flagged, r.flag_reason,
            r.override_reason,
            rec.name as recorded_by
     from enrollments e
     join users u on u.id = e.student_id
     left join students st on st.user_id = u.id
     left join attendance_records r on r.session_id = $1 and r.student_id = u.id
     left join users rec on rec.id = r.recorded_by
     where e.course_id = $2
     order by u.name`,
    [session.id, session.course_id],
  );

  const counts = { present: 0, late: 0, absent: 0, excused: 0, not_checked_in: 0, flagged: 0 };
  for (const row of rows) {
    if (row.status && counts[row.status] !== undefined) counts[row.status] += 1;
    else counts.not_checked_in += 1;
    if (row.flagged) counts.flagged += 1;
  }

  return {
    counts,
    enrolled: rows.length,
    attendance_rate: rows.length
      ? Math.round(((counts.present + counts.late) / rows.length) * 100)
      : null,
    students: rows.map((row) => ({
      student_id: row.student_id,
      name: row.name,
      matric_number: row.matric_number,
      program: row.program,
      level: row.level,
      record_id: row.record_id,
      status: row.status,
      checked_in_at: iso(row.checked_in_at),
      check_in_method: row.check_in_method,
      location_verified: row.location_verified,
      location_distance_m: row.location_distance_m,
      flagged: row.flagged,
      flag_reason: row.flag_reason,
      override_reason: row.override_reason,
      recorded_by: row.recorded_by,
    })),
  };
}

// ---------------------------------------------------------------- student data

export async function studentSummary(studentId) {
  const settings = await getSettings();
  const rows = await many(
    `select c.id as course_id, c.code, c.title, c.schedule, c.venue, c.semester,
            count(distinct s.id)::int as held,
            count(r.id) filter (where r.status in ('present','late'))::int as attended,
            count(r.id) filter (where r.status = 'late')::int as late,
            count(r.id) filter (where r.status = 'absent')::int as absent,
            count(r.id) filter (where r.status = 'excused')::int as excused
     from enrollments e
     join courses c on c.id = e.course_id
     left join sessions s on s.course_id = c.id and s.status in ('open','closed') and s.start_time <= now()
     left join attendance_records r on r.session_id = s.id and r.student_id = e.student_id
     where e.student_id = $1
     group by c.id
     order by c.code`,
    [studentId],
  );

  const courses = rows.map((row) => {
    const percentage = row.held ? Math.round((row.attended / row.held) * 100) : null;
    return {
      course_id: row.course_id,
      code: row.code,
      title: row.title,
      schedule: row.schedule,
      venue: row.venue,
      semester: row.semester,
      held: row.held,
      attended: row.attended,
      late: row.late,
      absent: row.absent,
      excused: row.excused,
      percentage,
      below_threshold: percentage !== null && percentage < settings.warningThreshold,
    };
  });

  const totalHeld = courses.reduce((sum, course) => sum + course.held, 0);
  const totalAttended = courses.reduce((sum, course) => sum + course.attended, 0);

  return {
    threshold: settings.warningThreshold,
    overall_percentage: totalHeld ? Math.round((totalAttended / totalHeld) * 100) : null,
    courses,
  };
}

export async function studentHistory(studentId, { courseId = null } = {}) {
  const params = [studentId];
  let filter = '';
  if (courseId) {
    params.push(courseId);
    filter = 'and c.id = $2';
  }
  const rows = await many(
    `select r.id, r.status, r.checked_in_at, r.check_in_method, r.flagged, r.flag_reason,
            r.override_reason, r.location_verified,
            s.id as session_id, s.date, s.start_time, s.venue,
            c.code as course_code, c.title as course_title, c.id as course_id
     from attendance_records r
     join sessions s on s.id = r.session_id
     join courses c on c.id = s.course_id
     where r.student_id = $1 ${filter}
     order by s.start_time desc
     limit 200`,
    params,
  );

  return rows.map((row) => ({
    id: row.id,
    session_id: row.session_id,
    status: row.status,
    checked_in_at: iso(row.checked_in_at),
    check_in_method: row.check_in_method,
    location_verified: row.location_verified,
    flagged: row.flagged,
    flag_reason: row.flag_reason,
    override_reason: row.override_reason,
    date: row.date,
    start_time: iso(row.start_time),
    venue: row.venue,
    course_id: row.course_id,
    course_code: row.course_code,
    course_title: row.course_title,
  }));
}

// ---------------------------------------------------------------- corrections

export async function overrideRecord({ actor, recordId, status, reason, ip }) {
  if (!ATTENDANCE_STATUSES.includes(status)) {
    throw new HttpError(400, 'Status must be present, late, absent or excused.', 'invalid_status');
  }
  if (!reason || reason.trim().length < 4) {
    throw new HttpError(400, 'A reason is required for every attendance correction.', 'reason_required');
  }

  const existing = await one(
    `select r.*, s.course_id, s.lecturer_id, s.date, c.code as course_code,
            u.name as student_name, u.email as student_email
     from attendance_records r
     join sessions s on s.id = r.session_id
     join courses c on c.id = s.course_id
     join users u on u.id = r.student_id
     where r.id = $1`,
    [recordId],
  );
  if (!existing) throw new HttpError(404, 'Attendance record not found.', 'not_found');
  if (actor.role !== 'admin' && existing.lecturer_id !== actor.id) {
    throw new HttpError(404, 'Attendance record not found.', 'not_found');
  }

  const updated = await tx(async (client) => {
    const result = await client.query(
      `update attendance_records
       set status = $2, override_reason = $3, recorded_by = $4, updated_at = now(),
           checked_in_at = case
             when $2 = 'absent' then null
             when checked_in_at is null then now()
             else checked_in_at end
       where id = $1
       returning *`,
      [recordId, status, reason.trim(), actor.id],
    );
    const row = result.rows[0];
    const changes = diff(existing, row, ['status', 'override_reason']);
    await logAudit(client, {
      actorId: actor.id,
      action: 'attendance.override',
      entityType: 'attendance_record',
      entityId: recordId,
      oldValue: Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value.old])),
      newValue: Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value.new])),
      reason: reason.trim(),
      ip,
    });
    return row;
  });

  await notify({
    userId: existing.student_id,
    email: existing.student_email,
    type: 'attendance_corrected',
    title: `Attendance updated: ${existing.course_code}`,
    body: `Your attendance for ${existing.course_code} on ${existing.date} was changed to ${status}. Reason: ${reason.trim()}`,
    data: { recordId, sessionId: existing.session_id, status },
  });

  return {
    id: updated.id,
    status: updated.status,
    checked_in_at: iso(updated.checked_in_at),
    override_reason: updated.override_reason,
    recorded_by: actor.name,
  };
}

export { findSession };
