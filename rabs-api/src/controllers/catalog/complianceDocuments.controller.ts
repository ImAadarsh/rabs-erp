import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { ComplianceDocument } from '@entities/catalog/ComplianceDocument.js';
import { CatalogItem } from '@entities/catalog/CatalogItem.js';
import { z } from 'zod';
import { uploadFile, deleteFileByUrl } from '@utils/storage.js';

const createComplianceDocumentSchema = z.object({
  catalogItemId: z.string(),
  type: z.enum(['msds', 'certificate', 'safety_data', 'test_report', 'other']),
  name: z.string().min(1),
  documentNumber: z.string().optional(),
  issuer: z.string().optional(),
  issuedDate: z.string().optional(),
  expiryDate: z.string().optional(),
  status: z.enum(['active', 'expired', 'pending']).optional()
});

const updateComplianceDocumentSchema = z.object({
  type: z.enum(['msds', 'certificate', 'safety_data', 'test_report', 'other']).optional(),
  name: z.string().min(1).optional(),
  documentNumber: z.string().optional(),
  issuer: z.string().optional(),
  issuedDate: z.string().optional(),
  expiryDate: z.string().optional(),
  status: z.enum(['active', 'expired', 'pending']).optional()
});

export class ComplianceDocumentsController {
  static async list(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(ComplianceDocument);
    const { catalogItemId, type, status } = req.query;
    
    const queryBuilder = repo.createQueryBuilder('cd')
      .leftJoinAndSelect('cd.catalogItem', 'ci')
      .orderBy('cd.createdAt', 'DESC');

    if (catalogItemId) {
      queryBuilder.andWhere('cd.catalog_item_id = :catalogItemId', { catalogItemId });
    }

    if (type) {
      queryBuilder.andWhere('cd.type = :type', { type });
    }

    if (status) {
      queryBuilder.andWhere('cd.status = :status', { status });
    }

    const documents = await queryBuilder.getMany();
    res.json({ data: documents });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(ComplianceDocument);
    const document = await repo.findOne({
      where: { id: req.params.id },
      relations: ['catalogItem']
    });
    
    if (!document) {
      res.status(404).json({ error: { message: 'Compliance document not found' } });
      return;
    }
    
    res.json({ data: document });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const parsed = createComplianceDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const catalogItemRepo = AppDataSource.getRepository(CatalogItem);
    const catalogItem = await catalogItemRepo.findOne({ where: { id: parsed.data.catalogItemId } });
    
    if (!catalogItem) {
      res.status(400).json({ error: { message: 'Invalid catalogItemId' } });
      return;
    }

    // Handle file upload if provided
    let documentUrl: string;
    if (req.file) {
      try {
        const allowedMimeTypes = [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'image/jpeg',
          'image/png',
          'text/plain'
        ];

        const uploadResult = await uploadFile({
          file: req.file,
          folder: 'compliance-documents',
          allowedMimeTypes,
          maxSizeInMB: 10
        });
        
        documentUrl = uploadResult.url;
      } catch (error: any) {
        res.status(400).json({ error: { message: `File upload failed: ${error.message}` } });
        return;
      }
    } else {
      res.status(400).json({ error: { message: 'Document file is required' } });
      return;
    }

    const repo = AppDataSource.getRepository(ComplianceDocument);
    const document = repo.create({
      catalogItem,
      type: parsed.data.type,
      name: parsed.data.name,
      documentUrl,
      documentNumber: parsed.data.documentNumber ?? null,
      issuer: parsed.data.issuer ?? null,
      issuedDate: parsed.data.issuedDate ? new Date(parsed.data.issuedDate) : null,
      expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null,
      status: parsed.data.status ?? 'active'
    });

    await repo.save(document);

    const saved = await repo.findOne({
      where: { id: document.id },
      relations: ['catalogItem']
    });

    res.status(201).json({ data: saved });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const parsed = updateComplianceDocumentSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const repo = AppDataSource.getRepository(ComplianceDocument);
    const document = await repo.findOne({ where: { id } });

    if (!document) {
      res.status(404).json({ error: { message: 'Compliance document not found' } });
      return;
    }

    // Handle file upload if new file provided
    if (req.file) {
      // Delete old file
      try {
        await deleteFileByUrl(document.documentUrl);
      } catch (error) {
        console.error('Failed to delete old file:', error);
      }

      // Upload new file
      try {
        const allowedMimeTypes = [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'image/jpeg',
          'image/png',
          'text/plain'
        ];

        const uploadResult = await uploadFile({
          file: req.file,
          folder: 'compliance-documents',
          allowedMimeTypes,
          maxSizeInMB: 10
        });
        
        document.documentUrl = uploadResult.url;
      } catch (error: any) {
        res.status(400).json({ error: { message: `File upload failed: ${error.message}` } });
        return;
      }
    }

    if (parsed.data.type) document.type = parsed.data.type;
    if (parsed.data.name) document.name = parsed.data.name;
    if (parsed.data.documentNumber !== undefined) document.documentNumber = parsed.data.documentNumber ?? null;
    if (parsed.data.issuer !== undefined) document.issuer = parsed.data.issuer ?? null;
    if (parsed.data.issuedDate !== undefined) document.issuedDate = parsed.data.issuedDate ? new Date(parsed.data.issuedDate) : null;
    if (parsed.data.expiryDate !== undefined) document.expiryDate = parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null;
    if (parsed.data.status) document.status = parsed.data.status;

    await repo.save(document);

    const updated = await repo.findOne({
      where: { id: document.id },
      relations: ['catalogItem']
    });

    res.json({ data: updated });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const repo = AppDataSource.getRepository(ComplianceDocument);
    const document = await repo.findOne({ where: { id } });

    if (!document) {
      res.status(404).json({ error: { message: 'Compliance document not found' } });
      return;
    }

    // Delete file from S3
    try {
      await deleteFileByUrl(document.documentUrl);
    } catch (error) {
      console.error('Failed to delete file from S3:', error);
    }

    await repo.remove(document);
    res.status(204).send();
  }
}

