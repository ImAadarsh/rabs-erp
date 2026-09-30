import { Request, Response } from 'express';
import { uploadFile, UploadFileOptions } from '@utils/storage.js';

export class UploadController {
  /**
   * Upload a single file
   * POST /api/iam/upload
   * Body: multipart/form-data with 'file' field
   * Query params: folder (optional), fileName (optional), allowedMimeTypes (optional, comma-separated)
   */
  static async upload(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: { message: 'No file provided' } });
        return;
      }

      const folder = (req.query.folder as string) || 'uploads';
      const fileName = req.query.fileName as string | undefined;
      const allowedMimeTypes = req.query.allowedMimeTypes 
        ? (req.query.allowedMimeTypes as string).split(',').map(t => t.trim())
        : undefined;
      const maxSizeInMB = req.query.maxSizeInMB 
        ? Number(req.query.maxSizeInMB)
        : undefined;

      const options: UploadFileOptions = {
        file: req.file,
        folder,
        fileName,
        allowedMimeTypes,
        maxSizeInMB
      };

      const result = await uploadFile(options);
      res.json({ data: result });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message } });
    }
  }

  /**
   * Upload multiple files
   * POST /api/iam/upload/multiple
   * Body: multipart/form-data with 'files' field (array)
   */
  static async uploadMultiple(req: Request, res: Response): Promise<void> {
    try {
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        res.status(400).json({ error: { message: 'No files provided' } });
        return;
      }

      const folder = (req.query.folder as string) || 'uploads';
      const allowedMimeTypes = req.query.allowedMimeTypes 
        ? (req.query.allowedMimeTypes as string).split(',').map(t => t.trim())
        : undefined;
      const maxSizeInMB = req.query.maxSizeInMB 
        ? Number(req.query.maxSizeInMB)
        : undefined;

      const uploadPromises = (req.files as Express.Multer.File[]).map(file => {
        const options: UploadFileOptions = {
          file,
          folder,
          allowedMimeTypes,
          maxSizeInMB
        };
        return uploadFile(options);
      });

      const results = await Promise.all(uploadPromises);
      res.json({ data: results });
    } catch (error: any) {
      res.status(400).json({ error: { message: error.message } });
    }
  }
}

