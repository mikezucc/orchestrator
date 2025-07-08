#!/bin/bash

# Test script for wormhole binary endpoints

BASE_URL="http://localhost:3000/api/wormhole"

echo "Testing wormhole daemon endpoints..."
echo

# Test 1: Download binary (should fail if no binary exists)
echo "1. Testing download endpoint..."
curl -X GET "${BASE_URL}/daemon/download?platform=linux-amd64" \
  -o /tmp/test-wormhole-daemon \
  -w "\nHTTP Status: %{http_code}\n"
echo

# Test 2: Upload binary without auth (should fail)
echo "2. Testing upload without authentication..."
curl -X POST "${BASE_URL}/daemon/upload?platform=linux-amd64" \
  -F "binary=@/bin/echo" \
  -w "\nHTTP Status: %{http_code}\n"
echo

# Test 3: Upload binary with auth but not slopboxprimary member (should fail)
echo "3. Testing upload with non-slopboxprimary member..."
echo "NOTE: You'll need to replace TOKEN with a valid auth token"
# curl -X POST "${BASE_URL}/daemon/upload?platform=linux-amd64" \
#   -H "Authorization: Bearer TOKEN" \
#   -F "binary=@/bin/echo" \
#   -w "\nHTTP Status: %{http_code}\n"
echo

echo "Example curl commands:"
echo
echo "# Download binary:"
echo "curl -O ${BASE_URL}/daemon/download?platform=linux-amd64"
echo
echo "# Upload binary (requires auth and slopboxprimary membership):"
echo "curl -X POST ${BASE_URL}/daemon/upload?platform=linux-amd64 \\"
echo "  -H 'Authorization: Bearer YOUR_TOKEN' \\"
echo "  -F 'binary=@/path/to/wormhole-daemon'"