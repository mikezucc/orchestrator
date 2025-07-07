import { Storage } from '@google-cloud/storage';
import { organizations } from '../db/schema-auth.js';
import { db } from '../db/index.js';
import { eq } from 'drizzle-orm';

interface GCSConfig {
  projectId: string;
  keyFilename?: string;
  credentials?: any;
}

interface SignedUrlOptions {
  action: 'read' | 'write' | 'delete' | 'resumable';
  expires: Date;
  contentType?: string;
  contentLength?: number;
}

export class GCSService {
  private storage: Storage;
  private bucketPrefix = 'moments';

  constructor(config: GCSConfig) {
    this.storage = new Storage({
      projectId: config.projectId,
      keyFilename: config.keyFilename,
      credentials: config.credentials,
    });
  }

  /**
   * Get bucket name for an organization
   */
  getBucketName(organizationId: string): string {
    return `${this.bucketPrefix}-${organizationId}`;
  }

  /**
   * Create a bucket for an organization if it doesn't exist
   */
  async ensureBucket(organizationId: string): Promise<void> {
    const bucketName = this.getBucketName(organizationId);
    const bucket = this.storage.bucket(bucketName);

    try {
      const [exists] = await bucket.exists();
      if (!exists) {
        await this.storage.createBucket(bucketName, {
          location: 'US', // Multi-region for better availability
          storageClass: 'STANDARD',
          uniformBucketLevelAccess: {
            enabled: true, // Better security with IAM
          },
          versioning: {
            enabled: true, // Keep versions of assets
          },
          lifecycle: {
            rule: [{
              action: { type: 'Delete' },
              condition: {
                age: 365, // Delete after 1 year
                isLive: false, // Only non-current versions
              },
            }],
          },
        });

        // Set CORS for browser uploads
        await bucket.setCorsConfiguration([{
          origin: [process.env.FRONTEND_URL || 'http://localhost:3001'],
          method: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          responseHeader: ['Content-Type', 'Access-Control-Allow-Origin'],
          maxAgeSeconds: 3600,
        }]);
      }
    } catch (error) {
      console.error(`Error creating bucket for org ${organizationId}:`, error);
      throw error;
    }
  }

  /**
   * Generate a signed URL for uploading an asset
   */
  async generateUploadUrl(
    organizationId: string,
    momentId: string,
    assetId: string,
    fileName: string,
    contentType: string,
    contentLength: number
  ): Promise<string> {
    await this.ensureBucket(organizationId);
    
    const bucketName = this.getBucketName(organizationId);
    const filePath = `${momentId}/${assetId}-${fileName}`;
    const bucket = this.storage.bucket(bucketName);
    const file = bucket.file(filePath);

    const options: SignedUrlOptions = {
      action: 'write',
      expires: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      contentType,
      contentLength,
    };

    const [url] = await file.getSignedUrl(options);
    return url;
  }

  /**
   * Generate a signed URL for downloading an asset
   */
  async generateDownloadUrl(
    organizationId: string,
    gcsPath: string,
    expiresInMinutes: number = 60
  ): Promise<string> {
    const bucketName = this.getBucketName(organizationId);
    const bucket = this.storage.bucket(bucketName);
    const file = bucket.file(gcsPath);

    const options: SignedUrlOptions = {
      action: 'read',
      expires: new Date(Date.now() + expiresInMinutes * 60 * 1000),
    };

    const [url] = await file.getSignedUrl(options);
    return url;
  }

  /**
   * Delete an asset from GCS
   */
  async deleteAsset(organizationId: string, gcsPath: string): Promise<void> {
    const bucketName = this.getBucketName(organizationId);
    const bucket = this.storage.bucket(bucketName);
    const file = bucket.file(gcsPath);

    try {
      await file.delete();
    } catch (error) {
      console.error(`Error deleting asset ${gcsPath}:`, error);
      throw error;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(organizationId: string, gcsPath: string): Promise<any> {
    const bucketName = this.getBucketName(organizationId);
    const bucket = this.storage.bucket(bucketName);
    const file = bucket.file(gcsPath);

    const [metadata] = await file.getMetadata();
    return metadata;
  }

  /**
   * List all assets for a moment
   */
  async listMomentAssets(organizationId: string, momentId: string): Promise<string[]> {
    const bucketName = this.getBucketName(organizationId);
    const bucket = this.storage.bucket(bucketName);

    const [files] = await bucket.getFiles({
      prefix: `${momentId}/`,
    });

    return files.map(file => file.name);
  }

  /**
   * Create a GCS service for an organization using their credentials
   */
  static async forOrganization(organizationId: string): Promise<GCSService> {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org) {
      throw new Error(`Organization ${organizationId} not found`);
    }

    if (!org.gcpRefreshToken) {
      throw new Error(`Organization ${organizationId} has no GCP credentials`);
    }

    // TODO: Implement proper OAuth2 refresh token flow for GCS
    // For now, organizations should use service account credentials
    throw new Error('Organization-specific GCS not implemented. Using primary organization.');
  }

  /**
   * Create a GCS service using the primary organization's credentials
   * This is used when we want all storage to go through a single GCP account
   */
  static async forPrimaryOrganization(): Promise<GCSService> {
    // Find the primary organization by slug or name
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'slopboxprimary'))
      .limit(1);

    if (!org) {
      throw new Error('Primary organization (slopboxprimary) not found');
    }

    if (!org.gcpRefreshToken) {
      throw new Error('Primary organization has no GCP credentials');
    }

    // For organizations using refresh tokens, we need to handle auth differently
    // For now, we'll use the system GCS if available
    if (org.gcpProjectIds && org.gcpProjectIds.length > 0) {
      systemGCS = new GCSService({
        projectId: org.gcpProjectIds[0],
        keyFilename: org.gcpKeyFilePath, // Path to service account key file
        credentials: org.gcpCredentials, // Use credentials if available
      });
    }

    throw new Error('Primary organization GCS not properly configured');
  }
}

// Export a default instance using environment credentials for system operations
export let systemGCS: GCSService;