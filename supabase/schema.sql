-- Storage for ingested lecture transcripts.
--
-- Run this once in the Supabase SQL editor, then set SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY in the app environment.

create table if not exists public.lectures (
  id text primary key,
  title text not null,
  uploader text not null,
  url text not null,
  duration_seconds integer not null default 0,
  source text not null check (source in ('captions', 'whisper')),
  segments jsonb not null,
  ingested_at timestamptz not null default now()
);

create index if not exists lectures_ingested_at_idx
  on public.lectures (ingested_at desc);

-- The app reaches Supabase only from server routes using the service role key,
-- so no client-side policies are needed. RLS stays on to block anon access.
alter table public.lectures enable row level security;

-- One saved set of chats and notes per lecture. The browser never receives
-- the service role key; reads and writes go through Next.js route handlers.
create table if not exists public.lecture_workspaces (
  lecture_id text primary key references public.lectures(id) on delete cascade,
  chats jsonb not null default '[]'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.lecture_workspaces enable row level security;
