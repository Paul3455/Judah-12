-- CampusCheck initial schema (PostgreSQL 16)
-- Applied by server/scripts/migrate.js. Idempotent DDL so a fresh volume and a
-- partially-provisioned database both converge.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- departments

create table if not exists departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  code       text not null unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- users

create table if not exists users (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  email             text not null,
  password_hash     text not null,
  role              text not null check (role in ('student', 'lecturer', 'admin')),
  department_id     uuid references departments (id) on delete set null,
  status            text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  email_verified_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists users_email_lower_idx on users (lower(email));
create index if not exists users_role_dept_idx on users (role, department_id);

create table if not exists students (
  user_id       uuid primary key references users (id) on delete cascade,
  matric_number text not null unique,
  program       text not null,
  level         int not null check (level between 100 and 700)
);

create table if not exists lecturers (
  user_id       uuid primary key references users (id) on delete cascade,
  staff_id      text not null unique,
  department_id uuid references departments (id) on delete set null
);

-- ---------------------------------------------------------------- courses

create table if not exists courses (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  title              text not null,
  department_id      uuid not null references departments (id),
  lecturer_id        uuid references users (id) on delete set null,
  semester           text not null,
  schedule           text,
  venue              text,
  geofence_enabled   boolean not null default false,
  geofence_lat       double precision,
  geofence_lng       double precision,
  geofence_radius_m  int not null default 150 check (geofence_radius_m between 10 and 5000),
  created_at         timestamptz not null default now()
);

create index if not exists courses_lecturer_idx on courses (lecturer_id);
create index if not exists courses_department_idx on courses (department_id);

create table if not exists enrollments (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references users (id) on delete cascade,
  course_id  uuid not null references courses (id) on delete cascade,
  semester   text not null,
  created_at timestamptz not null default now(),
  unique (student_id, course_id, semester)
);

create index if not exists enrollments_course_idx on enrollments (course_id, student_id);
create index if not exists enrollments_student_idx on enrollments (student_id);

-- ---------------------------------------------------------------- sessions

create table if not exists sessions (
  id                  uuid primary key default gen_random_uuid(),
  course_id           uuid not null references courses (id) on delete cascade,
  lecturer_id         uuid not null references users (id) on delete cascade,
  date                date not null,
  start_time          timestamptz not null,
  end_time            timestamptz not null,
  venue               text not null,
  check_in_opens_at   timestamptz not null,
  check_in_closes_at  timestamptz not null,
  status              text not null default 'scheduled'
                       check (status in ('scheduled', 'open', 'closed', 'cancelled')),
  qr_secret           text not null default encode(gen_random_bytes(24), 'hex'),
  require_geofence    boolean not null default false,
  created_at          timestamptz not null default now(),
  constraint sessions_window_valid check (check_in_closes_at > check_in_opens_at),
  constraint sessions_times_valid check (end_time > start_time)
);

create index if not exists sessions_course_time_idx on sessions (course_id, start_time desc);
create index if not exists sessions_status_idx on sessions (status, check_in_closes_at);
create index if not exists sessions_lecturer_idx on sessions (lecturer_id);

-- ---------------------------------------------------------------- attendance

create table if not exists attendance_records (
  id                    uuid primary key default gen_random_uuid(),
  session_id            uuid not null references sessions (id) on delete cascade,
  student_id            uuid not null references users (id) on delete cascade,
  status                text not null check (status in ('present', 'late', 'absent', 'excused')),
  checked_in_at         timestamptz,
  check_in_method       text check (check_in_method in ('qr', 'code', 'manual')),
  location_verified     boolean,
  location_distance_m   int,
  device_id_hash        text,
  override_reason       text,
  recorded_by           uuid references users (id) on delete set null,
  flagged               boolean not null default false,
  flag_reason           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (session_id, student_id)
);

create index if not exists attendance_session_idx on attendance_records (session_id);
create index if not exists attendance_student_idx on attendance_records (student_id);
create index if not exists attendance_device_idx on attendance_records (session_id, device_id_hash);
create index if not exists attendance_flagged_idx on attendance_records (flagged) where flagged;

-- ---------------------------------------------------------------- audit

create table if not exists audit_logs (
  id          bigserial primary key,
  actor_id    uuid references users (id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  old_value   jsonb,
  new_value   jsonb,
  reason      text,
  ip          text,
  created_at  timestamptz not null default now()
);

create index if not exists audit_entity_idx on audit_logs (entity_type, entity_id);
create index if not exists audit_actor_idx on audit_logs (actor_id, created_at desc);
create index if not exists audit_created_idx on audit_logs (created_at desc);

-- ---------------------------------------------------------------- auth support

create table if not exists refresh_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists refresh_tokens_user_idx on refresh_tokens (user_id);

create table if not exists email_verification_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- notifications

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text not null,
  data       jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on notifications (user_id, read_at, created_at desc);

-- ---------------------------------------------------------------- settings

create table if not exists app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value) values
  ('attendance.warning_threshold', '{"value": 75}'::jsonb),
  ('retention.attendance_days', '{"value": 365}'::jsonb),
  ('attendance.late_grace_minutes', '{"value": 10}'::jsonb),
  ('checkin.qr_step_seconds', '{"value": 45}'::jsonb)
on conflict (key) do nothing;
