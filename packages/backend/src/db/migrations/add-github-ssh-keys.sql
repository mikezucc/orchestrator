-- Add GitHub OAuth fields to auth_users table
ALTER TABLE auth_users 
ADD COLUMN github_access_token TEXT,
ADD COLUMN github_username TEXT,
ADD COLUMN github_user_id TEXT,
ADD COLUMN github_email TEXT;

-- Create user_ssh_keys table
CREATE TABLE user_ssh_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  key_name TEXT NOT NULL,
  public_key TEXT NOT NULL,
  private_key_encrypted TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  key_type TEXT NOT NULL DEFAULT 'ssh-rsa',
  source TEXT NOT NULL CHECK (source IN ('github', 'manual', 'generated')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create unique index on user_id and key_name
CREATE UNIQUE INDEX user_ssh_keys_user_key_name_unique ON user_ssh_keys(user_id, key_name);

-- Create indexes for performance
CREATE INDEX idx_user_ssh_keys_user_id ON user_ssh_keys(user_id);
CREATE INDEX idx_user_ssh_keys_is_active ON user_ssh_keys(is_active);
CREATE INDEX idx_user_ssh_keys_source ON user_ssh_keys(source);