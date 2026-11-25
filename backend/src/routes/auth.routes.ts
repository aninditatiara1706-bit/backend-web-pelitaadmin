import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '../config/db.js';
import { createToken, sessionCookieName, sessionCookieOptions, authenticate } from '../middleware/auth.js';
import { failure, parseBody, success } from '../utils/response.js';
import { loginSchema, registerSchema } from '../utils/validation.js';

const router = Router();
router.post('/register', async (req, res, next) => {
  try {
    const input = parseBody(registerSchema, req);
    const email = input.email.trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return failure(res, 'Email sudah terdaftar', 409);

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email,
        passwordHash,
        role: Role.USER,
        ...(input.telepon ? { telepon: input.telepon } : {}),
      },
    });

    return success(res, {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    }, 'Registrasi berhasil');
  } catch (error) { return next(error); }
});
router.post('/login', async (req, res, next) => {
  try {
    const input = parseBody(loginSchema, req);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) return failure(res, 'Email or password is incorrect', 401);
    const token = await createToken({ id: user.id, email: user.email, name: user.name, role: user.role });
    res.cookie(sessionCookieName, token, sessionCookieOptions);
    return success(res, { user: { id: user.id, name: user.name, email: user.email, role: user.role } }, 'Login successful');
  } catch (error) { return next(error); }
});
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: req.user!.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        telepon: true,
        avatar: true,
      },
    });

    if (!user) {
      return failure(res, 'User not found', 404);
    }

    return success(res, user, 'Current user loaded');
  } catch (error) {
    return next(error);
  }
});
router.post('/logout', (_req, res) => {
  res.clearCookie(sessionCookieName, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
  return success(res, null, 'Logout successful');
});
export default router;
