-- ============================================================
-- MaintenanceBuddy — Duplicate Task Cleanup
-- Run this once in your Supabase SQL Editor to remove all
-- duplicate maintenance tasks, keeping only the most recently
-- created row per (name, asset) pair.
-- ============================================================

-- 1. Remove duplicate HOME maintenance tasks
--    Keeps the row with the highest id (most recently inserted)
DELETE FROM home_maintenance_tasks
WHERE id NOT IN (
  SELECT DISTINCT ON (home_id, lower(trim(name))) id
  FROM home_maintenance_tasks
  ORDER BY home_id, lower(trim(name)), created_at DESC, id DESC
);

-- 2. Remove duplicate VEHICLE maintenance tasks
--    Keeps the row with the highest id (most recently inserted)
DELETE FROM maintenance_tasks
WHERE id NOT IN (
  SELECT DISTINCT ON (vehicle_id, lower(trim(name))) id
  FROM maintenance_tasks
  ORDER BY vehicle_id, lower(trim(name)), created_at DESC, id DESC
);

-- 3. Verify counts after cleanup
SELECT 'home_maintenance_tasks' AS table_name, home_id, COUNT(*) AS task_count
FROM home_maintenance_tasks
GROUP BY home_id
UNION ALL
SELECT 'maintenance_tasks', vehicle_id::text, COUNT(*)
FROM maintenance_tasks
GROUP BY vehicle_id
ORDER BY table_name, task_count DESC;
