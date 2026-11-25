import { Prisma, StatusAntrean } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../config/db.js';
import { failure, parseBody, success } from '../utils/response.js';
import {
  antreanCreateSchema,
  antreanStatusSchema,
  idSchema,
  statusAntreanSchema,
} from '../utils/validation.js';

const router = Router();

const KUOTA_MAKSIMAL = 30;

const transitions: Record<StatusAntrean, StatusAntrean[]> = {
  MENUNGGU: ['DIPERIKSA', 'BATAL'],
  DIPERIKSA: ['SELESAI', 'BATAL'],
  SELESAI: [],
  BATAL: [],
};

// ======================================================
// GET SEMUA ANTREAN
// ======================================================

router.get('/', async (req, res, next) => {
  try {
    const jadwalId = req.query.jadwalId
      ? idSchema.parse(req.query.jadwalId)
      : undefined;

    const status = req.query.status
      ? zStatusList(req.query.status)
      : (['MENUNGGU', 'DIPERIKSA'] as StatusAntrean[]);

    const where: Prisma.AntreanWhereInput = {
      ...(jadwalId ? { jadwalId } : {}),
      status: {
        in: status,
      },
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

// ======================================================
// GET ANTREAN AKTIF MILIK AKUN
// ======================================================

router.get('/saya/aktif', async (req, res, next) => {
  try {
    const data = await prisma.antrean.findMany({
      where: {
        status: {
          in: ['MENUNGGU', 'DIPERIKSA'],
        },
        peserta: {
          is: {
            userId: req.user!.id,
          },
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
      'Active account queues loaded',
    );
  } catch (error) {
    return next(error);
  }
});

// ======================================================
// GET ANTREAN BERDASARKAN ID
// ======================================================

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

// ======================================================
// POST PENDAFTARAN ANTREAN
// ======================================================

router.post('/', async (req, res, next) => {
  try {
    const input = parseBody(antreanCreateSchema, req);

    const data = await prisma.$transaction(
      async (tx) => {
        // ----------------------------------------------
        // 1. VALIDASI JADWAL
        // ----------------------------------------------

        const schedule = await tx.jadwalPosyandu.findUnique({
          where: {
            id: input.jadwalId,
          },
        });

        if (!schedule) {
          throw new QueueConflict(
            'Jadwal Posyandu tidak ditemukan.',
          );
        }

        if (schedule.status === 'SELESAI') {
          throw new QueueConflict(
            'Jadwal Posyandu sudah selesai dan tidak dapat menerima pendaftaran.',
          );
        }

        // ----------------------------------------------
        // 2. CEK PESERTA SUDAH TERDAFTAR
        // ----------------------------------------------

        const existingQueue = await tx.antrean.findUnique({
          where: {
            jadwalId_pesertaId: {
              jadwalId: input.jadwalId,
              pesertaId: input.pesertaId,
            },
          },
          select: {
            id: true,
            status: true,
            noAntrean: true,
          },
        });

        if (existingQueue) {
          if (existingQueue.status !== 'BATAL') {
            throw new QueueConflict(
              'Peserta sudah terdaftar dalam antrean untuk jadwal ini.',
            );
          }

          throw new QueueConflict(
            'Peserta pernah membatalkan antrean pada jadwal ini. Silakan gunakan data pendaftaran yang tersedia atau hubungi kader.',
          );
        }

        // ----------------------------------------------
        // 3. HITUNG KUOTA AKTIF
        // ----------------------------------------------

        const jumlahAntrean = await tx.antrean.count({
          where: {
            jadwalId: input.jadwalId,
            status: {
              not: 'BATAL',
            },
          },
        });

        if (jumlahAntrean >= KUOTA_MAKSIMAL) {
          throw new QueueConflict(
            'Kuota Posyandu pada jadwal ini sudah penuh (30 peserta).',
          );
        }

        // ----------------------------------------------
        // 4. HITUNG NOMOR ANTREAN PER JADWAL
        // ----------------------------------------------

        const max = await tx.antrean.aggregate({
          where: {
            jadwalId: input.jadwalId,
          },
          _max: {
            noAntrean: true,
          },
        });

        const nomorAntrean =
          (max._max.noAntrean ?? 0) + 1;

        // ----------------------------------------------
        // 5. SIMPAN ANTREAN
        // ----------------------------------------------

        const antreanBaru = await tx.antrean.create({
          data: {
            ...input,
            noAntrean: nomorAntrean,
          },
          include: {
            peserta: true,
            jadwal: true,
          },
        });

        return antreanBaru;
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
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

// ======================================================
// PATCH STATUS ANTREAN
// ======================================================

router.patch('/:id/status', async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);

    const { status } = parseBody(
      antreanStatusSchema,
      req,
    );

    const data = await prisma.$transaction(
      async (tx) => {
        const queue = await tx.antrean.findUnique({
          where: {
            id,
          },
        });

        if (!queue) {
          return null;
        }

        // ----------------------------------------------
        // VALIDASI TRANSISI STATUS
        // ----------------------------------------------

        if (!transitions[queue.status].includes(status)) {
          const message =
            queue.status === 'MENUNGGU' &&
            status === 'SELESAI'
              ? 'Antrean masih menunggu. Panggil peserta dan simpan hasil pemeriksaan sebelum menyelesaikan antrean.'
              : `Status antrean tidak dapat diubah dari ${queue.status} menjadi ${status}.`;

          throw new QueueConflict(message);
        }

        // ----------------------------------------------
        // CEK ANTREAN YANG SEDANG DIPERIKSA
        // ----------------------------------------------

        if (status === 'DIPERIKSA') {
          const currentQueue =
            await tx.antrean.findFirst({
              where: {
                jadwalId: queue.jadwalId,
                status: 'DIPERIKSA',
                id: {
                  not: queue.id,
                },
              },
              select: {
                noAntrean: true,
              },
            });

          if (currentQueue) {
            throw new QueueConflict(
              `Antrean A-${currentQueue.noAntrean} sedang diperiksa. Selesaikan pemeriksaan itu sebelum memanggil antrean berikutnya.`,
            );
          }
        }

        // ----------------------------------------------
        // UPDATE STATUS
        // ----------------------------------------------

        const updated = await tx.antrean.update({
          where: {
            id,
          },
          data: {
            status,
          },
          include: {
            peserta: true,
            jadwal: true,
          },
        });

        // ----------------------------------------------
        // UPDATE PEMERIKSAAN
        // ----------------------------------------------

        if (
          status === 'DIPERIKSA' ||
          status === 'SELESAI'
        ) {
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
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    if (!data) {
      return failure(
        res,
        'Queue record not found',
        404,
      );
    }

    return success(
      res,
      data,
      'Queue status updated',
    );
  } catch (error) {
    return next(error);
  }
});

// ======================================================
// VALIDASI LIST STATUS
// ======================================================

function zStatusList(
  value: unknown,
): StatusAntrean[] {
  const values = Array.isArray(value)
    ? value
    : String(value).split(',');

  return values.map((item) =>
    statusAntreanSchema.parse(item),
  );
}

// ======================================================
// CUSTOM ERROR KUOTA / ANTREAN
// ======================================================

class QueueConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueueConflict';
  }
}

export default router;