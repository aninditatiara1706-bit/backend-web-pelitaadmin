
import { NextFunction, Request, Response } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { Role } from '@prisma/client';
import { failure } from '../utils/response.js';

// ==========================================
// AUTH USER TYPE
// ==========================================

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// ==========================================
// SESSION CONFIGURATION
// ==========================================

export const sessionCookieName = 'pelita_session';

const sessionDurationSeconds = 60 * 60 * 8;

// ==========================================
// JWT SECRET
// ==========================================

function secretKey() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be configured with at least 32 characters'
    );
  }

  return new TextEncoder().encode(secret);
}

// ==========================================
// CREATE JWT TOKEN
// ==========================================

export async function createToken(user: AuthUser) {
  return new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${sessionDurationSeconds}s`)
    .sign(secretKey());
}

// ==========================================
// SESSION COOKIE OPTIONS
// ==========================================

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: sessionDurationSeconds * 1000,
  path: '/',
};

// ==========================================
// AUTHENTICATE MIDDLEWARE
// ==========================================

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Ambil token dari Authorization Bearer
    const authorization = req.get('authorization');

    const bearerToken = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;

    // Prioritaskan cookie, kemudian Bearer Token
    const token =
      req.cookies?.[sessionCookieName] ?? bearerToken;

    if (!token) {
      return failure(
        res,
        'Authentication required',
        401
      );
    }

    // Verifikasi JWT
    const { payload } = await jwtVerify(
      token,
      secretKey()
    );

    // Validasi data token
    const validRoles = ['ADMIN', 'KADER', 'USER'];

    if (
      !payload.sub ||
      typeof payload.email !== 'string' ||
      typeof payload.name !== 'string' ||
      typeof payload.role !== 'string' ||
      !validRoles.includes(payload.role)
    ) {
      return failure(
        res,
        'Invalid session',
        401
      );
    }

    // Simpan informasi pengguna ke request
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role as Role,
    };

    return next();

  } catch (error) {
    // Tangani kesalahan konfigurasi JWT
    if (
      error instanceof Error &&
      error.message.includes('JWT_SECRET')
    ) {
      return next(error);
    }

    // Token tidak valid atau kedaluwarsa
    return failure(
      res,
      'Invalid or expired session',
      401
    );
  }
}

// ==========================================
// ADMIN ONLY MIDDLEWARE
// ==========================================

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (req.user?.role !== 'ADMIN') {
    return failure(
      res,
      'Admin role required',
      403
    );
  }

  return next();
}
