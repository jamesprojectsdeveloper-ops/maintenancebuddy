-- ============================================================
-- MaintenanceBuddy — Homes Schema (clean slate)
-- Drops and recreates all three home tables.
-- Run once in the Supabase SQL Editor.
-- ============================================================

-- ── Drop dependent tables first (FK order) ─────────────────
DROP TABLE IF EXISTS home_service_logs       CASCADE;
DROP TABLE IF EXISTS home_maintenance_tasks  CASCADE;
DROP TABLE IF EXISTS homes                   CASCADE;

-- ── Drop trigger functions if they exist ───────────────────
DROP FUNCTION IF EXISTS update_homes_updated_at()  CASCADE;
DROP FUNCTION IF EXISTS update_hmt_updated_at()    CASCADE;

-- ============================================================
-- 1. homes
-- ============================================================
CREATE TABLE homes (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Location & climate
  state                         text,
  climate_zone                  text        NOT NULL DEFAULT 'unknown'
                                  CHECK (climate_zone IN ('hot_humid','cold_winter','hot_dry','mild','unknown')),

  -- Ownership & type
  own_or_rent                   text        NOT NULL DEFAULT 'own'
                                  CHECK (own_or_rent IN ('own','rent')),
  home_type                     text        NOT NULL DEFAULT 'single_family'
                                  CHECK (home_type IN ('single_family','townhouse','condo','mobile','other')),

  -- Basic specs
  year_built                    integer,
  sqft                          integer,

  -- HVAC
  hvac_type                     text,
  hvac_age_years                integer,

  -- Air filter
  air_filter_type               text,
  last_filter_change_months_ago integer,

  -- Roof
  roof_type                     text,
  roof_age_years                integer,

  -- Water heater
  water_heater_type             text,
  water_heater_age_years        integer,

  -- Extras: pool, hot tub, irrigation, well water, septic,
  --         fireplace, generator, sump pump, solar, EV charger,
  --         deck/patio, wood fence, etc.
  extras                        text[]      NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX homes_user_id_idx ON homes (user_id);

CREATE OR REPLACE FUNCTION update_homes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER homes_updated_at_trigger
  BEFORE UPDATE ON homes
  FOR EACH ROW EXECUTE FUNCTION update_homes_updated_at();

ALTER TABLE homes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homes: users manage own rows"
  ON homes FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 2. home_maintenance_tasks
-- ============================================================
CREATE TABLE home_maintenance_tasks (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  home_id               uuid        NOT NULL REFERENCES homes(id)       ON DELETE CASCADE,

  -- Task identity
  name                  text        NOT NULL,
  category              text        NOT NULL DEFAULT 'Other',
  description           text,

  -- Scheduling
  interval_days         integer     NOT NULL DEFAULT 365,
  seasonal              text        NOT NULL DEFAULT 'year_round'
                          CHECK (seasonal IN ('spring','summer','fall','winter','year_round')),
  priority              text        NOT NULL DEFAULT 'medium'
                          CHECK (priority IN ('high','medium','low')),

  -- Flags
  is_safety_critical    boolean     NOT NULL DEFAULT false,
  inspect_at_next_visit boolean     NOT NULL DEFAULT false,

  -- Completion tracking
  last_completed_at     date,
  next_due_at           timestamptz,

  -- Lifecycle
  status                text        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','dismissed')),

  -- Timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hmt_user_id_idx  ON home_maintenance_tasks (user_id);
CREATE INDEX hmt_home_id_idx  ON home_maintenance_tasks (home_id);
CREATE INDEX hmt_status_idx   ON home_maintenance_tasks (status);
CREATE INDEX hmt_next_due_idx ON home_maintenance_tasks (next_due_at);

CREATE OR REPLACE FUNCTION update_hmt_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER hmt_updated_at_trigger
  BEFORE UPDATE ON home_maintenance_tasks
  FOR EACH ROW EXECUTE FUNCTION update_hmt_updated_at();

ALTER TABLE home_maintenance_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hmt: users manage own rows"
  ON home_maintenance_tasks FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 3. home_service_logs
-- ============================================================
CREATE TABLE home_service_logs (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid         NOT NULL REFERENCES auth.users(id)             ON DELETE CASCADE,
  home_id       uuid         NOT NULL REFERENCES homes(id)                  ON DELETE CASCADE,
  task_id       uuid                  REFERENCES home_maintenance_tasks(id) ON DELETE SET NULL,

  -- What was logged
  task_name     text         NOT NULL,
  service_date  date         NOT NULL,
  notes         text,
  cost          numeric(10,2),

  -- Timestamp
  created_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX hsl_user_id_idx     ON home_service_logs (user_id);
CREATE INDEX hsl_home_id_idx     ON home_service_logs (home_id);
CREATE INDEX hsl_task_id_idx     ON home_service_logs (task_id);
CREATE INDEX hsl_service_date_idx ON home_service_logs (service_date DESC);

ALTER TABLE home_service_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hsl: users manage own rows"
  ON home_service_logs FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Done.
-- Tables created: homes, home_maintenance_tasks, home_service_logs
-- ============================================================
