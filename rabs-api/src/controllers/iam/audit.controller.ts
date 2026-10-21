import { Request, Response } from 'express';
import { Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import { AuditLog } from '@entities/iam/AuditLog.js';

export class AuditController {
  static async list(req: Request, res: Response): Promise<void> {
    const take = Math.min(Number(req.query.limit ?? 50), 2000);
    const skip = Number(req.query.offset ?? 0);
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    const repo = AppDataSource.getRepository(AuditLog);

    const where: Record<string, unknown> = {};
    if (from && to) {
      const start = new Date(`${from}T00:00:00`);
      const end = new Date(`${to}T23:59:59.999`);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        where.createdAt = Between(start, end);
      }
    } else if (from) {
      const start = new Date(`${from}T00:00:00`);
      if (!Number.isNaN(start.getTime())) where.createdAt = MoreThanOrEqual(start);
    } else if (to) {
      const end = new Date(`${to}T23:59:59.999`);
      if (!Number.isNaN(end.getTime())) where.createdAt = LessThanOrEqual(end);
    }

    const [logs, total] = await repo.findAndCount({
      relations: ['user', 'organization'],
      where,
      order: { createdAt: 'DESC' },
      take,
      skip
    });
    
    // Transform to include both camelCase and snake_case for compatibility
    const transformedLogs = logs.map(log => ({
      ...log,
      // Add snake_case aliases for frontend compatibility
      entity_type: log.entityType,
      entity_id: log.entityId,
      user_id: log.user?.id || null,
      ip_address: log.ipAddress,
      user_agent: log.userAgent,
      request_id: log.requestId,
      created_at: log.createdAt
    }));
    
    res.json({ 
      data: transformedLogs,
      total,
      limit: take,
      offset: skip
    });
  }
}


