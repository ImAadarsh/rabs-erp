import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { AuditLog } from '@entities/iam/AuditLog.js';

export class AuditController {
  static async list(req: Request, res: Response): Promise<void> {
    const take = Math.min(Number(req.query.limit ?? 50), 200);
    const skip = Number(req.query.offset ?? 0);
    const repo = AppDataSource.getRepository(AuditLog);
    
    const [logs, total] = await repo.findAndCount({
      relations: ['user', 'organization'],
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


