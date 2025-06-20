-- Create port_labels table
CREATE TABLE IF NOT EXISTS port_labels (
  id TEXT PRIMARY KEY,
  vm_id TEXT NOT NULL REFERENCES virtual_machines(id) ON DELETE CASCADE,
  port TEXT NOT NULL,
  protocol TEXT NOT NULL DEFAULT 'tcp' CHECK (protocol IN ('tcp', 'udp')),
  label TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  -- Ensure unique port/protocol combination per VM
  UNIQUE(vm_id, port, protocol)
);