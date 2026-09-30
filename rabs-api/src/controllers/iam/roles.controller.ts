import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { Role } from '@entities/iam/Role.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { RoleAssignment } from '@entities/iam/RoleAssignment.js';
import { User } from '@entities/iam/User.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { Location } from '@entities/iam/Location.js';

const createRoleSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(2),
  code: z.string().min(2),
  permissions: z.any().optional()
});

const assignRoleSchema = z.object({
  userId: z.string(),
  roleId: z.string(),
  businessUnitId: z.string(),
  locationId: z.string()
});

export class RolesController {
  static async list(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(Role);
    const roles = await repo.find({ take: 200 });
    res.json({ data: roles });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const parsed = createRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }
    const org = await AppDataSource.getRepository(Organization).findOne({ where: { id: parsed.data.organizationId } });
    if (!org) {
      res.status(400).json({ error: { message: 'Invalid organizationId' } });
      return;
    }
    const repo = AppDataSource.getRepository(Role);
    const role = repo.create({
      organization: org,
      name: parsed.data.name,
      code: parsed.data.code,
      permissions: parsed.data.permissions ?? null
    });
    await repo.save(role);
    res.status(201).json({ data: role });
  }

  static async assign(req: Request, res: Response): Promise<void> {
    const parsed = assignRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }
    const user = await AppDataSource.getRepository(User).findOne({ 
      where: { id: parsed.data.userId },
      relations: ['organization']
    });
    const role = await AppDataSource.getRepository(Role).findOne({ where: { id: parsed.data.roleId } });
    if (!user || !role) {
      res.status(400).json({ error: { message: 'Invalid userId or roleId' } });
      return;
    }
    if (!user.organization) {
      res.status(400).json({ error: { message: 'User does not have an organization assigned' } });
      return;
    }

    // Load business unit and location (required)
    const businessUnit = await AppDataSource.getRepository(BusinessUnit).findOne({ 
      where: { id: parsed.data.businessUnitId },
      relations: ['organization']
    });
    if (!businessUnit) {
      res.status(400).json({ error: { message: 'Invalid businessUnitId' } });
      return;
    }

    const location = await AppDataSource.getRepository(Location).findOne({ 
      where: { id: parsed.data.locationId },
      relations: ['businessUnit', 'businessUnit.organization']
    });
    if (!location) {
      res.status(400).json({ error: { message: 'Invalid locationId' } });
      return;
    }

    // Verify location belongs to the business unit
    if (!location.businessUnit || location.businessUnit.id !== businessUnit.id) {
      res.status(400).json({ error: { message: 'Location does not belong to the specified business unit' } });
      return;
    }

    // Verify business unit belongs to the user's organization
    if (businessUnit.organization.id !== user.organization.id) {
      res.status(400).json({ error: { message: 'Business unit does not belong to the user\'s organization' } });
      return;
    }

    const repo = AppDataSource.getRepository(RoleAssignment);
    
    // Check if a role assignment already exists for this exact combination (user+role+businessUnit)
    // The unique constraint is on (user_id, role_id, business_unit_id)
    const existing = await repo
      .createQueryBuilder('ra')
      .where('ra.user_id = :userId', { userId: user.id })
      .andWhere('ra.role_id = :roleId', { roleId: role.id })
      .andWhere('ra.business_unit_id = :buId', { buId: businessUnit.id })
      .getOne();

    if (existing) {
      // Update existing assignment with same user+role+businessUnit combination
      existing.location = location;
      await repo.save(existing);
      
      // Fetch with relations for response
      const updated = await repo.findOne({
        where: { id: existing.id },
        relations: ['user', 'role', 'businessUnit', 'location']
      });
      res.json({ data: updated });
    } else {
      // Check if there's a different role assignment for this user+role (different business unit)
      // If so, we need to delete it first to avoid conflicts
      const conflicting = await repo
        .createQueryBuilder('ra')
        .where('ra.user_id = :userId', { userId: user.id })
        .andWhere('ra.role_id = :roleId', { roleId: role.id })
        .getOne();

      if (conflicting) {
        // Delete the conflicting assignment and create a new one
        await repo.remove(conflicting);
      }

      // Create new assignment
      const ra = repo.create({
        user,
        role,
        businessUnit,
        location,
        validFrom: null,
        validUntil: null
      });
      await repo.save(ra);
      
      // Fetch with relations for response
      const saved = await repo.findOne({
        where: { id: ra.id },
        relations: ['user', 'role', 'businessUnit', 'location']
      });
      res.status(201).json({ data: saved });
    }
  }

  static async unassign(req: Request, res: Response): Promise<void> {
    const unassignSchema = z.object({
      userId: z.string(),
      roleAssignmentId: z.string()
    });
    const parsed = unassignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const repo = AppDataSource.getRepository(RoleAssignment);
    const assignment = await repo.findOne({
      where: { id: parsed.data.roleAssignmentId },
      relations: ['user']
    });

    if (!assignment) {
      res.status(404).json({ error: { message: 'Role assignment not found' } });
      return;
    }

    // Verify the assignment belongs to the specified user
    if (assignment.user.id !== parsed.data.userId) {
      res.status(400).json({ error: { message: 'Role assignment does not belong to the specified user' } });
      return;
    }

    await repo.remove(assignment);
    res.json({ data: { message: 'Role assignment removed successfully' } });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const updateSchema = z.object({
      name: z.string().min(2).optional(),
      code: z.string().min(2).optional(),
      permissions: z.any().optional()
    });
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }
    const repo = AppDataSource.getRepository(Role);
    const role = await repo.findOne({ where: { id } });
    if (!role) {
      res.status(404).json({ error: { message: 'Role not found' } });
      return;
    }
    if (parsed.data.name) role.name = parsed.data.name;
    if (parsed.data.code) role.code = parsed.data.code;
    if (parsed.data.permissions !== undefined) role.permissions = parsed.data.permissions;
    await repo.save(role);
    res.json({ data: role });
  }
}


