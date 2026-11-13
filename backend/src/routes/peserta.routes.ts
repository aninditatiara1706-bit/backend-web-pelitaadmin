
import { Prisma, KategoriPeserta } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
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

// GET SEMUA PESERTA
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
        orderBy: { createdAt: 'desc' },
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

// POST DAFTAR PESERTA
// Peserta otomatis terhubung dengan akun yang sedang login.
router.post('/', authenticate, async (req, res, next) => {
  try {
    const pesertaData = parseBody(pesertaCreateSchema, req);

    const data = await prisma.peserta.create({
      data: {
        ...pesertaData,
        userId: req.user!.id,
      },
    });

    return success(res, data, 'Participant created', 201);
  } catch (error) {
    return next(error);
  }
});

// GET PESERTA MILIK USER YANG SEDANG LOGIN
router.get('/saya', authenticate, async (req, res, next) => {
  try {
    const data = await prisma.peserta.findMany({
      where: {
        userId: req.user!.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return success(
      res,
      data,
      'My participants loaded',
    );
  } catch (error) {
    return next(error);
  }
});

// GET DETAIL PESERTA
router.get('/:id', async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);

    const data = await prisma.peserta.findUnique({
      where: { id },
      include: {
        pemeriksaan: {
          orderBy: { tanggalPemeriksaan: 'desc' },
          include: { jadwal: true },
        },
        antrean: {
          orderBy: { tanggal: 'desc' },
          include: { jadwal: true },
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

// PUT UPDATE PESERTA
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

// DELETE PESERTA
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
