# Facet

A web platform for creating, connecting to, and managing Google Cloud Engine virtual machines.

<img width="1357" height="1123" alt="Screenshot 2025-11-11 at 12 58 11 PM" src="https://github.com/user-attachments/assets/042065b6-4732-4b16-adbb-7aaed66f9320" />
<img width="1357" height="1123" alt="Screenshot 2025-11-11 at 12 58 46 PM" src="https://github.com/user-attachments/assets/b8d02c9d-aad2-418a-9836-93d5b656722f" />
<img width="1357" height="1123" alt="Screenshot 2025-11-11 at 12 59 15 PM" src="https://github.com/user-attachments/assets/8b07a3bc-7d90-4b62-b8f3-c1d70e1c459b" />
<img width="1541" height="1123" alt="Screenshot 2025-11-11 at 6 13 58 PM" src="https://github.com/user-attachments/assets/7a61f09d-b0d1-4d89-ae75-b511ea68397d" />


## Features

- Create and manage GCE virtual machines
- Configure init scripts for VMs
- Manage firewall rules and expose ports
- Connect to GCP account via OAuth
- Simple, clean interface built with React and Tailwind CSS

## Tech Stack

- **Frontend**: React, Vite, TypeScript, Tailwind CSS, React Query
- **Backend**: Hono, Drizzle ORM, PostgreSQL
- **Common**: Shared TypeScript types package
- **Infrastructure**: Google Cloud Compute Engine API

## Project Structure

```
├── packages/
│   ├── frontend/      # React frontend application
│   ├── backend/       # Hono API server
│   └── types/         # Shared TypeScript types
├── package.json       # Root package.json for monorepo
└── tsconfig.json      # Root TypeScript config
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create the PostgreSQL database:

First, ensure you have PostgreSQL installed and the `orchestrator` user created:
```bash
# Create the orchestrator user (if not exists)
sudo -u postgres createuser orchestrator -P
```

Then create the database:
```bash
# Option 1: Using the shell script
npm run db:create

# Option 2: Using SQL directly
npm run db:create:sql
```

3. Set up environment variables:

Backend (.env in packages/backend):
```
DATABASE_URL=postgres://orchestrator:orchestrator@localhost:5432/orchestrator
PORT=3000
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

4. Set up the database schema:
```bash
cd packages/backend
npm run db:generate
npm run db:migrate
```

4. Run the development servers:
```bash
# From root directory
npm run dev
```

This will start:
- Backend server on http://localhost:3000
- Frontend dev server on http://localhost:5173

## Google Cloud Setup

1. Create a new project in Google Cloud Console
2. Enable the Compute Engine API
3. Create OAuth 2.0 credentials
4. Add authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
5. Add the client ID and secret to your backend .env file

## Development

- `npm run build` - Build all packages
- `npm run typecheck` - Run TypeScript type checking
- `npm run lint` - Run ESLint on all packages
