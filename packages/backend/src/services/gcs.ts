import { Storage } from '@google-cloud/storage';
import { OAuth2Client } from 'google-auth-library';
import { organizations } from '../db/schema-auth.js';
import { db } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { getOrganizationAccessToken } from './organization-auth.js';

interface GCSConfig {
  projectId: string;
  keyFilename?: string;
  credentials?: any;
  authClient?: OAuth2Client;
  serviceAccountKeyFile?: string; // Path to service account key file for signed URLs
}

interface SignedUrlOptions {
  action: 'read' | 'write' | 'delete' | 'resumable';
  expires: Date;
  contentType?: string;
  contentLength?: number;
}

export class GCSService {
  private storage: Storage;
  private signedUrlStorage?: Storage; // Separate instance for signed URLs
  private bucketPrefix = 'moments';

  constructor(config: GCSConfig) {
    const storageConfig: any = {
      projectId: config.projectId,
    };

    // Use authClient if provided (for OAuth2 access token auth)
    if (config.authClient) {
      storageConfig.authClient = config.authClient;
    } else {
      // Fall back to service account auth
      if (config.keyFilename) {
        storageConfig.keyFilename = config.keyFilename;
      }
      if (config.credentials) {
        storageConfig.credentials = config.credentials;
      }
    }

    this.storage = new Storage(storageConfig);

    // If a service account key file is provided, create a separate Storage instance for signed URLs
    if (config.serviceAccountKeyFile) {
      try {
        this.signedUrlStorage = new Storage({
          projectId: config.projectId,
          keyFilename: config.serviceAccountKeyFile,
        });
      } catch (error) {
        console.warn('Failed to initialize signed URL storage with service account:', error);
        // Continue without signed URL support
      }
    }
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
    
    // Use signedUrlStorage if available, otherwise fall back to regular storage
    const storageInstance = this.signedUrlStorage || this.storage;
    const bucket = storageInstance.bucket(bucketName);
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
    
    // Use signedUrlStorage if available, otherwise fall back to regular storage
    const storageInstance = this.signedUrlStorage || this.storage;
    const bucket = storageInstance.bucket(bucketName);
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

    // Get access token from refresh token
    const accessToken = await getOrganizationAccessToken(organizationId);
    if (!accessToken) {
      throw new Error(`Failed to get access token for organization ${organizationId}`);
    }

    // Create OAuth2Client with the access token
    const oauth2Client = new OAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });

    // Use the first project ID if available
    if (!org.gcpProjectIds || org.gcpProjectIds.length === 0) {
      throw new Error(`Organization ${organizationId} has no GCP project IDs`);
    }

    return new GCSService({
      projectId: org.gcpProjectIds[0],
      authClient: oauth2Client,
      serviceAccountKeyFile: new URL('./vibespace-463323-2e7d5f7ca7c8.json', import.meta.url).pathname,
    });
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

    // Get access token from refresh token
    const accessToken = await getOrganizationAccessToken(org.id);
    if (!accessToken) {
      throw new Error('Failed to get access token for primary organization');
    }

    // Create OAuth2Client with the access token
    const oauth2Client = new OAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });

    // Use the first project ID if available
    if (!org.gcpProjectIds || org.gcpProjectIds.length === 0) {
      throw new Error('Primary organization has no GCP project IDs');
    }

    return new GCSService({
      projectId: org.gcpProjectIds[0],
      authClient: oauth2Client,
      serviceAccountKeyFile: new URL('./vibespace-463323-2e7d5f7ca7c8.json', import.meta.url).pathname,
    });
  }
}

// Export a default instance using environment credentials for system operations
export let systemGCS: GCSService;