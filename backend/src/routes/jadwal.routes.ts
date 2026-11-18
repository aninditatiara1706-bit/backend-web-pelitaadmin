
import { Prisma, Role, StatusJadwal } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { failure, parseBody, success } from '../utils/response.js';
import {
  idSchema,
  jadwalCreateSchema,
  statusJadwalSchema,
} from '../utils/validation.js';

const router = Router();

// ==========================================
// HELPER: FORMAT TANGGAL JADWAL
// ==========================================

function formatScheduleDate(date: Date) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(date);
}

// ==========================================
// GET /
// Mengambil semua jadwal
// ==========================================

router.get('/', async (req, res, next) => {
  try {
    const query = z.object({
      status: statusJadwalSchema.optional(),
      tanggalMulai: z.coerce.date().optional(),
      tanggalSelesai: z.coerce.date().optional(),
    }).refine(
      (v) =>
        !v.tanggalMulai ||
        !v.tanggalSelesai ||
        v.tanggalMulai <= v.tanggalSelesai,
    ).parse(req.query);

    const where: Prisma.JadwalPosyanduWhereInput = {
      ...(query.status
        ? { status: query.status as StatusJadwal }
        : {}),
      ...(query.tanggalMulai || query.tanggalSelesai
        ? {
            tanggal: {
              ...(query.tanggalMulai
                ? { gte: query.tanggalMulai }
                : {}),
              ...(query.tanggalSelesai
                ? { lte: query.tanggalSelesai }
                : {}),
            },
          }
        : {}),
    };

    const data = await prisma.jadwalPosyandu.findMany({
      where,
      orderBy: { tanggal: 'asc' },
      include: {
        _count: {
          select: {
            antrean: true,
            pemeriksaan: true,
          },
        },
      },
    });

    return success(res, data, 'Schedules loaded');
  } catch (error) {
    return next(error);
  }
});

// ==========================================
// POST /
// Membuat jadwal + notifikasi semua USER
// ==========================================

router.post('/', async (req, res, next) => {
  try {
    const input = parseBody(jadwalCreateSchema, req);

    const dateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(input.tanggal);

    const year = Number(
      dateParts.find((part) => part.type === 'year')?.value,
    );
    const month = Number(
      dateParts.find((part) => part.type === 'month')?.value,
    );
    const day = Number(
      dateParts.find((part) => part.type === 'day')?.value,
    );

    const startOfDay = new Date(
      Date.UTC(year, month - 1, day) - 7 * 60 * 60 * 1000,
    );

    const endOfDay = new Date(
      startOfDay.getTime() + 24 * 60 * 60 * 1000,
    );

    const scheduleLabel = (
      description: string | null | undefined,
    ) =>
      (description ?? '')
        .replace(/PELITA_DEMO_[A-Z_]+/gi, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .toLocaleLowerCase();

    const matchingSchedules = await prisma.jadwalPosyandu.findMany({
      where: {
        tanggal: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
      select: {
        lokasi: true,
        deskripsi: true,
      },
    });

    const isDuplicate = matchingSchedules.some((schedule) =>
      schedule.lokasi.trim().toLocaleLowerCase() ===
        input.lokasi.trim().toLocaleLowerCase() &&
      scheduleLabel(schedule.deskripsi) ===
        scheduleLabel(input.deskripsi),
    );

    if (isDuplicate) {
      return failure(
        res,
        'Jadwal dengan nama, waktu, dan lokasi yang sama sudah tersedia pada tanggal tersebut.',
        409,
      );
    }

    // Buat jadwal dan notifikasi dalam satu transaksi
    const data = await prisma.$transaction(async (tx) => {
      const schedule = await tx.jadwalPosyandu.create({
        data: input,
      });

      // Ambil semua akun dengan role USER
      const users = await tx.user.findMany({
        where: {
          role: Role.USER,
        },
        select: {
          id: true,
        },
      });

      // Kirim notifikasi ke semua USER
      if (users.length > 0) {
        await tx.notifikasi.createMany({
          data: users.map((user) => ({
            userId: user.id,
            judul: 'Jadwal Posyandu Baru',
            pesan: `Jadwal Posyandu baru telah tersedia pada ${formatScheduleDate(schedule.tanggal)} di ${schedule.lokasi}. Silakan buka aplikasi PELITA untuk melihat detail jadwal.`,
            tipe: 'JADWAL',
          })),
        });
      }

      return schedule;
    });

    return success(res, data, 'Schedule created', 201);
  } catch (error) {
    return next(error);
  }
});

// ==========================================
// DELETE /:id
// Menghapus jadwal + notifikasi semua USER
// ==========================================

router.delete('/:id', async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);

    const deletedSchedule = await prisma.$transaction(
      async (tx) => {
        const schedule = await tx.jadwalPosyandu.findUnique({
          where: { id },
        });

        if (!schedule) {
          return null;
        }

        // Hapus jadwal terlebih dahulu
        await tx.jadwalPosyandu.delete({
          where: { id },
        });

        // Ambil semua akun USER
        const users = await tx.user.findMany({
          where: {
            role: Role.USER,
          },
          select: {
            id: true,
          },
        });

        // Beritahu semua USER bahwa jadwal dihapus
        if (users.length > 0) {
          await tx.notifikasi.createMany({
            data: users.map((user) => ({
              userId: user.id,
              judul: 'Jadwal Posyandu Dihapus',
              pesan: `Jadwal Posyandu tanggal ${formatScheduleDate(schedule.tanggal)} di ${schedule.lokasi} telah dihapus.`,
              tipe: 'JADWAL',
            })),
          });
        }

        return schedule;
      },
    );

    if (!deletedSchedule) {
      return failure(res, 'Schedule not found', 404);
    }

    return success(res, { id }, 'Schedule deleted');
  } catch (error) {
    return next(error);
  }
});

export default router;
