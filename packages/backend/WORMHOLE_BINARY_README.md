# Wormhole Daemon Binary Distribution

This document describes how to download and upload the wormhole daemon binary through the orchestrator API.

## Downloading the Wormhole Daemon

The wormhole daemon binary can be downloaded by anyone without authentication.

### Basic Download

```bash
# Download the default linux-amd64 binary
curl -O https://api.onfacet.dev/api/wormhole/daemon/download

# Save with a custom filename
curl -o wormhole-daemon https://api.onfacet.dev/api/wormhole/daemon/download
```

### Platform-Specific Downloads

Specify the platform using the `platform` query parameter:

```bash
# Linux AMD64 (default)
curl -O https://api.onfacet.dev/api/wormhole/daemon/download?platform=linux-amd64

# Linux ARM64
curl -O https://api.onfacet.dev/api/wormhole/daemon/download?platform=linux-arm64

# macOS AMD64
curl -O https://api.onfacet.dev/api/wormhole/daemon/download?platform=darwin-amd64

# macOS ARM64 (Apple Silicon)
curl -O https://api.onfacet.dev/api/wormhole/daemon/download?platform=darwin-arm64
```

### Make Executable and Run

After downloading, make the binary executable:

```bash
# Download the binary
curl -o wormhole-daemon https://api.onfacet.dev/api/wormhole/daemon/download

# Make it executable
chmod +x wormhole-daemon

# Run the daemon
./wormhole-daemon
```

### One-Line Install

For quick installation on Linux/macOS:

```bash
# Linux AMD64
curl -L https://api.onfacet.dev/api/wormhole/daemon/download?platform=linux-amd64 -o /usr/local/bin/wormhole-daemon && chmod +x /usr/local/bin/wormhole-daemon

# macOS ARM64 (Apple Silicon)
curl -L https://api.onfacet.dev/api/wormhole/daemon/download?platform=darwin-arm64 -o /usr/local/bin/wormhole-daemon && chmod +x /usr/local/bin/wormhole-daemon
```

## Uploading New Binaries (Admin Only)

Uploading new wormhole daemon binaries is restricted to members of the `slopboxprimary` organization.

### Prerequisites

1. Valid authentication token
2. Membership in the `slopboxprimary` organization

### Upload Command

```bash
# Upload a new binary for linux-amd64
curl -X POST https://api.onfacet.dev/api/wormhole/daemon/upload?platform=linux-amd64 \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -F "binary=@/path/to/new/wormhole-daemon"

# Upload for a different platform
curl -X POST https://api.onfacet.dev/api/wormhole/daemon/upload?platform=darwin-arm64 \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -F "binary=@/path/to/new/wormhole-daemon-darwin-arm64"
```

### Response

Successful upload returns:
```json
{
  "success": true,
  "data": {
    "platform": "linux-amd64",
    "size": 15728640
  }
}
```

## Error Handling

### Download Errors

- **404 Not Found**: No binary available for the specified platform
- **500 Internal Server Error**: Server error during download

### Upload Errors

- **401 Unauthorized**: Missing or invalid authentication token
- **403 Forbidden**: User is not a member of the slopboxprimary organization
- **400 Bad Request**: No binary file provided in the request
- **500 Internal Server Error**: Server error during upload

## Supported Platforms

The following platform identifiers are commonly used:

- `linux-amd64` - Linux x86_64
- `linux-arm64` - Linux ARM64
- `darwin-amd64` - macOS x86_64
- `darwin-arm64` - macOS ARM64 (Apple Silicon)
- `windows-amd64` - Windows x86_64

## Security Notes

- Download endpoint is public and doesn't require authentication
- Upload endpoint requires:
  - Valid authentication token
  - Membership in the `slopboxprimary` organization
- Uploaded binaries are automatically made executable (chmod 755)
- Binaries are stored on the server filesystem

## Examples

### Check if Binary Exists

```bash
# Use HEAD request to check without downloading
curl -I https://api.onfacet.dev/api/wormhole/daemon/download?platform=linux-arm64
```

### Download with Progress Bar

```bash
# Using curl with progress bar
curl -# -o wormhole-daemon https://api.onfacet.dev/api/wormhole/daemon/download

# Using wget
wget https://api.onfacet.dev/api/wormhole/daemon/download -O wormhole-daemon
```

### Verify Download

```bash
# Download and show file info
curl -o wormhole-daemon https://api.onfacet.dev/api/wormhole/daemon/download && \
  file wormhole-daemon && \
  ls -la wormhole-daemon
```