-- ── Asset Sharing ─────────────────────────────────────────────────────────────
-- Run this in your Supabase SQL Editor to enable shared asset access.
-- Safe to run multiple times (uses IF NOT EXISTS / OR REPLACE).

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
-- Owner can do anything with shares they created
DROP POLICY IF EXISTS "owner_manage_shares" ON asset_shares;
CREATE POLICY "owner_manage_shares" ON asset_shares
  FOR ALL USING (owner_user_id = auth.uid());

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

-- Allow a user to claim a pending invite sent to their email
DROP POLICY IF EXISTS "claim_pending_invite" ON asset_shares;
CREATE POLICY "claim_pending_invite" ON asset_shares
  FOR UPDATE
  USING (
    invite_email = auth.email()
    AND status = 'pending'
  )
  WITH CHECK (
    shared_with_user_id = auth.uid()
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
    EXISTS (SELECT 1 FROM asset_shares WHERE asset_type = 'vehicle' AND asset_id = maintenance_tasks.vehicle_id AND shared_with_user_id = auth.uid() AND status = 'accepted')
  );

DROP POLICY IF EXISTS "shared_vehicle_tasks_update" ON maintenance_tasks;
CREATE POLICY "shared_vehicle_tasks_update" ON maintenance_tasks
  FOR UPDATE USING (
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
    EXISTS (SELECT 1 FROM asset_shares WHERE asset_type = 'vehicle' AND asset_id = service_logs.vehicle_id AND shared_with_user_id = auth.uid() AND status = 'accepted')
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
    EXISTS (SELECT 1 FROM asset_shares WHERE asset_type = 'vehicle' AND asset_id = mileage_logs.vehicle_id AND shared_with_user_id = auth.uid() AND status = 'accepted')
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
    EXISTS (SELECT 1 FROM asset_shares WHERE asset_type = 'home' AND asset_id = home_maintenance_tasks.home_id AND shared_with_user_id = auth.uid() AND status = 'accepted')
  );

DROP POLICY IF EXISTS "shared_home_tasks_update" ON home_maintenance_tasks;
CREATE POLICY "shared_home_tasks_update" ON home_maintenance_tasks
  FOR UPDATE USING (
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
    EXISTS (SELECT 1 FROM asset_shares WHERE asset_type = 'home' AND asset_id = home_service_logs.home_id AND shared_with_user_id = auth.uid() AND status = 'accepted')
  );

-- 9. Allow shared members to update vehicles (mileage updates)
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
