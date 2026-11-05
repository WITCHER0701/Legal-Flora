-- Run once in the Supabase SQL Editor. Supabase Auth owns auth.users and passwords.
create table if not exists public.admin_sessions (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  csrf_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists admin_sessions_expiry_idx on public.admin_sessions (expires_at);

create table if not exists public.login_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  success boolean not null,
  occurred_at timestamptz not null default now()
);
create index if not exists login_events_time_idx on public.login_events (occurred_at desc);

create table if not exists public.leads (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  phone text not null,
  subject text not null default '',
  message text not null default '',
  source text not null default 'website',
  received timestamptz not null default now()
);
create index if not exists leads_received_idx on public.leads (received desc);

create table if not exists public.events (
  id bigint generated always as identity primary key,
  type text not null check (type in ('visit','leave','cta_click','section_view')),
  visitor_id text not null default '',
  payload jsonb not null default '{}'::jsonb,
  received timestamptz not null default now()
);
create index if not exists events_type_idx on public.events (type);
create index if not exists events_visitor_idx on public.events (visitor_id);

-- Records the visitor's choice, not raw cookie headers or personal details.
create table if not exists public.consent_events (
  id bigint generated always as identity primary key,
  visitor_id text not null,
  accepted boolean not null,
  received timestamptz not null default now()
);
create index if not exists consent_events_time_idx on public.consent_events (received desc);

create table if not exists public.chat_config (
  id integer primary key check (id = 1),
  provider text not null check (provider in ('openai','gemini')),
  model text not null,
  api_key text not null,
  system_prompt text not null default ''
);

create table if not exists public.request_limits (
  key_hash text not null,
  bucket bigint not null,
  count integer not null,
  updated_at timestamptz not null default now(),
  primary key (key_hash, bucket)
);
create index if not exists request_limits_updated_idx on public.request_limits (updated_at);

alter table public.admin_sessions enable row level security;
alter table public.login_events enable row level security;
alter table public.leads enable row level security;
alter table public.events enable row level security;
alter table public.consent_events enable row level security;
alter table public.chat_config enable row level security;
alter table public.request_limits enable row level security;

revoke all on public.admin_sessions, public.login_events, public.leads, public.events,
  public.consent_events, public.chat_config, public.request_limits from anon, authenticated;
grant all on public.admin_sessions, public.login_events, public.leads, public.events,
  public.consent_events, public.chat_config, public.request_limits to service_role;
grant usage, select on all sequences in schema public to service_role;

create or replace function public.dashboard_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'leads_total', (select count(*) from public.leads),
    'events_total', (select count(*) from public.events),
    'visits_total', (select count(*) from public.events where type = 'visit'),
    'cta_clicks', (select count(*) from public.events where type = 'cta_click'),
    'unique_visitors', (select count(distinct visitor_id) from public.events where visitor_id <> ''),
    'logins_total', (select count(*) from public.login_events where success),
    'login_events_total', (select count(*) from public.login_events),
    'failed_logins', (select count(*) from public.login_events where not success),
    'consent_events_total', (select count(*) from public.consent_events),
    'consent_accepts', (select count(*) from public.consent_events where accepted),
    'consent_declines', (select count(*) from public.consent_events where not accepted)
  );
$$;

create or replace function public.rate_limit_hit(p_key_hash text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer; b bigint;
begin
  if p_max < 1 or p_window_seconds < 1 or length(p_key_hash) <> 64 then
    raise exception 'Invalid rate limit parameters';
  end if;
  b := floor(extract(epoch from now()) / p_window_seconds)::bigint;
  insert into public.request_limits(key_hash, bucket, count) values (p_key_hash, b, 1)
    on conflict (key_hash, bucket) do update set count = public.request_limits.count + 1, updated_at = now()
    returning count into n;
  if random() < 0.01 then
    delete from public.request_limits where updated_at < now() - interval '1 day';
  end if;
  return n <= p_max;
end;
$$;

create or replace function public.clear_dashboard_data()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.leads;
  delete from public.events;
  delete from public.consent_events;
end;
$$;

revoke all on function public.dashboard_stats(), public.rate_limit_hit(text, integer, integer),
  public.clear_dashboard_data() from public, anon, authenticated;
grant execute on function public.dashboard_stats(), public.rate_limit_hit(text, integer, integer),
  public.clear_dashboard_data() to service_role;
