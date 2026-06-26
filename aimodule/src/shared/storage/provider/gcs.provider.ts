import { Storage, Bucket } from '@google-cloud/storage';
import { IStorageService } from '../storage.interface';
import { logger } from '../../../utils/logger';
import { _config } from '../../../config/config';

export class GCSProvider implements IStorageService {
  private storage: Storage;
  private bucket: Bucket;
  private bucketName: string;

  constructor() {
    this.bucketName = _config.GCS_BUCKET_NAME as string;
    const projectId = _config.GCS_PROJECT_ID as string;
    const clientEmail = _config.GCS_CLIENT_EMAIL as string;
    const privateKey = _config.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n') as string;

    if (!this.bucketName) {
      logger.error('GCS_BUCKET_NAME is missing in .env');
    }

    if (projectId && clientEmail && privateKey) {
      // Authenticate directly via .env variables (best practice for Docker)
      this.storage = new Storage({
        projectId: projectId,
        credentials: {
          client_email: clientEmail,
          private_key: privateKey,
        },
      });
    } else {
      // Fallback: If variables aren't set, it will automatically look for GOOGLE_APPLICATION_CREDENTIALS file
      logger.warn('GCS credentials not fully specified in .env. Falling back to default auth / GOOGLE_APPLICATION_CREDENTIALS file.');
      this.storage = new Storage();
    }

    this.bucket = this.storage.bucket(this.bucketName);
  }

  async uploadFile(filePath: string, destination: string, mimeType: string): Promise<string> {
    try {
      await this.bucket.upload(filePath, {
        destination,
        metadata: {
          contentType: mimeType,
        },
        resumable: true, // Use resumable uploads for large files
      });

      logger.info(`Successfully uploaded ${destination} to GCS bucket ${this.bucketName}`);
      
      // Return the public URL pattern (or you can return a signed URL depending on your security needs)
      return `https://storage.googleapis.com/${this.bucketName}/${destination}`;
    } catch (error) {
      logger.error({ error, destination }, 'Failed to upload file to GCS');
      throw new Error('GCS Upload Failed');
    }
  }
}
