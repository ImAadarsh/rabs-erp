import { Request, Response } from 'express';
import { z } from 'zod';
import {
  cancelShipment,
  createShipmentForOrder,
  getDhlStatus,
  getShipmentLabel,
  listOrderShipments,
  trackShipment
} from '@services/dhl/dhlShipping.service.js';

function orgIdFrom(req: Request): string | undefined {
  return (
    (req.query.organizationId as string) ||
    (req.body?.organizationId as string) ||
    (req as any).auth?.orgId ||
    undefined
  );
}

export class DhlController {
  static async status(req: Request, res: Response): Promise<void> {
    try {
      const data = await getDhlStatus();
      res.json({ data });
    } catch (err: any) {
      res.status(err.status || 500).json({ error: { message: err.message || 'DHL status failed' } });
    }
  }

  static async list(req: Request, res: Response): Promise<void> {
    try {
      const data = await listOrderShipments({
        organizationId: orgIdFrom(req),
        orderId: req.query.orderId as string | undefined,
        carrier: (req.query.carrier as string) || 'DHL',
        limit: req.query.limit ? Number(req.query.limit) : 100
      });
      res.json({ data });
    } catch (err: any) {
      res.status(err.status || 500).json({ error: { message: err.message || 'Failed to list shipments' } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    const schema = z.object({
      orderId: z.string().min(1),
      organizationId: z.string().optional(),
      productCode: z.string().min(1).max(10).optional(),
      weightKg: z.number().positive().optional(),
      lengthCm: z.number().positive().optional(),
      widthCm: z.number().positive().optional(),
      heightCm: z.number().positive().optional(),
      pieces: z.number().int().positive().max(50).optional(),
      description: z.string().max(70).optional(),
      plannedShippingDateAndTime: z.string().optional(),
      pickupRequested: z.boolean().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.flatten() } });
      return;
    }
    try {
      const data = await createShipmentForOrder({
        ...parsed.data,
        organizationId: parsed.data.organizationId || orgIdFrom(req)
      });
      res.status(201).json({ data });
    } catch (err: any) {
      res.status(err.status || 502).json({
        error: {
          message: err.message || 'DHL create shipment failed',
          details: err.details
        }
      });
    }
  }

  static async label(req: Request, res: Response): Promise<void> {
    try {
      const data = await getShipmentLabel(req.params.id);
      res.json({ data });
    } catch (err: any) {
      res.status(err.status || 502).json({
        error: { message: err.message || 'Failed to get label', details: err.details }
      });
    }
  }

  static async track(req: Request, res: Response): Promise<void> {
    try {
      const trackingNumber =
        (req.query.trackingNumber as string) ||
        (req.body?.trackingNumber as string) ||
        undefined;
      const shipmentId = req.params.id && req.params.id !== 'by-number' ? req.params.id : undefined;
      const data = await trackShipment({ shipmentId, trackingNumber });
      res.json({ data });
    } catch (err: any) {
      res.status(err.status || 502).json({
        error: { message: err.message || 'DHL tracking failed', details: err.details }
      });
    }
  }

  static async cancel(req: Request, res: Response): Promise<void> {
    try {
      const data = await cancelShipment(req.params.id);
      res.json({ data });
    } catch (err: any) {
      res.status(err.status || 502).json({
        error: { message: err.message || 'DHL cancel failed', details: err.details }
      });
    }
  }
}
