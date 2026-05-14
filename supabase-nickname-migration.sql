-- Add nickname column to vehicles and homes tables
-- Run this in your Supabase SQL Editor

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE homes    ADD COLUMN IF NOT EXISTS nickname TEXT;
