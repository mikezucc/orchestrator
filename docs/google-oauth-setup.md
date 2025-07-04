# Google OAuth Setup Guide

This guide will help you set up Google OAuth for the GCE VM Platform.

## Prerequisites

1. A Google Cloud account
2. A Google Cloud project

## Steps

### 1. Enable Required APIs

1. Go to the [Google Cloud Console](https://console.cloud.google.com)
2. Select your project
3. Navigate to "APIs & Services" > "Enable APIs and Services"
4. Search for and enable:
   - **Google Compute Engine API**
   - **Google+ API** (for user info)

### 2. Create OAuth 2.0 Credentials

1. Navigate to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. If prompted, configure the OAuth consent screen:
   - Choose "External" user type
   - Fill in the required fields:
     - App name: "Facet VM Platform"
     - User support email: Your email
     - Developer contact information: Your email
   - Add scopes:
     - `https://www.googleapis.com/auth/compute` (Required for VM operations)
     - `https://www.googleapis.com/auth/userinfo.email` (Required for user identification)
   - Add test users if in development
   - IMPORTANT: Make sure your OAuth consent screen is verified for production use

### 3. Configure OAuth Client

1. After consent screen setup, create the OAuth client:
   - Application type: "Web application"
   - Name: "GCE VM Platform"
   - Authorized JavaScript origins:
     - `http://localhost:3000`
     - `http://localhost:5173`
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/google/callback`

2. Copy the generated:
   - **Client ID**
   - **Client Secret**

### 4. Configure Environment Variables

Create a `.env` file in `packages/backend/` with:

```env
DATABASE_URL=postgres://orchestrator:orchestrator@localhost:5432/orchestrator
PORT=3000
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

### 5. Test the OAuth Flow

1. Start the backend server:
   ```bash
   cd packages/backend
   npm run dev
   ```

2. Start the frontend server:
   ```bash
   cd packages/frontend
   npm run dev
   ```

3. Navigate to http://localhost:5173
4. Click "Sign in with Google"
5. You should be redirected to Google's OAuth consent screen
6. After authorization, you'll be redirected back to the app

## Troubleshooting

### Common Issues

1. **"redirect_uri_mismatch" error**
   - Ensure the redirect URI in your Google Console exactly matches: `http://localhost:3000/api/auth/google/callback`
   - Check that your `.env` file has the correct `GOOGLE_REDIRECT_URI`

2. **"Missing required environment variables" error**
   - Make sure all required env vars are set in `.env`
   - Restart the backend server after updating `.env`

3. **CORS errors**
   - The backend is configured to accept requests from localhost:5173 and localhost:3000
   - If using different ports, update the CORS configuration in `packages/backend/src/index.ts`

4. **"Unauthorized" or scope errors**
   - Ensure you've enabled the Google Compute Engine API
   - Check that the OAuth consent screen includes the required scopes

### Debug Mode

To see more detailed logs:

1. Open browser developer console
2. Check the Network tab for failed requests
3. Look at the backend server console for error messages

## Production Setup

For production deployment:

1. Update the authorized redirect URIs to your production domain
2. Update the CORS origins in the backend
3. Use HTTPS for all URLs
4. Store secrets securely (not in `.env` files)