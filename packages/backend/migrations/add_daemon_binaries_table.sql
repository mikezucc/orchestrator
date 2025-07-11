CREATE TABLE IF NOT EXISTS daemon_binaries (
  id UUID PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  gcs_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  version VARCHAR(50) NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  size INTEGER NOT NULL,
  uploaded_by UUID NOT NULL,
  organization_id UUID NOT NULL,
  is_latest BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes
CREATE INDEX idx_daemon_binaries_is_latest ON daemon_binaries(is_latest);
CREATE INDEX idx_daemon_binaries_organization_id ON daemon_binaries(organization_id);
CREATE INDEX idx_daemon_binaries_created_at ON daemon_binaries(created_at DESC);

-- Add foreign key constraints if needed
-- ALTER TABLE daemon_binaries ADD CONSTRAINT fk_daemon_binaries_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES auth_users(id);
-- ALTER TABLE daemon_binaries ADD CONSTRAINT fk_daemon_binaries_organization_id FOREIGN KEY (organization_id) REFERENCES organizations(id);