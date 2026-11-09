-- Students type their department at sign-up: universities have far more
-- departments than the curated `departments` table holds.
alter table students add column if not exists department text;
