-- Add public_ip column to virtual_machines table
ALTER TABLE virtual_machines 
ADD COLUMN IF NOT EXISTS public_ip TEXT;