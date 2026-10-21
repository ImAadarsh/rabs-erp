import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@config/env.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { probePublicUrl } from '@services/social/socialMediaUrl.js';

const hasS3Creds = Boolean(env.AWS_S3_BUCKET_NAME && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
export const storageDriver: 'local' | 's3' =
  env.STORAGE_DRIVER === 'local' || env.STORAGE_DRIVER === 's3'
    ? (env.STORAGE_DRIVER as 'local' | 's3')
    : hasS3Creds
      ? 's3'
      : 'local';

export const uploadsRoot = path.resolve(process.cwd(), env.UPLOADS_DIR);
const localUrlPrefix = `${env.PUBLIC_API_URL}/uploads/`;

function safeKey(key: string): string {
  const normalized = path.posix.normalize(key.replace(/\\/g, '/').replace(/^\/+/, ''));
  if (normalized.startsWith('..')) throw new Error('Invalid storage key');
  return normalized;
}

async function putLocal(key: string, body: Buffer): Promise<string> {
  const k = safeKey(key);
  const target = path.join(uploadsRoot, k);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, body);
  return `${localUrlPrefix}${k}`;
}

function isS3CredentialError(error: any): boolean {
  return /InvalidAccessKeyId|SignatureDoesNotMatch|AccessDenied|AllAccessDisabled|not configured/i.test(
    `${error?.name || ''} ${error?.Code || ''} ${error?.message || ''}`
  );
}

const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY
  }
});

export interface UploadFileOptions {
  file: Express.Multer.File;
  folder?: string;
  fileName?: string;
  allowedMimeTypes?: string[];
  maxSizeInMB?: number;
}

export interface UploadResult {
  url: string;
  key: string;
  fileName: string;
  size: number;
  mimeType: string;
}

function redactSecrets(text: string): string {
  return String(text || '')
    .replace(/AKIA[0-9A-Z]{16}/g, '[redacted]')
    .replace(/(?:AWS_|Secret|Credential)[^\s]{0,40}/gi, '[redacted]');
}

function sanitizeS3Error(error: any, action: string): Error {
  const code = error?.name || error?.Code || 'S3Error';
  const msg = redactSecrets(error?.message || `${action} failed`);
  if (/AccessDenied|Forbidden|not authorized|InvalidAccessKeyId|SignatureDoesNotMatch/i.test(msg + code)) {
    return new Error(
      `S3 ${code}: ${msg}. IAM needs s3:PutObject on this bucket (and s3:PutObjectAcl if object ACLs are used).`
    );
  }
  return new Error(`S3 ${code}: ${msg}`);
}

export function publicObjectUrl(s3Key: string): string {
  const key = s3Key.replace(/^\//, '');
  const base = (env.AWS_S3_BUCKET_URL || '').replace(/\/$/, '');
  if (base) return `${base}/${key}`;
  return `https://${env.AWS_S3_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
}

function mimeExtension(mime: string, originalName: string): string {
  const fromName = path.extname(originalName);
  if (fromName) return fromName.toLowerCase();
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/pjpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm'
  };
  return map[mime] || '';
}

export async function uploadFile(options: UploadFileOptions): Promise<UploadResult> {
  const {
    file,
    folder = 'uploads',
    fileName,
    allowedMimeTypes,
    maxSizeInMB = 10
  } = options;

  const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
  if (file.size > maxSizeInBytes) {
    throw new Error(`File size exceeds maximum allowed size of ${maxSizeInMB}MB`);
  }

  if (allowedMimeTypes && !allowedMimeTypes.includes(file.mimetype)) {
    throw new Error(`File type ${file.mimetype} is not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`);
  }

  const fileExtension = path.extname(file.originalname);
  const uniqueFileName = fileName
    ? `${fileName}${fileExtension}`
    : `${uuidv4()}${fileExtension}`;

  const s3Key = folder ? `${folder}/${uniqueFileName}` : uniqueFileName;
  const result = (url: string): UploadResult => ({
    url,
    key: s3Key,
    fileName: uniqueFileName,
    size: file.size,
    mimeType: file.mimetype
  });

  if (storageDriver === 'local') return result(await putLocal(s3Key, file.buffer));

  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET_NAME,
    Key: s3Key,
    Body: file.buffer,
    ContentType: file.mimetype
  });

  try {
    await s3Client.send(command);
    return result(publicObjectUrl(s3Key));
  } catch (error: any) {
    if (isS3CredentialError(error)) {
      console.warn(`[storage] S3 upload rejected (${error?.name || 'error'}); stored on local disk instead`);
      return result(await putLocal(s3Key, file.buffer));
    }
    throw sanitizeS3Error(error, 'upload');
  }
}

/**
 * Upload composer media so Meta Graph can fetch it over public HTTPS.
 * Key pattern: social/posts/{orgId}/{uuid}.ext
 */
export async function uploadSocialPostMedia(options: {
  file: Express.Multer.File;
  organizationId: string;
}): Promise<UploadResult> {
  const { file, organizationId } = options;
  const isVideo = file.mimetype.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.originalname);
  const maxMb = isVideo ? 100 : 15;
  if (file.size > maxMb * 1024 * 1024) {
    throw new Error(`File size exceeds maximum allowed size of ${maxMb}MB`);
  }

  const ext = mimeExtension(file.mimetype, file.originalname) || (isVideo ? '.mp4' : '.jpg');
  const uniqueFileName = `${uuidv4()}${ext}`;
  const org = String(organizationId || 'unknown').replace(/[^0-9A-Za-z_-]/g, '');
  const s3Key = `social/posts/${org}/${uniqueFileName}`;
  const localResult = async (): Promise<UploadResult> => ({
    url: await putLocal(s3Key, file.buffer),
    key: s3Key,
    fileName: uniqueFileName,
    size: file.size,
    mimeType: file.mimetype
  });

  if (storageDriver === 'local') return localResult();

  const basePut = {
    Bucket: env.AWS_S3_BUCKET_NAME,
    Key: s3Key,
    Body: file.buffer,
    ContentType: file.mimetype || (isVideo ? 'video/mp4' : 'image/jpeg'),
    CacheControl: 'public, max-age=31536000'
  };

  try {
    try {
      await s3Client.send(new PutObjectCommand({ ...basePut, ACL: 'public-read' }));
    } catch (aclErr: any) {
      const combined = `${aclErr?.name || ''} ${aclErr?.message || ''}`;
      if (/AccessControlListNotSupported|InvalidArgument|AccessDenied/i.test(combined)) {
        await s3Client.send(new PutObjectCommand(basePut));
      } else {
        throw aclErr;
      }
    }
  } catch (error: any) {
    if (isS3CredentialError(error)) return localResult();
    throw sanitizeS3Error(error, 'PutObject');
  }

  let url = publicObjectUrl(s3Key);
  let probe = await probePublicUrl(url);
  if (!probe.ok) {
    try {
      url = await getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: env.AWS_S3_BUCKET_NAME, Key: s3Key }),
        { expiresIn: 60 * 60 * 24 }
      );
      probe = await probePublicUrl(url);
    } catch (signErr: any) {
      throw sanitizeS3Error(signErr, 'GetObject presign');
    }
  }

  if (!probe.ok) {
    throw new Error(
      `Uploaded to S3 but the object is not publicly readable over HTTPS (HTTP ${probe.status || 'unreachable'}). ` +
        'Meta cannot fetch a private object. Allow public GetObject on this prefix (bucket policy) or s3:GetObject for a presigned URL.'
    );
  }

  return {
    url,
    key: s3Key,
    fileName: uniqueFileName,
    size: file.size,
    mimeType: file.mimetype
  };
}

export async function deleteFile(key: string): Promise<void> {
  const localPath = path.join(uploadsRoot, safeKey(key.replace(/^uploads\//, '')));
  const existsLocally = await fs
    .stat(localPath)
    .then((s) => s.isFile())
    .catch(() => false);
  if (existsLocally) {
    await fs.unlink(localPath);
    return;
  }
  if (storageDriver === 'local') return;

  const command = new DeleteObjectCommand({
    Bucket: env.AWS_S3_BUCKET_NAME,
    Key: key
  });

  try {
    await s3Client.send(command);
  } catch (error: any) {
    throw sanitizeS3Error(error, 'delete');
  }
}

export function extractKeyFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    return pathname.startsWith('/') ? pathname.substring(1) : pathname;
  } catch {
    return null;
  }
}

export async function deleteFileByUrl(url: string): Promise<void> {
  if (url.startsWith(localUrlPrefix)) {
    await deleteFile(url.slice(localUrlPrefix.length));
    return;
  }
  const key = extractKeyFromUrl(url);
  if (!key) {
    throw new Error('Invalid S3 URL');
  }
  await deleteFile(key);
}
