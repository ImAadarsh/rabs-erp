import { Request, Response } from 'express';
import { z } from 'zod';
import {
  createManualShipment,
  getShipmentDetail,
  listPickPackQueue,
  listShipments,
  markOrderStage,
  updateShipmentStatus
} from '@services/fulfillment/fulfillment.service.js';
import { SUPPORTED_CARRIERS } from '@services/fulfillment/carriers.js';

function orgIdFrom(req: Request): string | undefined {
  return (
    (req.query.organizationId as string) ||
    (req.body?.organizationId as string) ||
    (req as any).auth?.orgId ||
    undefined
  );
}

function issuesMessage(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

function fail(res: Response, err: any, fallback: string) {
  res.status(err?.status || 500).json({ error: { message: err?.message || fallback } });
}

export class FulfillmentController {
  static carriers(_req: Request, res: Response): void {
    res.json({ data: SUPPORTED_CARRIERS });
  }

  static async pickPackQueue(req: Request, res: Response): Promise<void> {
    const organizationId = orgIdFrom(req);
    if (!organizationId) {
      res.status(400).json({ error: { message: 'organizationId required' } });
      return;
    }
    try {
      res.json({ data: await listPickPackQueue(organizationId) });
    } catch (err) {
      fail(res, err, 'Failed to load pick/pack queue');
    }
  }

  static async markStage(req: Request, res: Response): Promise<void> {
    const organizationId = orgIdFrom(req);
    const stage = req.params.stage;
    if (!organizationId) {
      res.status(400).json({ error: { message: 'organizationId required' } });
      return;
    }
    if (stage !== 'picked' && stage !== 'packed') {
      res.status(400).json({ error: { message: 'stage must be picked or packed' } });
      return;
    }
    try {
      res.json({ data: await markOrderStage({ organizationId, orderId: req.params.orderId, stage }) });
    } catch (err) {
      fail(res, err, 'Failed to update order');
    }
  }

  static async shipments(req: Request, res: Response): Promise<void> {
    const organizationId = orgIdFrom(req);
    if (!organizationId) {
      res.status(400).json({ error: { message: 'organizationId required' } });
      return;
    }
    try {
      const data = await listShipments({
        organizationId,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        carrier: req.query.carrier as string | undefined
      });
      res.json({ data });
    } catch (err) {
      fail(res, err, 'Failed to list shipments');
    }
  }

  static async shipmentDetail(req: Request, res: Response): Promise<void> {
    const organizationId = orgIdFrom(req);
    if (!organizationId) {
      res.status(400).json({ error: { message: 'organizationId required' } });
      return;
    }
    try {
      res.json({ data: await getShipmentDetail({ organizationId, shipmentId: req.params.id }) });
    } catch (err) {
      fail(res, err, 'Failed to load shipment');
    }
  }

  static async createManual(req: Request, res: Response): Promise<void> {
    const parsed = z
      .object({
        organizationId: z.string().optional(),
        orderId: z.string().min(1, 'Order is required'),
        carrier: z.string().trim().min(1, 'Carrier is required').max(64),
        trackingNumber: z.string().trim().min(1, 'Tracking number is required').max(64),
        serviceCode: z.string().max(32).nullable().optional(),
        weightKg: z.number().positive().nullable().optional(),
        pieces: z.number().int().positive().max(50).nullable().optional(),
        notes: z.string().max(2000).nullable().optional()
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: issuesMessage(parsed.error), details: parsed.error.issues } });
      return;
    }
    const organizationId = parsed.data.organizationId || orgIdFrom(req);
    if (!organizationId) {
      res.status(400).json({ error: { message: 'organizationId required' } });
      return;
    }
    try {
      res.status(201).json({ data: await createManualShipment({ ...parsed.data, organizationId }) });
    } catch (err) {
      fail(res, err, 'Failed to create shipment');
    }
  }

  static async updateStatus(req: Request, res: Response): Promise<void> {
    const parsed = z
      .object({ status: z.enum(['in_transit', 'delivered', 'cancelled']) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: issuesMessage(parsed.error), details: parsed.error.issues } });
      return;
    }
    const organizationId = orgIdFrom(req);
    if (!organizationId) {
      res.status(400).json({ error: { message: 'organizationId required' } });
      return;
    }
    try {
      res.json({ data: await updateShipmentStatus({ organizationId, shipmentId: req.params.id, status: parsed.data.status }) });
    } catch (err) {
      fail(res, err, 'Failed to update shipment');
    }
  }
}
