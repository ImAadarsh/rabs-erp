import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { EmployeeDocument } from '@entities/hr/EmployeeDocument.js';
import { z } from 'zod';
import { Employee } from '@entities/hr/Employee.js';
import { User } from '@entities/iam/User.js';

const createEmployeeDocumentSchema = z.object({
  employeeId: z.string(),
  documentType: z.enum(['contract', 'offer_letter', 'id', 'passport', 'certificate', 'performance_review', 'warning', 'other']),
  documentName: z.string().min(1),
  documentUrl: z.string().min(1),
  documentNumber: z.string().optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  uploadedBy: z.string().optional()
});

const updateEmployeeDocumentSchema = z.object({
  documentType: z.enum(['contract', 'offer_letter', 'id', 'passport', 'certificate', 'performance_review', 'warning', 'other']).optional(),
  documentName: z.string().min(1).optional(),
  documentUrl: z.string().min(1).optional(),
  documentNumber: z.string().optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional()
});

export class EmployeeDocumentsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(EmployeeDocument);
      const { employeeId, documentType, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('ed')
        .leftJoinAndSelect('ed.employee', 'emp')
        .leftJoinAndSelect('ed.uploadedBy', 'user')
        .orderBy('ed.createdAt', 'DESC');

      if (employeeId) {
        queryBuilder.andWhere('ed.employee_id = :empId', { empId: employeeId });
      }

      if (documentType) {
        queryBuilder.andWhere('ed.document_type = :docType', { docType: documentType });
      }

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
      queryBuilder.skip(skip).take(parseInt(limit as string));

      const [items, total] = await queryBuilder.getManyAndCount();
      
      res.json({ 
        data: items, 
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string))
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(EmployeeDocument);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['employee', 'uploadedBy']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Employee Document not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createEmployeeDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const empRepo = AppDataSource.getRepository(Employee);
      const employee = await empRepo.findOne({ where: { id: parsed.data.employeeId } });
      if (!employee) {
        res.status(400).json({ error: { message: 'Invalid employeeId' } });
        return;
      }

      const repo = AppDataSource.getRepository(EmployeeDocument);
      let uploadedBy = null;
      
      if (parsed.data.uploadedBy) {
        const userRepo = AppDataSource.getRepository(User);
        uploadedBy = await userRepo.findOne({ where: { id: parsed.data.uploadedBy } });
      }

      const item = repo.create({
        employee,
        documentType: parsed.data.documentType,
        documentName: parsed.data.documentName,
        documentUrl: parsed.data.documentUrl,
        documentNumber: parsed.data.documentNumber ?? null,
        issueDate: parsed.data.issueDate ? new Date(parsed.data.issueDate) : null,
        expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null,
        uploadedBy: uploadedBy ?? undefined
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['employee', 'uploadedBy']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateEmployeeDocumentSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(EmployeeDocument);
      const item = await repo.findOne({
        where: { id },
        relations: ['employee', 'uploadedBy']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Employee Document not found' } });
        return;
      }

      if (parsed.data.documentType) item.documentType = parsed.data.documentType;
      if (parsed.data.documentName) item.documentName = parsed.data.documentName;
      if (parsed.data.documentUrl) item.documentUrl = parsed.data.documentUrl;
      if (parsed.data.documentNumber !== undefined) item.documentNumber = parsed.data.documentNumber ?? null;
      if (parsed.data.issueDate !== undefined) item.issueDate = parsed.data.issueDate ? new Date(parsed.data.issueDate) : null;
      if (parsed.data.expiryDate !== undefined) item.expiryDate = parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['employee', 'uploadedBy']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(EmployeeDocument);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Employee Document not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

