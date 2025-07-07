# Moments Feature Documentation

## Overview

The Moments feature allows users to capture visual changes in their VMs and associate them with git commits. This provides a visual history of the repository alongside the git history, making it easy to see what changed in certain commits or what the latest branch looks like.

## Features

- **Moment Creation**: Capture the current state with a title, description, and tags
- **Git Integration**: Automatically capture git branch, commit hash, message, author, and diff
- **Asset Upload**: Upload screenshots, screen recordings, logs, and config files
- **Organization Scoped**: All moments and assets are scoped by organization
- **Google Cloud Storage**: Assets are stored in GCS with signed URLs for secure access
- **VM Agent Support**: VMs can programmatically create moments using CLI tools

## Architecture

### Database Schema

```sql
-- moments table
- id: Unique identifier
- organizationId: Organization scope
- vmId: Associated VM (optional)
- git fields: branch, commit hash, message, author, email, date, diff
- title, description, tags
- metadata: JSON field for additional data
- soft delete support

-- moment_assets table  
- id: Unique identifier
- momentId: Associated moment
- assetType: screenshot, screen_recording, log_file, config_file, other
- file metadata: name, mime type, size
- GCS storage: bucket, path, generation
- processing status and metadata
- upload method tracking
```

### API Endpoints

#### User Endpoints

##### `POST /api/moments/create`
Create a new moment.

**Headers:**
- `Authorization: Bearer <token>` - User authentication token
- `x-organization-id: <org-id>` - Organization context
- `Content-Type: application/json`

**Request Body:**
```json
{
  "vmId": "vm_123",                    // optional
  "title": "Homepage redesign",        // required
  "description": "New layout live",    // optional
  "tags": ["frontend", "release"],     // optional, array of strings
  "gitBranch": "main",                 // optional
  "gitCommitHash": "abc123...",        // optional
  "gitCommitMessage": "feat: ...",     // optional
  "gitAuthor": "John Doe",             // optional
  "gitAuthorEmail": "john@example.com", // optional
  "gitCommitDate": "2024-01-01T00:00:00Z", // optional, ISO 8601
  "gitDiff": "diff --git ...",        // optional
  "metadata": {}                       // optional, any JSON object
}
```

**Response:**
```json
{
  "success": true,
  "moment": {
    "id": "moment_123",
    "organizationId": "org_123",
    "createdBy": "user_123",
    "vmId": "vm_123",
    "title": "Homepage redesign",
    "description": "New layout live",
    "tags": ["frontend", "release"],
    "gitBranch": "main",
    "gitCommitHash": "abc123...",
    "gitCommitMessage": "feat: ...",
    "gitAuthor": "John Doe",
    "gitAuthorEmail": "john@example.com",
    "gitCommitDate": "2024-01-01T00:00:00.000Z",
    "gitDiff": "diff --git ...",
    "metadata": {},
    "isDeleted": false,
    "deletedAt": null,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

##### `POST /api/moments/:momentId/assets/upload`
Get a signed URL for uploading an asset to a moment.

**Headers:**
- `Authorization: Bearer <token>`
- `x-organization-id: <org-id>`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "assetType": "screenshot",           // required: screenshot|screen_recording|log_file|config_file|other
  "fileName": "homepage.png",          // required
  "mimeType": "image/png",             // required
  "fileSizeBytes": 1048576,            // required, max 500MB (524288000)
  "uploadMethod": "web_ui"             // required: web_ui|api|vm_agent|cli
}
```

**Response:**
```json
{
  "success": true,
  "assetId": "asset_123",
  "uploadUrl": "https://storage.googleapis.com/...",  // Signed URL for PUT request
  "gcsPath": "moment_123/asset_123-homepage.png"
}
```

**Upload Process:**
After receiving the signed URL, upload the file directly:
```bash
curl -X PUT \
  -H "Content-Type: image/png" \
  --data-binary @homepage.png \
  "https://storage.googleapis.com/..."
```

##### `GET /api/moments/list`
List moments with optional filtering.

**Headers:**
- `Authorization: Bearer <token>`
- `x-organization-id: <org-id>`

**Query Parameters:**
- `vmId` (optional) - Filter by VM ID
- `gitBranch` (optional) - Filter by git branch
- `tags` (optional) - Filter by tags (can be repeated for multiple tags)
- `limit` (optional, default: 50, max: 100) - Number of results
- `offset` (optional, default: 0) - Pagination offset

**Example:** `/api/moments/list?vmId=vm_123&gitBranch=main&tags=frontend&tags=release&limit=20`

**Response:**
```json
{
  "success": true,
  "moments": [
    {
      "moment": { /* Full moment object */ },
      "createdByUser": {
        "id": "user_123",
        "email": "john@example.com",
        "name": "John Doe"
      },
      "vm": {
        "id": "vm_123",
        "name": "production-web"
      },
      "assetCount": 3
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

##### `GET /api/moments/:momentId`
Get detailed information about a specific moment including all assets.

**Headers:**
- `Authorization: Bearer <token>`
- `x-organization-id: <org-id>`

**Response:**
```json
{
  "success": true,
  "moment": {
    "moment": { /* Full moment object */ },
    "createdByUser": {
      "id": "user_123",
      "email": "john@example.com",
      "name": "John Doe"
    },
    "vm": { /* Full VM object if associated */ }
  },
  "assets": [
    {
      "asset": {
        "id": "asset_123",
        "momentId": "moment_123",
        "assetType": "screenshot",
        "fileName": "homepage.png",
        "mimeType": "image/png",
        "fileSizeBytes": 1048576,
        "gcsBucket": "moments-org_123",
        "gcsPath": "moment_123/asset_123-homepage.png",
        "metadata": {
          "width": 1920,
          "height": 1080
        },
        "processingStatus": "completed",
        "uploadedBy": "user_123",
        "uploadMethod": "web_ui",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      },
      "uploadedByUser": {
        "id": "user_123",
        "email": "john@example.com",
        "name": "John Doe"
      },
      "downloadUrl": "https://storage.googleapis.com/..."  // Signed URL valid for 1 hour
    }
  ]
}
```

##### `DELETE /api/moments/:momentId`
Soft delete a moment (marks as deleted but doesn't remove data).

**Headers:**
- `Authorization: Bearer <token>`
- `x-organization-id: <org-id>`

**Response:**
```json
{
  "success": true
}
```

**Note:** Only the moment creator or organization admin can delete moments.

#### VM Agent Endpoints

##### `POST /api/moments/vm/create`
Create a moment from a VM agent.

**Headers:**
- `X-VM-ID: <vm-id>` - VM identifier
- `X-VM-Token: <token>` - VM authentication token
- `Content-Type: application/json`

**Request Body:** Same as user endpoint `/api/moments/create`

**Response:** Same as user endpoint, but `metadata` will include:
```json
{
  "metadata": {
    "createdByVMAgent": true,
    "vmName": "production-web"
  }
}
```

##### `POST /api/moments/vm/:momentId/assets/upload`
Get a signed URL for uploading an asset from a VM.

**Headers:**
- `X-VM-ID: <vm-id>`
- `X-VM-Token: <token>`
- `Content-Type: application/json`

**Request Body:** Same as user endpoint `/api/moments/:momentId/assets/upload`

**Response:** Same as user endpoint

**Note:** VM can only upload assets to moments it created.

##### `POST /api/moments/assets/:assetId/status`
Update asset processing status (internal use).

**Headers:**
- `Authorization: Bearer <token>`
- `x-organization-id: <org-id>`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "status": "completed",              // pending|processing|completed|failed
  "error": "Processing failed: ...",  // optional, for failed status
  "metadata": {                       // optional, merge with existing
    "width": 1920,
    "height": 1080
  }
}
```

**Response:**
```json
{
  "success": true
}
```

### Error Responses

All endpoints return consistent error responses:

**400 Bad Request:**
```json
{
  "error": "Invalid request body"
}
```

**401 Unauthorized:**
```json
{
  "error": "Missing or invalid authentication"
}
```

**403 Forbidden:**
```json
{
  "error": "Unauthorized to perform this action"
}
```

**404 Not Found:**
```json
{
  "error": "Moment not found"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Failed to create moment"
}
```

### Common Status Codes

- `200 OK` - Successful request
- `400 Bad Request` - Invalid request parameters or body
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Valid auth but insufficient permissions
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

### Storage

Assets are stored in Google Cloud Storage with:
- Organization-specific buckets: `moments-{organizationId}`
- Path structure: `{momentId}/{assetId}-{filename}`
- Versioning enabled
- 1-year lifecycle for non-current versions
- Signed URLs for secure uploads/downloads

## Frontend Components

### MomentCapture
Modal component for creating new moments with:
- Basic information (title, description, tags)
- Git information fields (optional)
- Drag-and-drop file upload
- Real-time upload progress

### MomentsList
List view component with:
- Pagination support
- Filter by branch and tags
- Asset count display
- Quick preview of git info

### MomentDetail
Detailed view with:
- Full moment information
- Asset preview (images, videos)
- Download links for all assets
- Delete functionality

### MomentsSection
Container component that combines all moment features for easy integration.

### Environment Variables
- `ORCHESTRATOR_API_URL` - API endpoint (optional)

## Usage Examples

### Creating a Moment from the UI
1. Navigate to a VM detail page
2. Click "Capture Moment" button
3. Fill in title and optional description
4. Add tags for categorization
5. Optionally add git information
6. Drag and drop files to upload
7. Click "Create Moment"

### Viewing Moments
1. Moments are listed in the VM detail page
2. Filter by git branch or tags
3. Click on a moment to see full details
4. Preview images directly in the browser
5. Download any uploaded assets

## Security Considerations

1. **Authentication**: All API endpoints require authentication
2. **Organization Isolation**: Moments are strictly scoped by organization
3. **VM Authentication**: Separate auth flow for VM agents
4. **Signed URLs**: Time-limited URLs for asset uploads/downloads
5. **File Size Limits**: 500MB max per file
6. **CORS Configuration**: Restricted to frontend domain

## Future Enhancements

1. **Thumbnails**: Generate thumbnails for images and videos
2. **Video Processing**: Extract frames from video recordings
3. **Diff Visualization**: Visual diff between moments
4. **Webhooks**: Notify external services on moment creation
5. **Retention Policies**: Configurable retention for assets
6. **Search**: Full-text search across moments
7. **Export**: Export moments as reports or archives