import { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '@config/env.js';
import { AppDataSource } from '@config/data-source.js';
import { Organization } from '@entities/iam/Organization.js';
import { Role } from '@entities/iam/Role.js';
import { User } from '@entities/iam/User.js';
import { RoleAssignment } from '@entities/iam/RoleAssignment.js';
import { hashPassword } from '@utils/password.js';

const schema = z.object({
  token: z.string(),
  organizationName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8)
});

export class BootstrapController {
  static async seed(req: Request, res: Response): Promise<void> {
    if (!env.NODE_ENV || env.NODE_ENV === 'production') {
      res.status(403).json({ error: { message: 'Disabled in production' } });
      return;
    }
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }
    if (parsed.data.token !== (process.env.BOOTSTRAP_TOKEN ?? 'BOOTSTRAP')) {
      res.status(401).json({ error: { message: 'Invalid bootstrap token' } });
      return;
    }

    const orgRepo = AppDataSource.getRepository(Organization);
    const roleRepo = AppDataSource.getRepository(Role);
    const userRepo = AppDataSource.getRepository(User);
    const raRepo = AppDataSource.getRepository(RoleAssignment);

    const existingUser = await userRepo.findOne({ where: { email: parsed.data.adminEmail } });
    if (existingUser) {
      res.status(409).json({ error: { message: 'Admin already exists' } });
      return;
    }

    const org = orgRepo.create({ name: parsed.data.organizationName, status: 'active' });
    await orgRepo.save(org);

    const rolesData = [
      { code: 'SUPER_ADMIN', name: 'Super Administrator', permissions: ['*'] },
      { code: 'ADMIN', name: 'Administrator', permissions: ['users.manage', 'roles.manage'] }
    ];
    const roles: Role[] = [];
    for (const r of rolesData) {
      const role = roleRepo.create({
        organization: org,
        code: r.code,
        name: r.name,
        permissions: r.permissions
      });
      await roleRepo.save(role);
      roles.push(role);
    }

    const user = userRepo.create({
      organization: org,
      email: parsed.data.adminEmail,
      username: 'admin',
      firstName: 'System',
      lastName: 'Administrator',
      status: 'active',
      passwordHash: await hashPassword(parsed.data.adminPassword)
    });
    await userRepo.save(user);

    const superAdmin = roles.find((r) => r.code === 'SUPER_ADMIN')!;
    const ra = raRepo.create({ user, role: superAdmin, businessUnit: null, location: null, validFrom: null, validUntil: null });
    await raRepo.save(ra);

    res.status(201).json({
      message: 'Bootstrap completed',
      organizationId: org.id,
      adminUserId: user.id,
      rolesCreated: roles.map((r) => r.code)
    });
  }
}


