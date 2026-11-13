
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db.js';

import {
  createToken,
  sessionCookieName,
  sessionCookieOptions,
  authenticate,
} from '../middleware/auth.js';

import {
  failure,
  parseBody,
  success,
} from '../utils/response.js';

import {
  loginSchema,
  registerSchema,
} from '../utils/validation.js';

const router = Router();

// ==========================================
// REGISTER
// ==========================================
router.post('/register', async (req, res, next) => {
  try {
    const input = parseBody(registerSchema, req);
    const email = input.email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return failure(res, 'Email sudah terdaftar', 409);
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const user = await prisma.user.create({
      data: {
        name: input.name.trim(),
        email,
        passwordHash,
        role: 'USER',
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        telepon: true,
        avatar: true,
        createdAt: true,
      },
    });

    return success(
      res,
      { user },
      'Registrasi berhasil'
    );
  } catch (error) {
    return next(error);
  }
});

// ==========================================
// LOGIN
// ==========================================
router.post('/login', async (req, res, next) => {
  try {
    const input = parseBody(loginSchema, req);

    const user = await prisma.user.findUnique({
      where: {
        email: input.email.trim().toLowerCase(),
      },
    });

    if (
      !user ||
      !(await bcrypt.compare(input.password, user.passwordHash))
    ) {
      return failure(
        res,
        'Email atau password salah',
        401
      );
    }

    const token = await createToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    res.cookie(
      sessionCookieName,
      token,
      sessionCookieOptions
    );

    return success(
      res,
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          telepon: user.telepon,
          avatar: user.avatar,
        },
      },
      'Login berhasil'
    );
  } catch (error) {
    return next(error);
  }
});

// ==========================================
// GET CURRENT USER
// ==========================================
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const currentUser = req.user;

    if (!currentUser) {
      return failure(
        res,
        'Silakan login terlebih dahulu',
        401
      );
    }

    const user = await prisma.user.findUnique({
      where: {
        id: currentUser.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        telepon: true,
        avatar: true,
        createdAt: true,
      },
    });

    if (!user) {
      return failure(
        res,
        'Pengguna tidak ditemukan',
        404
      );
    }

    return success(
      res,
      user,
      'Data pengguna berhasil dimuat'
    );
  } catch (error) {
    return next(error);
  }
});

// ==========================================
// UPDATE PROFILE
// ==========================================
router.put('/profile', authenticate, async (req, res, next) => {
  try {
    const currentUser = req.user;

    if (!currentUser) {
      return failure(
        res,
        'Silakan login terlebih dahulu',
        401
      );
    }

    const { nama, telepon, email, avatar } = req.body;

    // Validasi nama
    if (
      typeof nama !== 'string' ||
      nama.trim().length === 0
    ) {
      return failure(res, 'Nama wajib diisi', 400);
    }

    // Validasi nomor HP
    if (
      typeof telepon !== 'string' ||
      !/^[0-9+\s-]{9,20}$/.test(telepon.trim())
    ) {
      return failure(res, 'Nomor HP tidak valid', 400);
    }

    // Validasi email
    if (
      typeof email !== 'string' ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
    ) {
      return failure(res, 'Email tidak valid', 400);
    }

    // Validasi avatar
    const allowedAvatars = [
      'assets/images/avatar_siti.png',
      'assets/images/avatar_raka.png',
      'assets/images/avatar_sari.png',
      'assets/images/avatar_4.png',
    ];

    if (
      typeof avatar !== 'string' ||
      !allowedAvatars.includes(avatar)
    ) {
      return failure(res, 'Avatar tidak valid', 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Cek email milik user lain
    const existingUser = await prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        NOT: {
          id: currentUser.id,
        },
      },
    });

    if (existingUser) {
      return failure(
        res,
        'Email sudah digunakan',
        409
      );
    }

    // Update database
    const updatedUser = await prisma.user.update({
      where: {
        id: currentUser.id,
      },
      data: {
        name: nama.trim(),
        telepon: telepon.trim(),
        email: normalizedEmail,
        avatar: avatar,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        telepon: true,
        avatar: true,
        updatedAt: true,
      },
    });

    // Perbarui session cookie
    const token = await createToken({
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      role: updatedUser.role,
    });

    res.cookie(
      sessionCookieName,
      token,
      sessionCookieOptions
    );

    return success(
      res,
      {
        user: updatedUser,
      },
      'Profil berhasil diperbarui'
    );
  } catch (error) {
    return next(error);
  }
});

// ==========================================
// LOGOUT
// ==========================================
router.post('/logout', (_req, res) => {
  res.clearCookie(sessionCookieName, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });

  return success(
    res,
    null,
    'Logout berhasil'
  );
});

export default router;