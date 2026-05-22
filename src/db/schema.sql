-- Run this once in your Supabase SQL editor

create table if not exists seen_jobs (
  url       text primary key,
  title     text,
  company   text,
  created_at timestamptz default now()
);

-- Optional: auto-clean jobs older than 90 days to keep table small
-- (run as a Supabase scheduled function or manually)
-- delete from seen_jobs where created_at < now() - interval '90 days';
