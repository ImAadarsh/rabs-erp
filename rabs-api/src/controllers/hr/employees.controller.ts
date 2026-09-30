import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { Employee } from '@entities/hr/Employee.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { User } from '@entities/iam/User.js';
import { IsNull } from 'typeorm';

const createEmployeeSchema = z.object({
  organizationId: z.string(),
  userId: z.string().optional(),
  employeeNumber: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed', 'other']).optional(),
  nationalId: z.string().optional(),
  taxId: z.string().optional(),
  niNumber: z.string().max(20).optional(),
  taxCode: z.string().max(20).optional(),
  department: z.string().max(255).optional(),
  jobTitle: z.string().max(255).optional(),
  annualSalary: z.coerce.number().optional(),
  payFrequency: z.enum(['weekly', 'fortnightly', 'four_weekly', 'monthly']).optional(),
  passportNumber: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  stateProvince: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: z.string().length(2).optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
  hireDate: z.string(),
  terminationDate: z.string().optional(),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'temporary', 'intern']).optional(),
  status: z.enum(['active', 'on_leave', 'suspended', 'terminated']).optional(),
  photoUrl: z.string().optional(),
  notes: z.string().optional()
});

const updateEmployeeSchema = z.object({
  userId: z.string().optional(),
  employeeNumber: z.string().min(1).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed', 'other']).optional(),
  nationalId: z.string().optional(),
  taxId: z.string().optional(),
  niNumber: z.string().max(20).optional(),
  taxCode: z.string().max(20).optional(),
  department: z.string().max(255).optional(),
  jobTitle: z.string().max(255).optional(),
  annualSalary: z.coerce.number().optional(),
  payFrequency: z.enum(['weekly', 'fortnightly', 'four_weekly', 'monthly']).optional(),
  passportNumber: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  stateProvince: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: z.string().length(2).optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
  hireDate: z.string().optional(),
  terminationDate: z.string().optional(),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'temporary', 'intern']).optional(),
  status: z.enum(['active', 'on_leave', 'suspended', 'terminated']).optional(),
  photoUrl: z.string().optional(),
  notes: z.string().optional()
});

export class EmployeesController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(Employee);
      const { organizationId, status, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('emp')
        .leftJoinAndSelect('emp.organization', 'org')
        .leftJoinAndSelect('emp.user', 'user')
        .where('emp.deleted_at IS NULL')
        .orderBy('emp.createdAt', 'DESC');

      if (organizationId) {
        queryBuilder.andWhere('emp.organization_id = :orgId', { orgId: organizationId });
      }

      if (status) {
        queryBuilder.andWhere('emp.status = :status', { status });
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
      const repo = AppDataSource.getRepository(Employee);
      const item = await repo.findOne({
        where: { id: req.params.id, deletedAt: IsNull() },
        relations: ['organization', 'user']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Employee not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createEmployeeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const orgRepo = AppDataSource.getRepository(Organization);
      const org = await orgRepo.findOne({ where: { id: parsed.data.organizationId } });
      if (!org) {
        res.status(400).json({ error: { message: 'Invalid organizationId' } });
        return;
      }

      const repo = AppDataSource.getRepository(Employee);
      let user = null;
      
      if (parsed.data.userId) {
        const userRepo = AppDataSource.getRepository(User);
        user = await userRepo.findOne({ where: { id: parsed.data.userId } });
        if (!user) {
          res.status(400).json({ error: { message: 'Invalid userId' } });
          return;
        }
      }

      const item = repo.create({
        organization: org,
        user: user ?? undefined,
        employeeNumber: parsed.data.employeeNumber,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        dateOfBirth: parsed.data.dateOfBirth ? new Date(parsed.data.dateOfBirth) : null,
        gender: parsed.data.gender ?? null,
        maritalStatus: parsed.data.maritalStatus ?? null,
        nationalId: parsed.data.nationalId ?? null,
        taxId: parsed.data.taxId ?? null,
        niNumber: parsed.data.niNumber ?? null,
        taxCode: parsed.data.taxCode ?? '1257L',
        department: parsed.data.department ?? null,
        jobTitle: parsed.data.jobTitle ?? null,
        annualSalary: parsed.data.annualSalary ?? null,
        payFrequency: parsed.data.payFrequency ?? 'monthly',
        passportNumber: parsed.data.passportNumber ?? null,
        addressLine1: parsed.data.addressLine1 ?? null,
        addressLine2: parsed.data.addressLine2 ?? null,
        city: parsed.data.city ?? null,
        stateProvince: parsed.data.stateProvince ?? null,
        postalCode: parsed.data.postalCode ?? null,
        countryCode: parsed.data.countryCode ?? null,
        emergencyContactName: parsed.data.emergencyContactName ?? null,
        emergencyContactPhone: parsed.data.emergencyContactPhone ?? null,
        emergencyContactRelationship: parsed.data.emergencyContactRelationship ?? null,
        hireDate: new Date(parsed.data.hireDate),
        terminationDate: parsed.data.terminationDate ? new Date(parsed.data.terminationDate) : null,
        employmentType: parsed.data.employmentType ?? 'full_time',
        status: parsed.data.status ?? 'active',
        photoUrl: parsed.data.photoUrl ?? null,
        notes: parsed.data.notes ?? null
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'user']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateEmployeeSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(Employee);
      const item = await repo.findOne({
        where: { id, deletedAt: IsNull() },
        relations: ['organization', 'user']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Employee not found' } });
        return;
      }

      if (parsed.data.userId !== undefined) {
        if (parsed.data.userId) {
          const userRepo = AppDataSource.getRepository(User);
          const user = await userRepo.findOne({ where: { id: parsed.data.userId } });
          if (!user) {
            res.status(400).json({ error: { message: 'Invalid userId' } });
            return;
          }
          item.user = user;
        } else {
          item.user = null;
        }
      }

      if (parsed.data.employeeNumber) item.employeeNumber = parsed.data.employeeNumber;
      if (parsed.data.firstName) item.firstName = parsed.data.firstName;
      if (parsed.data.lastName) item.lastName = parsed.data.lastName;
      if (parsed.data.email !== undefined) item.email = parsed.data.email ?? null;
      if (parsed.data.phone !== undefined) item.phone = parsed.data.phone ?? null;
      if (parsed.data.dateOfBirth !== undefined) item.dateOfBirth = parsed.data.dateOfBirth ? new Date(parsed.data.dateOfBirth) : null;
      if (parsed.data.gender !== undefined) item.gender = parsed.data.gender ?? null;
      if (parsed.data.maritalStatus !== undefined) item.maritalStatus = parsed.data.maritalStatus ?? null;
      if (parsed.data.nationalId !== undefined) item.nationalId = parsed.data.nationalId ?? null;
      if (parsed.data.taxId !== undefined) item.taxId = parsed.data.taxId ?? null;
      if (parsed.data.niNumber !== undefined) item.niNumber = parsed.data.niNumber ?? null;
      if (parsed.data.taxCode !== undefined) item.taxCode = parsed.data.taxCode ?? null;
      if (parsed.data.department !== undefined) item.department = parsed.data.department ?? null;
      if (parsed.data.jobTitle !== undefined) item.jobTitle = parsed.data.jobTitle ?? null;
      if (parsed.data.annualSalary !== undefined) item.annualSalary = parsed.data.annualSalary ?? null;
      if (parsed.data.payFrequency !== undefined) item.payFrequency = parsed.data.payFrequency ?? null;
      if (parsed.data.passportNumber !== undefined) item.passportNumber = parsed.data.passportNumber ?? null;
      if (parsed.data.addressLine1 !== undefined) item.addressLine1 = parsed.data.addressLine1 ?? null;
      if (parsed.data.addressLine2 !== undefined) item.addressLine2 = parsed.data.addressLine2 ?? null;
      if (parsed.data.city !== undefined) item.city = parsed.data.city ?? null;
      if (parsed.data.stateProvince !== undefined) item.stateProvince = parsed.data.stateProvince ?? null;
      if (parsed.data.postalCode !== undefined) item.postalCode = parsed.data.postalCode ?? null;
      if (parsed.data.countryCode !== undefined) item.countryCode = parsed.data.countryCode ?? null;
      if (parsed.data.emergencyContactName !== undefined) item.emergencyContactName = parsed.data.emergencyContactName ?? null;
      if (parsed.data.emergencyContactPhone !== undefined) item.emergencyContactPhone = parsed.data.emergencyContactPhone ?? null;
      if (parsed.data.emergencyContactRelationship !== undefined) item.emergencyContactRelationship = parsed.data.emergencyContactRelationship ?? null;
      if (parsed.data.hireDate) item.hireDate = new Date(parsed.data.hireDate);
      if (parsed.data.terminationDate !== undefined) item.terminationDate = parsed.data.terminationDate ? new Date(parsed.data.terminationDate) : null;
      if (parsed.data.employmentType) item.employmentType = parsed.data.employmentType;
      if (parsed.data.status) item.status = parsed.data.status;
      if (parsed.data.photoUrl !== undefined) item.photoUrl = parsed.data.photoUrl ?? null;
      if (parsed.data.notes !== undefined) item.notes = parsed.data.notes ?? null;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'user']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(Employee);
      const item = await repo.findOne({ where: { id, deletedAt: IsNull() } });

      if (!item) {
        res.status(404).json({ error: { message: 'Employee not found' } });
        return;
      }

      item.deletedAt = new Date();
      await repo.save(item);
      res.json({ data: { id: item.id } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

