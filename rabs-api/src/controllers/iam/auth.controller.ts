import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { User } from '@entities/iam/User.js';
import { verifyPassword } from '@utils/password.js';
import jwt from 'jsonwebtoken';
import { env } from '@config/env.js';
import { Role } from '@entities/iam/Role.js';
import { RoleAssignment } from '@entities/iam/RoleAssignment.js';
import { OAuth2Client } from 'google-auth-library';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export class AuthController {
  static async login(req: Request, res: Response): Promise<void> {
    const parse = loginSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parse.error.issues } });
      return;
    }
    const { email, password } = parse.data;
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({
      where: { email },
      relations: ['organization']
    });
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: { message: 'Invalid credentials' } });
      return;
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: { message: 'Invalid credentials' } });
      return;
    }
    // Resolve roles
    const raRepo = AppDataSource.getRepository(RoleAssignment);
    const roleAssignments = await raRepo.find({
      where: { user: { id: user.id } },
      relations: ['role']
    });
    const roles = Array.from(new Set(roleAssignments.map((r) => (r.role as Role).code)));

    const accessToken = jwt.sign(
      { sub: user.id, orgId: user.organization.id, roles },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_TTL }
    );
    const refreshToken = jwt.sign(
      { sub: user.id, orgId: user.organization.id, roles, typ: 'refresh' },
      env.JWT_REFRESH_SECRET,
      { expiresIn: env.JWT_REFRESH_TTL }
    );
    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        organizationId: user.organization.id,
        roles
      }
    });
  }

  static async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken) {
      res.status(400).json({ error: { message: 'refreshToken required' } });
      return;
    }
    try {
      const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as any;
      const accessToken = jwt.sign(
        { sub: payload.sub, orgId: payload.orgId, roles: payload.roles },
        env.JWT_ACCESS_SECRET,
        { expiresIn: env.JWT_ACCESS_TTL }
      );
      res.json({ accessToken });
    } catch {
      res.status(401).json({ error: { message: 'Invalid refresh token' } });
    }
  }

  static async googleAuthUrl(req: Request, res: Response): Promise<void> {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      res.status(500).json({ error: { message: 'Google OAuth not configured' } });
      return;
    }
    const oauth2Client = new OAuth2Client(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI
    );
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
      prompt: 'consent'
    });
    res.json({ authUrl });
  }

  static async googleCallback(req: Request, res: Response): Promise<void> {
    const { code } = req.query;
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: { message: 'Authorization code required' } });
      return;
    }
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      res.status(500).json({ error: { message: 'Google OAuth not configured' } });
      return;
    }
    try {
      const oauth2Client = new OAuth2Client(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        env.GOOGLE_REDIRECT_URI
      );
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);
      const ticket = await oauth2Client.verifyIdToken({
        idToken: tokens.id_token!,
        audience: env.GOOGLE_CLIENT_ID
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        res.status(400).json({ error: { message: 'Invalid Google token' } });
        return;
      }
      const userRepo = AppDataSource.getRepository(User);
      // Only allow existing users - check by email first
      let user = await userRepo.findOne({
        where: { email: payload.email },
        relations: ['organization']
      });
      
      if (!user) {
        // User doesn't exist - reject login
        const errorUrl = new URL(`${env.FRONTEND_URL}/login`);
        errorUrl.searchParams.set('error', 'user_not_found');
        errorUrl.searchParams.set('message', 'Your email is not registered. Please contact an administrator or use regular login.');
        res.redirect(errorUrl.toString());
        return;
      }
      
      // User exists - update SSO info if needed
      if (!user.ssoProvider || user.ssoProvider === 'local') {
        user.ssoProvider = 'google';
        user.ssoId = payload.sub;
        if (payload.picture) user.avatarUrl = payload.picture;
        await userRepo.save(user);
      }
      
      // Check if user has roles, if not try to assign default role
      const raRepo = AppDataSource.getRepository(RoleAssignment);
      const existingRoles = await raRepo.find({
        where: { user: { id: user.id } }
      });
      if (existingRoles.length === 0) {
        const roleRepo = AppDataSource.getRepository(Role);
        const defaultRole = await roleRepo.findOne({
          where: { organization: { id: user.organization.id }, code: 'ADMIN' }
        });
        if (defaultRole) {
          const ra = raRepo.create({
            user,
            role: defaultRole,
            businessUnit: null,
            location: null,
            validFrom: null,
            validUntil: null
          });
          await raRepo.save(ra);
        }
      }
      // Resolve roles
      const roleAssignments = await raRepo.find({
        where: { user: { id: user.id } },
        relations: ['role']
      });
      const roles = Array.from(new Set(roleAssignments.map((r) => (r.role as Role).code)));
      const accessToken = jwt.sign(
        { sub: user.id, orgId: user.organization.id, roles },
        env.JWT_ACCESS_SECRET,
        { expiresIn: env.JWT_ACCESS_TTL }
      );
      const refreshToken = jwt.sign(
        { sub: user.id, orgId: user.organization.id, roles, typ: 'refresh' },
        env.JWT_REFRESH_SECRET,
        { expiresIn: env.JWT_REFRESH_TTL }
      );
      // Redirect to frontend with tokens
      const redirectUrl = new URL(`${env.FRONTEND_URL}/auth/callback`);
      redirectUrl.searchParams.set('accessToken', accessToken);
      redirectUrl.searchParams.set('refreshToken', refreshToken);
      redirectUrl.searchParams.set('userId', user.id.toString());
      redirectUrl.searchParams.set('email', user.email);
      res.redirect(redirectUrl.toString());
    } catch (error: any) {
      console.error('Google OAuth error:', error);
      res.status(500).json({ error: { message: 'Google authentication failed', details: error.message } });
    }
  }
}


