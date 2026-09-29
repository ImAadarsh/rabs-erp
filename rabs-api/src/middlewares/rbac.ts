import { NextFunction, Request, Response } from 'express';

export function requireRoles(...roleCodes: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = (req as any).auth as { roles: string[] } | undefined;
    if (!auth) {
      res.status(401).json({ error: { message: 'Unauthorized' } });
      return;
    }
    const has = auth.roles.some((r) => roleCodes.includes(r));
    if (!has) {
      res.status(403).json({ error: { message: 'Forbidden' } });
      return;
    }
    next();
  };
}


