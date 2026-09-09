-- Minimal, synthetic database fixture. No production data or unrelated local
-- Supabase project is read. Actual existing Stripe functions are loaded unchanged
-- from their source migration by test-ledger.mjs before the new migrations.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema private;
-- Auth columns read by deletion preflight, matching Supabase's official Auth
-- migrations. These synthetic tables are NOT a substitute for staging Auth QA.
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth to authenticated;
create table auth.users(id uuid primary key,deleted_at timestamptz,banned_until timestamptz,is_anonymous boolean not null default false);
create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),not_after timestamptz,aal text not null default 'aal1',oauth_client_id uuid);
create table auth.mfa_amr_claims(session_id uuid not null references auth.sessions(id) on delete cascade,
  authentication_method text not null,created_at timestamptz not null default now(),updated_at timestamptz not null,
  unique(session_id,authentication_method));
create table auth.mfa_factors(id uuid primary key,user_id uuid not null references auth.users(id),status text not null);
create table auth.identities(user_id uuid not null references auth.users(id),provider text not null,unique(user_id,provider));
revoke all on schema private from public;
create type public.credit_reason as enum ('purchase','subscription_grant','job_reserve','job_commit','job_refund','manual_adjust','expiry','batch_reserve','batch_refund');
create table public.profiles(id uuid primary key, email text);
create table public.admin_users(user_id uuid primary key references public.profiles(id), role text not null, is_active boolean not null default true);
alter table public.profiles add column full_name text,add column avatar_url text,add column stripe_customer_id text,
 add column account_status text not null default 'active',add column created_at timestamptz not null default now();
create table public.projects(id uuid primary key,user_id uuid not null references public.profiles(id),name text not null,archived_at timestamptz);
create table public.assets(id uuid primary key,user_id uuid not null references public.profiles(id),purged_at timestamptz);
create table public.api_consumers(id uuid primary key,user_id uuid not null unique references public.profiles(id));
alter table public.api_consumers add column status text not null default 'active',
  add column api_access_enabled boolean not null default true,
  add column platform_access_enabled boolean not null default true,
  add column sandbox_access_enabled boolean not null default true,
  add column production_access_enabled boolean not null default true,
  add column mcp_access_enabled boolean not null default true,
  add column approved_sandbox_access_enabled boolean not null default true,
  add column approved_production_access_enabled boolean not null default true,
  add column approved_mcp_access_enabled boolean not null default true,
  add column approved_platform_access_enabled boolean not null default true;
create table public.api_keys(id uuid primary key,consumer_id uuid not null references public.api_consumers(id),revoked_at timestamptz,revoked_reason text);
create table public.api_sandbox_keys(id uuid primary key,consumer_id uuid not null references public.api_consumers(id),revoked_at timestamptz,revoked_reason text);
create table public.jobs(id uuid primary key,user_id uuid not null references public.profiles(id),project_id uuid references public.projects(id),
  created_at timestamptz not null default now(),type text not null,status text not null,purged_at timestamptz,finished_at timestamptz,input jsonb not null default '{}',error text);
create table public.room_groups(id uuid primary key,user_id uuid not null references public.profiles(id),project_id uuid references public.projects(id),name text);
create table public.job_steps(id uuid primary key,job_id uuid not null references public.jobs(id) on delete cascade,status text not null,error text,
  step_index integer not null default 0,output jsonb);
create table public.api_job_links(job_id uuid primary key references public.jobs(id) on delete cascade,consumer_id uuid not null references public.api_consumers(id));
create table public.api_webhook_endpoints(id uuid primary key,consumer_id uuid not null references public.api_consumers(id),enabled boolean not null default true,disabled_at timestamptz);
create table public.api_webhook_deliveries(id uuid primary key,consumer_id uuid not null references public.api_consumers(id),
  endpoint_id uuid not null references public.api_webhook_endpoints(id),event_id uuid not null,event_type text not null,
  job_id uuid references public.jobs(id) on delete set null,payload jsonb not null,status text not null default 'pending',last_error text,
  unique(endpoint_id,event_id));
-- Synthetic equivalents of existing ownership policies: new restrictive fences
-- must narrow these, never replace ownership with a global permit.
alter table public.profiles enable row level security;
create policy fixture_profiles_own on public.profiles to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
do $$declare t text;begin
  foreach t in array array['projects','assets','jobs','room_groups'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy fixture_own on public.%I to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()))',t);
  end loop;
end$$;
grant select,insert,update,delete on public.profiles,public.projects,public.assets,public.jobs,public.room_groups to authenticated;
create table public.billing_packages(id uuid primary key,max_source_photos_per_project integer not null default 5,name text not null default 'Website plan');
create table public.trial_entitlements(user_id uuid primary key references public.profiles(id),state text not null,
 converted_at timestamptz,conversion_source text);
create table public.trial_usage_events(user_id uuid not null,event_type text,event_key text unique,metadata jsonb);
create table public.billing_package_versions(
 id uuid primary key, package_id uuid references public.billing_packages(id),
 purchase_audience text not null default 'customer', name text not null, package_key text not null default 'fixture_package',
 interval text not null, total_credits integer not null, max_source_photos_per_project integer not null,
 rollover_limit integer not null default 0, stripe_price_id text not null default 'price_test'
);
create table public.subscriptions(
 id text primary key, user_id uuid not null references public.profiles(id),
 status text not null, price_id text not null default 'price_test',
 package_id uuid, package_version_id uuid, monthly_credits integer not null default 10,
 current_period_start timestamptz not null default now(),
 current_period_end timestamptz not null default now() + interval '1 month',
 cancel_at_period_end boolean not null default false,
 subscription_credit_balance integer not null default 0 check(subscription_credit_balance >= 0),
 rollover_year_started_at timestamptz, rollover_crossings_used integer not null default 0,
 updated_at timestamptz not null default now()
);
alter table public.subscriptions add column billing_context text not null default 'customer';
alter table public.subscriptions add column pause_collection jsonb;
create table public.credit_ledger(
 id bigint generated by default as identity primary key,
 user_id uuid not null references public.profiles(id), delta integer not null,
 reason public.credit_reason not null, job_id uuid, stripe_event_id text unique,
 idempotency_key text unique not null, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create function public.credit_balance(p_user uuid) returns integer language sql stable as $$
 select coalesce(sum(delta),0)::integer from public.credit_ledger where user_id=p_user
$$;
grant usage on schema public to service_role, authenticated, anon;
grant select, insert, update on public.credit_ledger, public.subscriptions to service_role;
grant select on public.billing_package_versions to service_role;
grant usage on all sequences in schema public to service_role;

create function public.test_assert(condition boolean, label text) returns void language plpgsql as $$
begin if condition is distinct from true then raise exception 'ASSERTION FAILED: %', label; end if; end $$;
insert into public.profiles(id,email) select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'fixture' || n || '@example.invalid' from generate_series(1,20) n;
insert into public.billing_packages(id) values ('10000000-0000-4000-8000-000000000001');
insert into public.billing_package_versions(id,package_id,name,interval,total_credits,max_source_photos_per_project,purchase_audience) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Native pack','one_time',20,5,'customer'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Native monthly','month',50,20,'customer'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Developer plan','month',50,20,'developer');
