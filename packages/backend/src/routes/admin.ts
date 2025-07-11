import { Hono } from 'hono';
import { z } from 'zod';
import { flexibleAuth, flexibleRequireOrganization } from '../middleware/flexibleAuth.js';
import { requireRole } from '../middleware/auth.js';
import { Storage } from '@google-cloud/storage';
import { db } from '../db/index.js';
import { daemonBinaries } from '../db/schema-daemon.js';
import { desc } from 'drizzle-orm';
import crypto from 'crypto';

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || 'slopbox-daemon-binaries';

export const adminRoutes = new Hono();

adminRoutes.use('*', flexibleAuth, flexibleRequireOrganization);

adminRoutes.post('/daemon-binary', requireRole('owner'), async (c) => {
  try {
    const organizationId = c.get('organizationId');
    const userId = c.get('userId');
    
    const body = await c.req.parseBody();
    const file = body['daemon'] as File;
    
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file uploaded' }, 400);
    }

    const fileBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(fileBuffer);
    
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    const fileName = `daemon-${Date.now()}-${checksum.substring(0, 8)}`;
    
    const bucket = storage.bucket(bucketName);
    const gcsFile = bucket.file(fileName);
    
    await gcsFile.save(buffer, {
      metadata: {
        contentType: 'application/octet-stream',
        cacheControl: 'public, max-age=3600',
      },
    });
    
    await gcsFile.makePublic();
    
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
    
    const [binary] = await db.insert(daemonBinaries).values({
      id: crypto.randomUUID(),
      fileName: file.name,
      gcsPath: fileName,
      publicUrl,
      version: `v${Date.now()}`,
      checksum,
      size: buffer.length,
      uploadedBy: userId,
      organizationId,
      isLatest: true,
    }).returning();
    
    await db.update(daemonBinaries)
      .set({ isLatest: false })
      .where((row) => row.id !== binary.id);
    
    return c.json({
      success: true,
      binary: {
        id: binary.id,
        version: binary.version,
        url: binary.publicUrl,
        checksum: binary.checksum,
        size: binary.size,
      },
    });
  } catch (error) {
    console.error('Failed to upload daemon binary:', error);
    return c.json({ error: 'Failed to upload daemon binary' }, 500);
  }
});

adminRoutes.get('/daemon-binaries', requireRole('owner', 'admin'), async (c) => {
  try {
    const binaries = await db.select().from(daemonBinaries)
      .orderBy(desc(daemonBinaries.createdAt))
      .limit(20);
    
    return c.json({ binaries });
  } catch (error) {
    console.error('Failed to fetch daemon binaries:', error);
    return c.json({ error: 'Failed to fetch daemon binaries' }, 500);
  }
});