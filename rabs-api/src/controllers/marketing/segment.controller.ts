import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { Segment } from '@entities/marketing/Segment.js';
import {
  addSegmentMembers,
  buildSegmentPayload,
  listSegmentMembers,
  recalculateSegment,
  removeSegmentMember,
  serializeSegment
} from '@services/marketing/segment.service.js';
import { assertOrgAccess, orgIdFromReq, userIdFromReq } from '@services/marketing/marketingScope.js';

const createSchema = z.object({
  organizationId: z.string().optional(),
  name: z.string().min(1).optional(),
  segmentName: z.string().min(1).optional(),
  segmentCode: z.string().optional(),
  description: z.string().optional(),
  rules: z.any().optional(),
  filterRules: z.any().optional(),
  segmentType: z.enum(['static', 'dynamic']).optional(),
  isActive: z.boolean().optional()
}).refine((d) => d.name || d.segmentName, { message: 'name is required' });

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  segmentName: z.string().min(1).optional(),
  segmentCode: z.string().optional(),
  description: z.string().optional(),
  rules: z.any().optional(),
  filterRules: z.any().optional(),
  segmentType: z.enum(['static', 'dynamic']).optional(),
  isActive: z.boolean().optional()
});

export class SegmentController {
  static async list(req: Request, res: Response) {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId required' } });
      const items = await AppDataSource.getRepository(Segment).find({
        where: { organizationId: orgId },
        order: { createdAt: 'DESC' }
      });
      res.json({ data: items.map(serializeSegment) });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response) {
    try {
      const item = await AppDataSource.getRepository(Segment).findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, item.organizationId);
      res.json({ data: serializeSegment(item) });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const raw = createSchema.parse(req.body);
      const orgId = raw.organizationId || orgIdFromReq(req);
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId required' } });
      const payload = buildSegmentPayload(raw);
      if (!payload.segmentName) return res.status(400).json({ error: { message: 'name is required' } });
      const repo = AppDataSource.getRepository(Segment);
      const item = repo.create({
        organizationId: orgId,
        segmentName: payload.segmentName!,
        segmentCode: payload.segmentCode!,
        description: payload.description,
        filterRules: payload.filterRules,
        segmentType: payload.segmentType as any,
        isActive: payload.isActive,
        createdById: userIdFromReq(req) ?? null,
        customerCount: 0
      });
      const saved = await repo.save(item);
      res.status(201).json({ data: serializeSegment(saved) });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const raw = updateSchema.parse(req.body);
      const repo = AppDataSource.getRepository(Segment);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, item.organizationId);
      const payload = buildSegmentPayload({ ...raw, segmentCode: raw.segmentCode || item.segmentCode });
      if (payload.segmentName) item.segmentName = payload.segmentName;
      if (raw.segmentCode) item.segmentCode = raw.segmentCode;
      if (raw.description !== undefined) item.description = raw.description;
      if (payload.filterRules !== undefined) item.filterRules = payload.filterRules;
      if (raw.segmentType) item.segmentType = raw.segmentType;
      if (raw.isActive !== undefined) item.isActive = raw.isActive;
      const saved = await repo.save(item);
      res.json({ data: serializeSegment(saved) });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(Segment);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, item.organizationId);
      await repo.remove(item);
      res.json({ data: { id: item.id } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async listMembers(req: Request, res: Response) {
    try {
      const seg = await AppDataSource.getRepository(Segment).findOne({ where: { id: req.params.id } });
      if (!seg) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, seg.organizationId);
      const members = await listSegmentMembers(seg.id);
      res.json({
        data: members.map((m) => ({
          id: m.id,
          customerId: m.customerId,
          addedAt: m.addedAt,
          customer: m.customer
            ? {
                id: m.customer.id,
                email: m.customer.email,
                firstName: (m.customer as any).firstName,
                lastName: (m.customer as any).lastName,
                companyName: (m.customer as any).companyName
              }
            : null
        }))
      });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async addMembers(req: Request, res: Response) {
    try {
      const parsed = z.object({ customerIds: z.array(z.string()).min(1) }).parse(req.body);
      const orgId = orgIdFromReq(req);
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId required' } });
      const members = await addSegmentMembers({
        segmentId: req.params.id,
        organizationId: orgId,
        customerIds: parsed.customerIds
      });
      res.status(201).json({
        data: members.map((m) => ({
          id: m.id,
          customerId: m.customerId,
          addedAt: m.addedAt,
          customer: m.customer
        }))
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async removeMember(req: Request, res: Response) {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId required' } });
      const result = await removeSegmentMember({
        segmentId: req.params.id,
        organizationId: orgId,
        customerId: req.params.customerId
      });
      res.json({ data: result });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async recalculate(req: Request, res: Response) {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId required' } });
      const result = await recalculateSegment({ segmentId: req.params.id, organizationId: orgId });
      res.json({ data: result });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
