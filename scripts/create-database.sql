-- SQL script to create the orchestrator database
-- Run this script as the postgres superuser:
-- psql -U postgres -f scripts/create-database.sql

-- Create database
CREATE DATABASE orchestrator OWNER orchestrator;

-- Grant all privileges
GRANT ALL PRIVILEGES ON DATABASE orchestrator TO orchestrator;

-- Connect to the new database
\c orchestrator;

-- Grant schema permissions
GRANT ALL ON SCHEMA public TO orchestrator;
GRANT CREATE ON SCHEMA public TO orchestrator;