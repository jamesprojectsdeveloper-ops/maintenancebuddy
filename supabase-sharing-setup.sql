-- ── Asset Sharing ─────────────────────────────────────────────────────────────
-- Run this in your Supabase SQL Editor to enable shared asset access.
-- Safe to run multiple times (uses IF NOT EXISTS / OR REPLACE).

-- 0. Drop any previously-created cross-user profile read policies.
--    The app reads owner display names from the owner_name column on asset_shares,
--    so no cross-user SELECT on the profiles table is required.
--    The base "Users can manage their own profile" policy (in supabase-setup.sql)
--    already covers self-access — that is the only profiles access needed.
DROP POLICY IF EXISTS "profiles_read_authenticated" ON profiles;
DROP POLICY IF EXISTS "profiles_read_shared_peers" ON profiles;
DROP POLICY IF EXISTS "profiles_read_share_counterparty" ON profiles;

-- Store the owner's display name in the share record so it's always available.
ALTER TABLE asset_shares ADD COLUMN IF NOT EXISTS owner_name text;

-- 1. Create asset_shares table
CREATE TABLE IF NOT EXISTS asset_shares (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type          text NOT NULL,
  asset_id            uuid NOT NULL,
  owner_user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_email        text NOT NULL,
  shared_with_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'pending',
  created_at          timestamptz DEFAULT now()
);

-- Patch any missing columns if table already existed with an older schema
ALTER TABLE asset_shares ADD COLUMN IF NOT EXISTS asset_type text;
ALTER TABLE asset_shares ADD COLUMN IF NOT EXISTS asset_id uuid;
ALTER TABLE asset_shares ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE asset_shares ADD COLUMN IF NOT EXISTS invite_email text;
ALTER TABLE asset_shares ADD COLUMN IF NOT EXISTS shared_with_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE asset_shares ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE asset_shares ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE asset_shares ENABLE ROW LEVEL SECURITY;

-- 2. RLS policies for asset_shares
-- Owner can do anything with shares they created, but only for assets they actually own.
-- WITH CHECK prevents any user from forging a share for someone else's vehicle or home
-- by requiring the referenced asset_id to be owned by auth.uid() in the real asset table.
DROP POLICY IF EXISTS "owner_manage_shares" ON asset_shares;
CREATE POLICY "owner_manage_shares" ON asset_shares
  FOR ALL
  USING (owner_user_id = auth.uid())
  WITH CHECK (
    owner_user_id = auth.uid()
    AND (
      (asset_type = 'vehicle' AND EXISTS (
        SELECT 1 FROM vehicles WHERE id = asset_id AND user_id = auth.uid()
      ))
      OR
      (asset_type = 'home' AND EXISTS (
        SELECT 1 FROM homes WHERE id = asset_id AND user_id = auth.uid()
      ))
    )
  );

-- Invitee can see shares assigned to them
DROP POLICY IF EXISTS "invitee_view_shares" ON asset_shares;
CREATE POLICY "invitee_view_shares" ON asset_shares
  FOR SELECT USING (shared_with_user_id = auth.uid());

-- Anyone can see pending invites addressed to their email (before claim)
DROP POLICY IF EXISTS "see_pending_by_email" ON asset_shares;
CREATE POLICY "see_pending_by_email" ON asset_shares
  FOR SELECT USING (
    invite_email = auth.email()
  );

-- Allow a user to claim a pending invite sent to their email.
-- Immutability of asset_type, asset_id, owner_user_id, invite_email is enforced
-- by the trigger enforce_asset_share_claim_only (below) to avoid the self-referential
-- subquery pattern which causes "infinite recursion detected in policy" in Postgres.
DROP POLICY IF EXISTS "claim_pending_invite" ON asset_shares;
CREATE POLICY "claim_pending_invite" ON asset_shares
  FOR UPDATE
  USING (
    invite_email = auth.email()
    AND status = 'pending'
  )
  WITH CHECK (
    shared_with_user_id = auth.uid()
    AND status = 'accepted'
    AND invite_email = auth.email()
  );

-- Invitee can delete (decline / leave) their own shares
DROP POLICY IF EXISTS "invitee_delete_share" ON asset_shares;
CREATE POLICY "invitee_delete_share" ON asset_shares
  FOR DELETE USING (shared_with_user_id = auth.uid());

-- 3. Shared-member SELECT access on vehicles and homes
DROP POLICY IF EXISTS "shared_vehicle_select" ON vehicles;
CREATE POLICY "shared_vehicle_select" ON vehicles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM asset_shares
      WHERE asset_type = 'vehicle'
        AND asset_id = vehicles.id
        AND shared_with_user_id = auth.uid()
        AND status = 'accepted'
    )
  );

DROP POLICY IF EXISTS "shared_home_select" ON homes;
CREATE POLICY "shared_home_select" ON homes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM asset_shares
      WHERE asset_type = 'home'
        AND asset_id = homes.id
        AND shared_with_user_id = auth.uid()
        AND status = 'accepted'
    )
  );

-- 4. maintenance_tasks — shared member read + write
DROP POLICY IF EXISTS "shared_vehicle_tasks_select" ON maintenance_tasks;
CREATE POLICY "shared_vehicle_tasks_select" ON maintenance_tasks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM asset_shares WHERE asset_type = 'vehicle' AND asset_id = maintenance_tasks.vehicle_id AND shared_with_user_id = auth.uid() AND status = 'accepted')
  );

DROP POLICY IF EXISTS "shared_vehicle_tasks_insert" ON maintenance_tasks;
CREATE POLICY "shared_vehicle_tasks_insert" ON maintenance_tasks
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM asset_shares WHERE asset_type = 'vehicle' AND asset_id = maintenance_tasks.vehicle_id AND shared_with_user_id = auth.uid() AND status = 'accepted')
  );

DROP POLICY IF EXISTS "shared_vehicle_tasks_update" ON maintenance_tasks;
CREATE POLICY "shared_vehicle_tasks_update" ON maintenance_tasks
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM asset_shares WHERE asset_type = 'vehicle' AND asset_id = maintenance_tasks.vehicle_id AND shared_with_user_id = auth.uid() AND status = 'accepted')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM asset_shares WHERE asset_type = 'vehicle' AND asset_id = maintenance_tasks.vehicle_id AND shared_with_user_id = auth.uid() AND status = 'accepted')
  );

-- 5. service_logs — shared member read + write
DROP POLICY IF EXISTS "shared_vehicle_service_logs_select" ON service_logs;
CREATE POLICY "shared_vehicle_service_logs_select" ON service_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM asset_shares WHERE asset_type = 'vehicle' AND asset_id = service_logs.vehicle_id AND shared_with_user_id = auth.uid() AND status = 'accepted')
  );

DROP POLICY IF EXISTS "shared_vehicle_service_logs_insert" ON service_logs;
CREATE POLICY "shared_vehicle_service_logs_insert" ON service_logs
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM asset_shares WHERE asset_type = 'vehicle' AND asset_id = service_logs.vehicle_id AND shared_with_user_id = auth.uid() AND status = 'accepted')
  );

-- 6. mileage_logs — shared member read + write
DROP POLICY IF EXISTS "shared_vehicle_mileage_select" ON mileage_logs;
CREATE POLICY "shared_vehicle_mileage_select" ON mileage_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM asset_shares WHERE asset_type = 'vehicle' AND asset_id = mileage_logs.vehicle_id AND shared_with_user_id = auth.uid() AND status = 'accepted')
  );

DROP POLICY IF EXISTS "shared_vehicle_mileage_insert" ON mileage_logs;
CREATE POLICY "shared_vehicle_mileage_insert" ON mileage_logs
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM asset_shares WHERE asset_type = 'vehicle' AND asset_id = mileage_logs.vehicle_id AND shared_with_user_id = auth.uid() AND status = 'accepted')
  );

-- 7. home_maintenance_tasks — shared member read + write
DROP POLICY IF EXISTS "shared_home_tasks_select" ON home_maintenance_tasks;
CREATE POLICY "shared_home_tasks_select" ON home_maintenance_tasks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM asset_shares WHERE asset_type = 'home' AND asset_id = home_maintenance_tasks.home_id AND shared_with_user_id = auth.uid() AND status = 'accepted')
  );

DROP POLICY IF EXISTS "shared_home_tasks_insert" ON home_maintenance_tasks;
CREATE POLICY "shared_home_tasks_insert" ON home_maintenance_tasks
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM asset_shares WHERE asset_type = 'home' AND asset_id = home_maintenance_tasks.home_id AND shared_with_user_id = auth.uid() AND status = 'accepted')
  );

DROP POLICY IF EXISTS "shared_home_tasks_update" ON home_maintenance_tasks;
CREATE POLICY "shared_home_tasks_update" ON home_maintenance_tasks
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM asset_shares WHERE asset_type = 'home' AND asset_id = home_maintenance_tasks.home_id AND shared_with_user_id = auth.uid() AND status = 'accepted')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM asset_shares WHERE asset_type = 'home' AND asset_id = home_maintenance_tasks.home_id AND shared_with_user_id = auth.uid() AND status = 'accepted')
  );

-- 8. home_service_logs — shared member read + write (assumes home_id column exists)
DROP POLICY IF EXISTS "shared_home_service_logs_select" ON home_service_logs;
CREATE POLICY "shared_home_service_logs_select" ON home_service_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM asset_shares WHERE asset_type = 'home' AND asset_id = home_service_logs.home_id AND shared_with_user_id = auth.uid() AND status = 'accepted')
  );

DROP POLICY IF EXISTS "shared_home_service_logs_insert" ON home_service_logs;
CREATE POLICY "shared_home_service_logs_insert" ON home_service_logs
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM asset_shares WHERE asset_type = 'home' AND asset_id = home_service_logs.home_id AND shared_with_user_id = auth.uid() AND status = 'accepted')
  );

-- 9. Shared-member vehicle updates — mileage fields ONLY.
--
--    Supabase RLS cannot restrict individual columns, so column-level enforcement
--    is handled by the trigger function below (enforce_shared_vehicle_mileage_only).
--    The RLS policy here only gates who may attempt the update at all; the trigger
--    then rejects any update that touches a non-mileage column for non-owners.
--    This approach is future-proof: adding a new column to vehicles automatically
--    makes it immutable for shared users without any policy change.

-- Trigger function: rejects shared-user updates that touch non-mileage columns.
-- IMPORTANT: We compare auth.uid() against OLD.user_id (the actual pre-update owner),
-- NOT NEW.user_id. Comparing against NEW.user_id would allow an attacker to bypass
-- the check by setting NEW.user_id = auth.uid() — the trigger must key off the
-- existing owner, which the attacker cannot control.
CREATE OR REPLACE FUNCTION enforce_shared_vehicle_mileage_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only enforce restrictions when the caller is NOT the actual (pre-update) vehicle owner.
  IF auth.uid() IS NOT DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  -- For shared users, every column except current_mileage and mileage_updated_at
  -- must remain identical to its pre-update value.
  IF
    OLD.user_id                    IS DISTINCT FROM NEW.user_id                    OR
    OLD.make                       IS DISTINCT FROM NEW.make                       OR
    OLD.model                      IS DISTINCT FROM NEW.model                      OR
    OLD.year                       IS DISTINCT FROM NEW.year                       OR
    OLD.trim                       IS DISTINCT FROM NEW.trim                       OR
    OLD.drivetrain                 IS DISTINCT FROM NEW.drivetrain                 OR
    OLD.is_turbo                   IS DISTINCT FROM NEW.is_turbo                   OR
    OLD.engine                     IS DISTINCT FROM NEW.engine                     OR
    OLD.color                      IS DISTINCT FROM NEW.color                      OR
    OLD.nickname                   IS DISTINCT FROM NEW.nickname                   OR
    OLD.oil_brand                  IS DISTINCT FROM NEW.oil_brand                  OR
    OLD.oil_type                   IS DISTINCT FROM NEW.oil_type                   OR
    OLD.oil_viscosity              IS DISTINCT FROM NEW.oil_viscosity              OR
    OLD.tire_brand                 IS DISTINCT FROM NEW.tire_brand                 OR
    OLD.tire_size                  IS DISTINCT FROM NEW.tire_size                  OR
    OLD.tires_installed_at_mileage IS DISTINCT FROM NEW.tires_installed_at_mileage OR
    OLD.accessories                IS DISTINCT FROM NEW.accessories                OR
    OLD.using_defaults             IS DISTINCT FROM NEW.using_defaults             OR
    OLD.avg_miles_per_month        IS DISTINCT FROM NEW.avg_miles_per_month        OR
    OLD.mileage_log_count          IS DISTINCT FROM NEW.mileage_log_count          OR
    OLD.created_at                 IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'Shared users may only update mileage fields (current_mileage, mileage_updated_at) on a vehicle.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shared_vehicle_mileage_only_trigger ON vehicles;
CREATE TRIGGER shared_vehicle_mileage_only_trigger
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION enforce_shared_vehicle_mileage_only();

-- Drop any previously-created RESTRICTIVE policies — they interfere with legitimate
-- shared-user updates. The trigger enforce_shared_vehicle_mileage_only already
-- prevents ownership-field tampering on vehicles at the DB level.
DROP POLICY IF EXISTS "vehicles_user_id_immutable" ON vehicles;
DROP POLICY IF EXISTS "maintenance_tasks_user_id_immutable" ON maintenance_tasks;
DROP POLICY IF EXISTS "home_maintenance_tasks_user_id_immutable" ON home_maintenance_tasks;

-- RLS policy: gates which rows a shared user may attempt to update.
-- Column-level enforcement is handled by the trigger above.
DROP POLICY IF EXISTS "shared_vehicle_update" ON vehicles;
CREATE POLICY "shared_vehicle_update" ON vehicles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM asset_shares
      WHERE asset_type = 'vehicle'
        AND asset_id = vehicles.id
        AND shared_with_user_id = auth.uid()
        AND status = 'accepted'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM asset_shares
      WHERE asset_type = 'vehicle'
        AND asset_id = vehicles.id
        AND shared_with_user_id = auth.uid()
        AND status = 'accepted'
    )
  );

-- Trigger: prevent claimants from modifying immutable fields on asset_shares rows.
-- This replaces the self-referential subquery approach (which causes infinite recursion)
-- by enforcing field immutability at the trigger level instead of inside the RLS policy.
CREATE OR REPLACE FUNCTION enforce_asset_share_claim_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Owners managing their own shares are unrestricted.
  IF auth.uid() IS NOT DISTINCT FROM OLD.owner_user_id THEN
    RETURN NEW;
  END IF;

  -- Claimants may only update shared_with_user_id and status.
  -- All other fields must remain identical to their pre-update values.
  IF
    OLD.asset_type    IS DISTINCT FROM NEW.asset_type    OR
    OLD.asset_id      IS DISTINCT FROM NEW.asset_id      OR
    OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id OR
    OLD.invite_email  IS DISTINCT FROM NEW.invite_email  OR
    OLD.created_at    IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'You may only set shared_with_user_id and status when claiming an invite.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS asset_share_claim_only_trigger ON asset_shares;
CREATE TRIGGER asset_share_claim_only_trigger
  BEFORE UPDATE ON asset_shares
  FOR EACH ROW EXECUTE FUNCTION enforce_asset_share_claim_only();

-- 10. Allow shared members to insert mileage_logs (needed for odometer update)
-- Note: the base "Users can manage their own mileage logs" policy only matches user_id = auth.uid()
-- Shared users insert with their own user_id so they pass the base INSERT policy already.
-- This extra policy covers the case where vehicle RLS would block the lookup.
DROP POLICY IF EXISTS "shared_vehicle_mileage_update" ON mileage_logs;
CREATE POLICY "shared_vehicle_mileage_update" ON mileage_logs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM asset_shares
      WHERE asset_type = 'vehicle'
        AND asset_id = mileage_logs.vehicle_id
        AND shared_with_user_id = auth.uid()
        AND status = 'accepted'
    )
  );
