import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { _config } from '../../config/config.js';
import { ApiError } from '../../shared/apiError.js';

let s3Client;

function getR2Client() {
  if (!s3Client) {
    if (!_config.R2_ACCOUNT_ID || !_config.R2_ACCESS_KEY || !_config.R2_SECRET_KEY || !_config.R2_BUCKET) {
      throw ApiError.badRequest('R2 storage is not configured. Check R2_* env vars.');
    }
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${_config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: _config.R2_ACCESS_KEY,
        secretAccessKey: _config.R2_SECRET_KEY,
      },
    });
  }
  return s3Client;
}

function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function createPresignedUploadUrl(filename, contentType, purpose = 'other') {
  const safeName = sanitizeFilename(filename);
  const publicId = `tests/${purpose}/${randomUUID()}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket: _config.R2_BUCKET,
    Key: publicId,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(getR2Client(), command, { expiresIn: 600 });
  const publicUrl = `${_config.R2_PUBLIC_URL.replace(/\/$/, '')}/${publicId}`;

  return { uploadUrl, publicUrl, publicId };
}

export async function deleteR2Object(publicId) {
  if (!publicId) return;
  const command = new DeleteObjectCommand({
    Bucket: _config.R2_BUCKET,
    Key: publicId,
  });
  await getR2Client().send(command);
}
