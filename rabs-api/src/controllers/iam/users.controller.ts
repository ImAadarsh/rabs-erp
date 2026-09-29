import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { User } from '@entities/iam/User.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { Role } from '@entities/iam/Role.js';
import { RoleAssignment } from '@entities/iam/RoleAssignment.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { Location } from '@entities/iam/Location.js';
import { hashPassword, verifyPassword } from '@utils/password.js';

const createUserSchema = z.object({
  organizationId: z.string(),
  email: z.string().email(),
  username: z.string().min(3).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  password: z.string().min(8).optional(),
  roleId: z.string(),
  businessUnitId: z.string().optional(),
  locationId: z.string().optional(),
  status: z.enum(['active', 'inactive', 'suspended', 'locked']).optional()
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters')
});

const setPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters')
});

export class UsersController {
  static async list(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(User);
    const users = await repo.find({ 
      take: 100,
      relations: ['organization', 'roleAssignments', 'roleAssignments.role', 'roleAssignments.businessUnit', 'roleAssignments.location'],
      order: { createdAt: 'DESC' }
    });
    res.json({ data: users });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOne({ 
      where: { id: req.params.id },
      relations: ['organization', 'roleAssignments', 'roleAssignments.role', 'roleAssignments.businessUnit', 'roleAssignments.location']
    });
    if (!user) {
      res.status(404).json({ error: { message: 'User not found' } });
      return;
    }
    res.json({ data: user });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const parsed = createUserSchema.safeParse(req.body);
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
    
    const roleRepo = AppDataSource.getRepository(Role);
    const role = await roleRepo.findOne({ where: { id: parsed.data.roleId } });
    if (!role) {
      res.status(400).json({ error: { message: 'Invalid roleId' } });
      return;
    }

    // Use provided password or default password
    const password = parsed.data.password || '<DEFAULT_USER_PASSWORD>';
    const passwordHash = await hashPassword(password);

    const repo = AppDataSource.getRepository(User);
    const user = repo.create({
      organization: org,
      email: parsed.data.email,
      username: parsed.data.username ?? null,
      firstName: parsed.data.firstName ?? null,
      lastName: parsed.data.lastName ?? null,
      status: parsed.data.status ?? 'active',
      passwordHash
    });
    await repo.save(user);

    // Assign role to user with business unit and location scope
    const raRepo = AppDataSource.getRepository(RoleAssignment);
    
    // Load business unit and location if provided
    let businessUnit = null;
    let location = null;
    
    if (parsed.data.businessUnitId) {
      const buRepo = AppDataSource.getRepository(BusinessUnit);
      businessUnit = await buRepo.findOne({ 
        where: { id: parsed.data.businessUnitId },
        relations: ['organization']
      });
      // Verify business unit belongs to the same organization
      if (!businessUnit || businessUnit.organization.id !== org.id) {
        res.status(400).json({ error: { message: 'Invalid businessUnitId' } });
        return;
      }
    }
    
    if (parsed.data.locationId) {
      const locRepo = AppDataSource.getRepository(Location);
      location = await locRepo.findOne({ 
        where: { id: parsed.data.locationId },
        relations: ['businessUnit', 'businessUnit.organization']
      });
      // Verify location belongs to the same organization and business unit (if provided)
      if (!location) {
        res.status(400).json({ error: { message: 'Invalid locationId' } });
        return;
      }
      if (businessUnit && location.businessUnit.id !== businessUnit.id) {
        res.status(400).json({ error: { message: 'Location does not belong to the specified business unit' } });
        return;
      }
      if (location.businessUnit.organization.id !== org.id) {
        res.status(400).json({ error: { message: 'Location does not belong to the specified organization' } });
        return;
      }
    }
    
    const roleAssignment = raRepo.create({
      user,
      role,
      businessUnit,
      location,
      validFrom: null,
      validUntil: null
    });
    await raRepo.save(roleAssignment);

    // Fetch user with relations for response
    const userWithRelations = await repo.findOne({
      where: { id: user.id },
      relations: ['organization', 'roleAssignments', 'roleAssignments.role', 'roleAssignments.businessUnit', 'roleAssignments.location']
    });

    res.status(201).json({ data: userWithRelations });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOne({ where: { id: req.params.id } });
    if (!user) {
      res.status(404).json({ error: { message: 'User not found' } });
      return;
    }
    const body = req.body ?? {};
    if (typeof body.email === 'string') user.email = body.email;
    if (typeof body.username === 'string' || body.username === null) user.username = body.username ?? null;
    if (typeof body.firstName === 'string' || body.firstName === null) user.firstName = body.firstName ?? null;
    if (typeof body.lastName === 'string' || body.lastName === null) user.lastName = body.lastName ?? null;
    if (typeof body.status === 'string') user.status = body.status;
    await repo.save(user);
    res.json({ data: user });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOne({ where: { id: req.params.id } });
    if (!user) {
      res.status(404).json({ error: { message: 'User not found' } });
      return;
    }
    await repo.remove(user);
    res.status(204).send();
  }

  static async changePassword(req: Request, res: Response): Promise<void> {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOne({ where: { id: req.params.id } });
    if (!user) {
      res.status(404).json({ error: { message: 'User not found' } });
      return;
    }

    // Verify current password
    if (!user.passwordHash) {
      res.status(400).json({ error: { message: 'User has no password set' } });
      return;
    }

    const isValidPassword = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
    if (!isValidPassword) {
      res.status(401).json({ error: { message: 'Current password is incorrect' } });
      return;
    }

    // Hash and save new password
    user.passwordHash = await hashPassword(parsed.data.newPassword);
    await repo.save(user);

    res.json({ data: { message: 'Password changed successfully' } });
  }

  static async setPassword(req: Request, res: Response): Promise<void> {
    const parsed = setPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOne({ where: { id: req.params.id } });
    if (!user) {
      res.status(404).json({ error: { message: 'User not found' } });
      return;
    }

    // Only allow setting password if user doesn't have one (SSO users)
    if (user.passwordHash) {
      res.status(400).json({ error: { message: 'User already has a password. Use change password instead.' } });
      return;
    }

    // Hash and save new password
    user.passwordHash = await hashPassword(parsed.data.password);
    await repo.save(user);

    res.json({ data: { message: 'Password set successfully' } });
  }
}


