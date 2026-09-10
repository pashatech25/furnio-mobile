-- Test-only stand-ins for Supabase-owned objects used by Furnio migrations.
-- NOT an Auth/Storage implementation or a hosted-platform permissions audit.
-- Every Furnio public/private table, enum, constraint, policy and trigger comes
-- from the real application migrations; none is recreated in this bootstrap.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema storage;
grant usage on schema public, auth to anon, authenticated, service_role;

-- Model the legacy public-schema grants that the existing application expects.
-- New native migrations must explicitly revoke browser access even against
-- this permissive starting point. Hosted default privileges need separate QA.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}',
  raw_app_meta_data jsonb not null default '{}',
  phone text,
  phone_confirmed_at timestamptz,
  phone_change text default '',
  phone_change_token text default '',
  phone_change_sent_at timestamptz,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  banned_until timestamptz,
  is_anonymous boolean not null default false
);
create table auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  not_after timestamptz,
  aal text not null default 'aal1',
  oauth_client_id uuid
);
create table auth.mfa_amr_claims (
  session_id uuid not null references auth.sessions(id) on delete cascade,
  authentication_method text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id,authentication_method)
);
create table auth.mfa_factors (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null
);
create table auth.identities (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  unique(user_id,provider)
);
create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
