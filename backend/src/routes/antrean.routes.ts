
import { Prisma, StatusAntrean } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';
import { failure, parseBody, success } from '../utils/response.js';
import {
  antreanCreateSchema,
  antreanStatusSchema,
  idSchema,
  statusAntreanSchema,
} from '../utils/validation.js';

const router = Router();

const transitions: Record<StatusAntrean, StatusAntrean[]> = {
  MENUNGGU: ['DIPERIKSA', 'BATAL'],
  DIPERIKSA: ['SELESAI', 'BATAL'],
  SELESAI: [],
  BATAL: [],
};

// ==========================================
// HELPER: BATAS TANGGAL HARI INI (WIB)
// ==========================================

function getJakartaDayBounds() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  const today = `${values.year}-${values.month}-${values.day}`;

  const nextDate = new Date(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day) + 1,
    ),
  );

  const tomorrow = nextDate.toISOString().slice(0, 10);

  return {
    start: new Date(`${today}T00:00:00+07:00`),
    end: new Date(`${tomorrow}T00:00:00+07:00`),
  };
}

// ==========================================
// GET /saya
// Antrean milik akun yang sedang login
// ==========================================

router.get('/saya', authenticate, async (req, res, next) => {
  try {
    const { start, end } = getJakartaDayBounds();

    const data = await prisma.antrean.findMany({
      where: {
        peserta: {
          is: {
            userId: req.user!.id,
          },
        },
        jadwal: {
          is: {
            tanggal: {
              gte: start,
              lt: end,
            },
          },
        },
        status: {
          in: ['MENUNGGU', 'DIPERIKSA'],
        },
      },
      orderBy: [
        { tanggal: 'asc' },
        { noAntrean: 'asc' },
      ],
      include: {
        peserta: true,
        jadwal: true,
      },
    });

    return success(
      res,
      data,
      'Personal active queues loaded',
    );
  } catch (error) {
    return next(error);
  }
});

// ==========================================
// GET /
// Semua antrean aktif
// ==========================================

router.get('/', async (req, res, next) => {
  try {
    const jadwalId = req.query.jadwalId
      ? idSchema.parse(req.query.jadwalId)
      : undefined;

    const status = req.query.status
      ? zStatusList(req.query.status)
      : ['MENUNGGU', 'DIPERIKSA'] as StatusAntrean[];

    const where: Prisma.AntreanWhereInput = {
      ...(jadwalId ? { jadwalId } : {}),
      status: { in: status },
    };

    const data = await prisma.antrean.findMany({
      where,
      orderBy: [
        { tanggal: 'asc' },
        { noAntrean: 'asc' },
      ],
      include: {
        peserta: true,
        jadwal: true,
      },
    });

    return success(res, data, 'Active queue loaded');
  } catch (error) {
    return next(error);
  }
});

// ==========================================
// GET /:id
// Detail antrean
// ==========================================

router.get('/:id', async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);

    const data = await prisma.antrean.findUnique({
      where: { id },
      include: {
        peserta: true,
        jadwal: true,
      },
    });

    if (!data) {
      return failure(res, 'Queue record not found', 404);
    }

    return success(res, data, 'Queue record loaded');
  } catch (error) {
    return next(error);
  }
});

// ==========================================
// POST /
// Membuat antrean
// ==========================================

router.post('/', async (req, res, next) => {
  try {
    const input = parseBody(antreanCreateSchema, req);

    const data = await prisma.$transaction(
      async (tx) => {
        const schedule = await tx.jadwalPosyandu.findUnique({
          where: { id: input.jadwalId },
        });

        if (!schedule || schedule.status === 'SELESAI') {
          throw new QueueConflict(
            'Schedule is unavailable for registration',
          );
        }

        const existingQueue = await tx.antrean.findUnique({
          where: {
            jadwalId_pesertaId: {
              jadwalId: input.jadwalId,
              pesertaId: input.pesertaId,
            },
          },
          select: { id: true },
        });

        if (existingQueue) {
          throw new QueueConflict(
            'Peserta sudah terdaftar dalam antrean untuk jadwal ini',
          );
        }

        const max = await tx.antrean.aggregate({
          where: { jadwalId: input.jadwalId },
          _max: { noAntrean: true },
        });

        return tx.antrean.create({
          data: {
            ...input,
            noAntrean: (max._max.noAntrean ?? 0) + 1,
          },
          include: {
            peserta: true,
            jadwal: true,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return success(
      res,
      data,
      'Queue registration created',
      201,
    );
  } catch (error) {
    return next(error);
  }
});

// ==========================================
// PATCH /:id/status
// Mengubah status antrean
// ==========================================

router.patch('/:id/status', async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const { status } = parseBody(antreanStatusSchema, req);

    const data = await prisma.$transaction(async (tx) => {
      const queue = await tx.antrean.findUnique({
        where: { id },
      });

      if (!queue) return null;

      if (!transitions[queue.status].includes(status)) {
        const message =
          queue.status === 'MENUNGGU' && status === 'SELESAI'
            ? 'Antrean masih menunggu. Panggil peserta dan simpan hasil pemeriksaan sebelum menyelesaikan antrean.'
            : `Status antrean tidak dapat diubah dari ${queue.status} menjadi ${status}.`;

        throw new QueueConflict(message);
      }

      const updated = await tx.antrean.update({
        where: { id },
        data: { status },
        include: {
          peserta: true,
          jadwal: true,
        },
      });

      if (status === 'DIPERIKSA' || status === 'SELESAI') {
        await tx.pemeriksaan.upsert({
          where: {
            pesertaId_jadwalId: {
              pesertaId: queue.pesertaId,
              jadwalId: queue.jadwalId,
            },
          },
          create: {
            pesertaId: queue.pesertaId,
            jadwalId: queue.jadwalId,
            statusPemeriksaan:
              status === 'SELESAI'
                ? 'SELESAI'
                : 'BELUM_DIPERIKSA',
          },
          update: {
            statusPemeriksaan:
              status === 'SELESAI'
                ? 'SELESAI'
                : 'BELUM_DIPERIKSA',
          },
        });
      }

      return updated;
    });

    if (!data) {
      return failure(res, 'Queue record not found', 404);
    }

    return success(res, data, 'Queue status updated');
  } catch (error) {
    return next(error);
  }
});

// ==========================================
// HELPER
// ==========================================

function zStatusList(value: unknown): StatusAntrean[] {
  const values = Array.isArray(value)
    ? value
    : String(value).split(',');

  return values.map((item) =>
    statusAntreanSchema.parse(item),
  );
}

class QueueConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueueConflict';
  }
}

export default router;
