import multer from 'multer';
import { Request } from 'express';

// Configure multer to store files in memory (as buffers)
// This is better for S3 uploads as we don't need to save files to disk first
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Allow all file types by default
  // Specific validation can be done in the controller
  cb(null, true);
};

// Configure multer
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB default limit (can be overridden in controller)
  }
});

// Single file upload middleware
export const uploadSingle = (fieldName: string = 'file') => upload.single(fieldName);

// Multiple files upload middleware
export const uploadMultiple = (fieldName: string = 'files', maxCount: number = 10) => 
  upload.array(fieldName, maxCount);

// Large CSV uploads for product import
export const uploadCsv = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.toLowerCase().endsWith('.csv');
    if (ok) cb(null, true);
    else cb(new Error('Only CSV files are allowed'));
  },
  limits: { fileSize: 50 * 1024 * 1024 }
}).single('file');

// Excel inventory seed uploads
export const uploadExcel = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const ok =
      name.endsWith('.xlsx') ||
      name.endsWith('.xls') ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel';
    if (ok) cb(null, true);
    else cb(new Error('Only Excel files (.xlsx / .xls) are allowed'));
  },
  limits: { fileSize: 50 * 1024 * 1024 }
}).single('file');

const socialMediaMulter = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const ok =
      /^(image\/(jpeg|pjpeg|png|gif|webp)|video\/(mp4|quicktime|webm))$/.test(file.mimetype) ||
      /\.(jpe?g|png|gif|webp|mp4|mov|webm)$/i.test(name);
    if (ok) cb(null, true);
    else cb(new Error('Only JPEG, PNG, GIF, WebP, MP4, and MOV files are allowed'));
  },
  limits: { fileSize: 100 * 1024 * 1024, files: 10 }
});

/** Multipart field `media` (0–10 files) for social composer publish. */
export const uploadSocialMedia = (req: Request, res: any, next: any) => {
  socialMediaMulter.array('media', 10)(req, res, (err: any) => {
    if (!err) return next();
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Each media file must be under 100MB'
        : err.message || 'Media upload failed';
    res.status(400).json({ error: { message } });
  });
};

