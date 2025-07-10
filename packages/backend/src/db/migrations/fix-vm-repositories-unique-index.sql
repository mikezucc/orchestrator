-- Drop the existing unique index that doesn't have the WHERE clause
DROP INDEX IF EXISTS "vm_repositories_vm_repository_unique";

-- Create the unique index with WHERE clause to only enforce uniqueness for active relationships
CREATE UNIQUE INDEX "vm_repositories_vm_repository_unique" 
ON "vm_repositories" ("vm_id", "repository_id") 
WHERE "removed_at" IS NULL;