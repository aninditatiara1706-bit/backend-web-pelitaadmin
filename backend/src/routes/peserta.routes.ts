import { Prisma, KategoriPeserta } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../config/db.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  failure,
  paginationMeta,
  parseBody,
  success,
} from '../utils/response.js';
import {
  idSchema,
  kategoriSchema,
  paginationSchema,
  pesertaCreateSchema,
  pesertaUpdateSchema,
  searchSchema,
} from '../utils/validation.js';

const router = Router();

// ==========================================
// GET PESERTA MILIK AKUN LOGIN
// ==========================================
router.get('/saya', async (req, res, next) => {
  try {
    const userId = req.user!.id;

    const data = await prisma.peserta.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return success(res, data, 'Peserta saya berhasil dimuat');
  } catch (error) {
    return next(error);
  }
});

// ==========================================
// TAMBAH PESERTA MILIK AKUN LOGIN
// ==========================================
router.post('/saya', async (req, res, next) => {
  try {
    const input = parseBody(pesertaCreateSchema, req);

    const peserta = await prisma.peserta.create({
      data: {
        ...input,
        userId: req.user!.id,
      },
    });

    return success(
      res,
      peserta,
      'Peserta berhasil didaftarkan',
      201,
    );
  } catch (error) {
    return next(error);
  }
});

// ==========================================
// GET SEMUA PESERTA
// ==========================================
router.get('/', async (req, res, next) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);

    const q = searchSchema.parse(req.query.q) ?? '';

    const kategori = req.query.kategori
      ? kategoriSchema.parse(req.query.kategori) as KategoriPeserta
      : undefined;

    const where: Prisma.PesertaWhereInput = {
      ...(kategori ? { kategori } : {}),
      ...(q
        ? {
            OR: [
              { nama: { contains: q } },
              { nik: { contains: q } },
            ],
          }
        : {}),
    };

    const [data, total] = await prisma.$transaction([
      prisma.peserta.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.peserta.count({ where }),
    ]);

    return success(
      res,
      data,
      'Participants loaded',
      200,
      paginationMeta(page, limit, total),
    );
  } catch (error) {
    return next(error);
  }
});

// ==========================================
// TAMBAH PESERTA (ROUTE UMUM)
// ==========================================
router.post('/', async (req, res, next) => {
  try {
    const data = await prisma.peserta.create({
      data: parseBody(pesertaCreateSchema, req),
    });

    return success(res, data, 'Participant created', 201);
  } catch (error) {
    return next(error);
  }
});

// ==========================================
// DETAIL PESERTA
// ==========================================
router.get('/:id', async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);

    const data = await prisma.peserta.findUnique({
      where: { id },
      include: {
        pemeriksaan: {
          orderBy: {
            tanggalPemeriksaan: 'desc',
          },
          include: {
            jadwal: true,
          },
        },
        antrean: {
          orderBy: {
            tanggal: 'desc',
          },
          include: {
            jadwal: true,
          },
        },
      },
    });

    if (!data) {
      return failure(res, 'Participant not found', 404);
    }

    return success(res, data, 'Participant loaded');
  } catch (error) {
    return next(error);
  }
});

// ==========================================
// UPDATE PESERTA
// ==========================================
router.put('/:id', async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);

    const data = await prisma.peserta.update({
      where: { id },
      data: parseBody(pesertaUpdateSchema, req),
    });

    return success(res, data, 'Participant updated');
  } catch (error) {
    return next(error);
  }
});

// ==========================================
// DELETE PESERTA (ADMIN)
// ==========================================
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);

    await prisma.peserta.delete({
      where: { id },
    });

    return success(res, { id }, 'Participant deleted');
  } catch (error) {
    return next(error);
  }
});

export default router;