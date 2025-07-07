#!/bin/bash

# Test script for invitation flow
# This script demonstrates how the invitation API works

API_URL="http://localhost:3001/api"
AUTH_TOKEN="your-auth-token-here"  # Replace with a valid auth token
ORG_ID="your-org-id-here"  # Replace with a valid organization ID

echo "Testing invitation endpoint..."
echo ""
echo "To test the invitation flow:"
echo "1. Replace AUTH_TOKEN with a valid JWT token from a logged-in admin/owner"
echo "2. Replace ORG_ID with the organization ID"
echo "3. Run: curl -X POST $API_URL/invitations \\"
echo "     -H 'Authorization: Bearer \$AUTH_TOKEN' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"organizationId\": \"\$ORG_ID\", \"email\": \"newuser@example.com\", \"role\": \"member\"}'"
echo ""
echo "Expected behavior:"
echo "- If the email doesn't exist in the system, a new unverified user will be created"
echo "- The user will be immediately added to the organization with the specified role"
echo "- An invitation email will be sent to the user"
echo "- The email will direct them to the login page"
echo "- On first login, they'll need to verify their email and set up 2FA"