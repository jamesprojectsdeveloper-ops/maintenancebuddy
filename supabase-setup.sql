-- MaintenanceBuddy — Required Supabase Schema
-- Run these in your Supabase SQL Editor at:
-- https://supabase.com/dashboard → your project → SQL Editor

-- ─── profiles ────────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "Users can manage their own profile"
  on profiles for all using (auth.uid() = id);

-- ─── vehicles ────────────────────────────────────────────────
create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  make text not null,
  model text not null,
  year integer not null,
  trim text,
  drivetrain text,
  is_turbo boolean default false,
  engine text,
  color text,
  current_mileage integer,
  oil_brand text,
  oil_type text,
  oil_viscosity text,
  tire_brand text,
  tire_size text,
  tires_installed_at_mileage integer,
  accessories text[],
  using_defaults boolean default true,
  avg_miles_per_month integer,
  mileage_log_count integer default 0,
  mileage_updated_at timestamptz,
  created_at timestamptz default now()
);
alter table vehicles enable row level security;
create policy "Users can manage their own vehicles"
  on vehicles for all using (auth.uid() = user_id);

-- ─── mileage_logs ────────────────────────────────────────────
create table if not exists mileage_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references vehicles(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  mileage integer not null,
  source text,
  logged_at timestamptz default now()
);
alter table mileage_logs enable row level security;
create policy "Users can manage their own mileage logs"
  on mileage_logs for all using (auth.uid() = user_id);

-- ─── maintenance_tasks ───────────────────────────────────────
create table if not exists maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references vehicles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade not null,
  asset_type text default 'vehicle',
  name text not null,
  category text,
  description text,
  priority text,
  is_safety_critical boolean default false,
  interval_type text,
  interval_miles integer,
  interval_days integer,
  last_completed_miles integer,
  next_due_miles integer,
  next_due_at timestamptz,
  using_conservative_default boolean default false,
  status text default 'active',
  created_at timestamptz default now()
);
alter table maintenance_tasks enable row level security;
create policy "Users can manage their own tasks"
  on maintenance_tasks for all using (auth.uid() = user_id);

-- ─── service_logs ────────────────────────────────────────────
create table if not exists service_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references vehicles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade not null,
  task_id uuid references maintenance_tasks(id) on delete set null,
  task_name text not null,
  service_date date not null,
  mileage_at_service integer,
  product_brand text,
  condition_notes text,
  cost numeric(10,2),
  created_at timestamptz default now()
);
alter table service_logs enable row level security;
create policy "Users can manage their own service logs"
  on service_logs for all using (auth.uid() = user_id);

-- ─── ai_schedule_generations ─────────────────────────────────
create table if not exists ai_schedule_generations (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references vehicles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade not null,
  asset_type text,
  trigger text,
  prompt_context jsonb,
  tasks_generated integer,
  model_used text,
  created_at timestamptz default now()
);
alter table ai_schedule_generations enable row level security;
create policy "Users can manage their own generations"
  on ai_schedule_generations for all using (auth.uid() = user_id);
