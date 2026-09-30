# AWS S3 Storage Utility Usage Guide

This guide explains how to use the reusable AWS S3 storage utility functions for uploading and managing files.

## Setup

### 1. Environment Variables

Add these to your `.env` file:

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_S3_BUCKET_NAME=your-bucket-name
AWS_S3_BUCKET_URL=https://your-bucket-name.s3.us-east-1.amazonaws.com
# Or use a CDN URL if you have one configured
# AWS_S3_BUCKET_URL=https://cdn.yourdomain.com
```

### 2. S3 Bucket Configuration

**Important:** Modern S3 buckets have ACLs disabled by default. To make files publicly accessible, you need to configure a bucket policy instead of using ACLs.

**Bucket Policy Example (for public read access):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    }
  ]
}
```

**Steps to configure:**
1. Go to your S3 bucket in AWS Console
2. Navigate to "Permissions" tab
3. Scroll down to "Bucket policy"
4. Add the policy above (replace `your-bucket-name` with your actual bucket name)
5. Save the policy

**Alternative:** If you don't want public access, you can use pre-signed URLs or configure CloudFront with signed URLs.

### 2. Import the Functions

```typescript
import { uploadFile, deleteFile, deleteFileByUrl } from '@utils/storage.js';
```

## Usage Examples

### Basic File Upload

```typescript
import { uploadFile } from '@utils/storage.js';

// In a controller
const result = await uploadFile({
  file: req.file, // Express.Multer.File
  folder: 'organizations', // Optional: folder path in S3
  fileName: 'logo', // Optional: custom filename (without extension)
  allowedMimeTypes: ['image/jpeg', 'image/png'], // Optional: restrict file types
  maxSizeInMB: 5 // Optional: max file size (default: 10MB)
});

// result contains:
// {
//   url: 'https://bucket.s3.region.amazonaws.com/organizations/uuid.jpg',
//   key: 'organizations/uuid.jpg',
//   fileName: 'uuid.jpg',
//   size: 12345,
//   mimeType: 'image/jpeg'
// }

// Save the URL to your database
await organizationRepo.update(orgId, { logoUrl: result.url });
```

### Upload with Validation

```typescript
// Only allow images
const result = await uploadFile({
  file: req.file,
  folder: 'users',
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  maxSizeInMB: 2
});
```

### Upload PDF Documents

```typescript
const result = await uploadFile({
  file: req.file,
  folder: 'documents',
  fileName: `invoice-${invoiceId}`,
  allowedMimeTypes: ['application/pdf'],
  maxSizeInMB: 5
});
```

### Delete a File

```typescript
import { deleteFile, deleteFileByUrl } from '@utils/storage.js';

// Delete by S3 key
await deleteFile('organizations/logo-123.jpg');

// Delete by full URL
await deleteFileByUrl('https://bucket.s3.region.amazonaws.com/organizations/logo-123.jpg');
```

## Using the Upload API Endpoints

### Single File Upload

```bash
POST /api/iam/upload
Content-Type: multipart/form-data
Authorization: Bearer <token>

# Form data:
# - file: <file>
# Query params (optional):
# - folder: organizations
# - fileName: logo
# - allowedMimeTypes: image/jpeg,image/png
# - maxSizeInMB: 5
```

**Example with curl:**
```bash
curl -X POST \
  'http://localhost:4000/api/iam/upload?folder=organizations&allowedMimeTypes=image/jpeg,image/png' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -F 'file=@/path/to/image.jpg'
```

**Response:**
```json
{
  "data": {
    "url": "https://bucket.s3.region.amazonaws.com/organizations/uuid.jpg",
    "key": "organizations/uuid.jpg",
    "fileName": "uuid.jpg",
    "size": 12345,
    "mimeType": "image/jpeg"
  }
}
```

### Multiple Files Upload

```bash
POST /api/iam/upload/multiple
Content-Type: multipart/form-data
Authorization: Bearer <token>

# Form data:
# - files: <file1>, <file2>, <file3>
# Query params (optional):
# - folder: products
# - allowedMimeTypes: image/jpeg,image/png
# - maxSizeInMB: 5
```

## Integration Examples

### In Organization Controller

```typescript
import { uploadFile } from '@utils/storage.js';

static async update(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const repo = AppDataSource.getRepository(Organization);
  const org = await repo.findOne({ where: { id } });
  
  if (!org) {
    res.status(404).json({ error: { message: 'Organization not found' } });
    return;
  }

  // If logo file is uploaded
  if (req.file) {
    try {
      const uploadResult = await uploadFile({
        file: req.file,
        folder: 'organizations',
        fileName: `org-${id}-logo`,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxSizeInMB: 2
      });
      
      // Delete old logo if exists
      if (org.logoUrl) {
        await deleteFileByUrl(org.logoUrl);
      }
      
      org.logoUrl = uploadResult.url;
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message } });
      return;
    }
  }
  
  // Update other fields...
  await repo.save(org);
  res.json({ data: org });
}
```

### In User Controller (Avatar Upload)

```typescript
if (req.file) {
  const uploadResult = await uploadFile({
    file: req.file,
    folder: 'users',
    fileName: `user-${userId}-avatar`,
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxSizeInMB: 1
  });
  
  user.avatarUrl = uploadResult.url;
}
```

## Frontend Usage Example

```typescript
// In your frontend API client
export async function uploadFile(file: File, folder?: string) {
  const formData = new FormData();
  formData.append('file', file);
  
  const params = new URLSearchParams();
  if (folder) params.append('folder', folder);
  params.append('allowedMimeTypes', 'image/jpeg,image/png');
  params.append('maxSizeInMB', '5');
  
  const { data } = await axios.post(
    `${API_BASE}/api/iam/upload?${params.toString()}`,
    formData,
    {
      headers: {
        ...authHeaders(),
        'Content-Type': 'multipart/form-data'
      }
    }
  );
  
  return data.data; // Returns { url, key, fileName, size, mimeType }
}
```

## Error Handling

The utility functions throw errors that should be caught:

```typescript
try {
  const result = await uploadFile({ file: req.file, folder: 'uploads' });
  // Success
} catch (error: any) {
  // Handle errors:
  // - File size exceeds maximum
  // - File type not allowed
  // - S3 upload failed
  console.error('Upload failed:', error.message);
}
```

## Best Practices

1. **Always validate file types** - Use `allowedMimeTypes` to restrict what can be uploaded
2. **Set appropriate size limits** - Use `maxSizeInMB` based on your use case
3. **Organize files in folders** - Use the `folder` parameter to organize files (e.g., 'organizations', 'users', 'products')
4. **Delete old files** - When updating, delete the old file from S3 to save storage costs
5. **Use CDN URLs** - Configure `AWS_S3_BUCKET_URL` to use a CDN for better performance
6. **Handle errors gracefully** - Always wrap upload calls in try-catch blocks

