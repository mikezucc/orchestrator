# Team Member Invitation Changes

## Summary

Modified the invitation system to automatically create unverified auth users when inviting team members who don't have an account yet.

## Changes Made

### 1. Modified Invitation Endpoint (`/api/invitations` POST)
- **File**: `packages/backend/src/routes/invitations.ts`
- Now checks if the invited email already exists in the system
- If the user doesn't exist:
  - Creates a new auth user with `emailVerified: false` and `totpEnabled: false`
  - Sets `isNewUser = true` flag
- Immediately adds the user to the organization members table with the specified role
- Sends a customized invitation email based on whether they're a new or existing user

### 2. Updated Email Service
- **File**: `packages/backend/src/services/email.ts`
- Modified `sendTeamInvitation()` to accept an `isNewUser` parameter
- Customizes the email content based on whether it's a new user:
  - New users: "You've been invited to join..." with instructions about account setup
  - Existing users: "You've been added to..." with direct login link
- Email directs users to the frontend login URL (`${FRONTEND_URL}/login`)

### 3. Simplified Accept Invitation Endpoint
- **File**: `packages/backend/src/routes/invitations.ts`
- Since users are now immediately added to organizations, the accept endpoint only:
  - Validates the invitation token
  - Marks the invitation as accepted
  - Returns organization details

### 4. Audit Logging
- Added `newUserCreated` flag to audit log metadata when sending invitations
- Tracks whether a new user account was created during the invitation process

## Behavior

### For New Users (email doesn't exist in system):
1. Admin/owner sends invitation
2. System creates unverified auth user
3. User is added to organization with specified role
4. User receives email saying they've been invited
5. Email directs them to login page
6. On first login, they'll need to:
   - Verify their email
   - Set up two-factor authentication

### For Existing Users:
1. Admin/owner sends invitation
2. User is added to organization with specified role
3. User receives email saying they've been added
4. Email directs them to login page
5. They can immediately access the organization

## API Response

The invitation endpoint now returns:
```json
{
  "id": "invitation-id",
  "organizationId": "org-id",
  "email": "user@example.com",
  "role": "member",
  "invitedBy": "inviter-id",
  "expiresAt": "2024-01-01T00:00:00Z",
  "createdAt": "2024-01-01T00:00:00Z",
  "newUserCreated": true  // New field
}
```

## Testing

Use the provided `test-invitation.sh` script to test the invitation flow with curl commands.