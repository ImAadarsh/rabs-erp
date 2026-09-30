import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { CustomerAddress } from '@entities/orders/CustomerAddress.js';
import { z } from 'zod';
import { Customer } from '@entities/orders/Customer.js';
import { IsNull } from 'typeorm';

const createCustomerAddressSchema = z.object({
  customerId: z.string(),
  addressType: z.enum(['shipping', 'billing', 'both']),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  city: z.string().min(1),
  stateProvince: z.string().optional(),
  postalCode: z.string().min(1),
  countryCode: z.string().length(2),
  phone: z.string().optional(),
  isDefault: z.boolean().optional()
});

const updateCustomerAddressSchema = z.object({
  addressType: z.enum(['shipping', 'billing', 'both']).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  addressLine1: z.string().min(1).optional(),
  addressLine2: z.string().optional(),
  city: z.string().min(1).optional(),
  stateProvince: z.string().optional(),
  postalCode: z.string().min(1).optional(),
  countryCode: z.string().length(2).optional(),
  phone: z.string().optional(),
  isDefault: z.boolean().optional()
});

export class CustomerAddressesController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(CustomerAddress);
      const { customerId, addressType } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('ca')
        .leftJoinAndSelect('ca.customer', 'cust')
        .orderBy('ca.createdAt', 'ASC');

      if (customerId) {
        queryBuilder.andWhere('ca.customer_id = :customerId', { customerId });
      }

      if (addressType) {
        queryBuilder.andWhere('ca.address_type = :addressType', { addressType });
      }

      const items = await queryBuilder.getMany();
      res.json({ data: items });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(CustomerAddress);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['customer']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Customer address not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createCustomerAddressSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const customerRepo = AppDataSource.getRepository(Customer);
      const customer = await customerRepo.findOne({ where: { id: parsed.data.customerId, deletedAt: IsNull() } });
      if (!customer) {
        res.status(400).json({ error: { message: 'Invalid customerId' } });
        return;
      }

      const repo = AppDataSource.getRepository(CustomerAddress);
      const item = repo.create({
        customer,
        addressType: parsed.data.addressType,
        firstName: parsed.data.firstName ?? null,
        lastName: parsed.data.lastName ?? null,
        company: parsed.data.company ?? null,
        addressLine1: parsed.data.addressLine1,
        addressLine2: parsed.data.addressLine2 ?? null,
        city: parsed.data.city,
        stateProvince: parsed.data.stateProvince ?? null,
        postalCode: parsed.data.postalCode,
        countryCode: parsed.data.countryCode,
        phone: parsed.data.phone ?? null,
        isDefault: parsed.data.isDefault ?? false
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['customer']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateCustomerAddressSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(CustomerAddress);
      const item = await repo.findOne({
        where: { id },
        relations: ['customer']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Customer address not found' } });
        return;
      }

      if (parsed.data.addressType) item.addressType = parsed.data.addressType;
      if (parsed.data.firstName !== undefined) item.firstName = parsed.data.firstName ?? null;
      if (parsed.data.lastName !== undefined) item.lastName = parsed.data.lastName ?? null;
      if (parsed.data.company !== undefined) item.company = parsed.data.company ?? null;
      if (parsed.data.addressLine1) item.addressLine1 = parsed.data.addressLine1;
      if (parsed.data.addressLine2 !== undefined) item.addressLine2 = parsed.data.addressLine2 ?? null;
      if (parsed.data.city) item.city = parsed.data.city;
      if (parsed.data.stateProvince !== undefined) item.stateProvince = parsed.data.stateProvince ?? null;
      if (parsed.data.postalCode) item.postalCode = parsed.data.postalCode;
      if (parsed.data.countryCode) item.countryCode = parsed.data.countryCode;
      if (parsed.data.phone !== undefined) item.phone = parsed.data.phone ?? null;
      if (parsed.data.isDefault !== undefined) item.isDefault = parsed.data.isDefault;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['customer']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(CustomerAddress);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Customer address not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

