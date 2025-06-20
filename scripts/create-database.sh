#!/bin/bash

# Script to create the orchestrator database
# Assumes PostgreSQL is installed and running
# Assumes the 'orchestrator' user already exists

set -e

echo "Creating orchestrator database..."

# Database configuration
DB_NAME="orchestrator"
DB_USER="orchestrator"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

# Check if database exists
if psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    echo "Database '$DB_NAME' already exists."
    read -p "Do you want to drop and recreate it? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Dropping existing database..."
        psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
    else
        echo "Keeping existing database."
        exit 0
    fi
fi

# Create the database
echo "Creating database '$DB_NAME'..."
psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

# Grant all privileges to the orchestrator user
echo "Granting privileges to user '$DB_USER'..."
psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

echo "Database '$DB_NAME' created successfully!"
echo ""
echo "Connection string: postgres://$DB_USER:password@$DB_HOST:$DB_PORT/$DB_NAME"
echo ""
echo "Next steps:"
echo "1. Update the .env file in packages/backend with your database credentials"
echo "2. Run 'npm run db:generate' to generate migrations"
echo "3. Run 'npm run db:migrate' to apply migrations"