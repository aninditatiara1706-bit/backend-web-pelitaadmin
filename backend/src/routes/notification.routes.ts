
import { Router } from 'express';
import { prisma } from '../config/db.js';
import { failure, success } from '../utils/response.js';

const router = Router();

// GET: Mengambil semua notifikasi user yang login
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return failure(res, 'User tidak ditemukan', 401);
    }

    const notifications = await prisma.notifikasi.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return success(
      res,
      notifications,
      'Notifikasi berhasil dimuat',
    );
  } catch (error) {
    next(error);
  }
});

// GET: Menghitung notifikasi yang belum dibaca
router.get('/unread-count', async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return failure(res, 'User tidak ditemukan', 401);
    }

    const count = await prisma.notifikasi.count({
      where: {
        userId,
        sudahDibaca: false,
      },
    });

    return success(
      res,
      { count },
      'Jumlah notifikasi belum dibaca berhasil dimuat',
    );
  } catch (error) {
    next(error);
  }
});

// PATCH: Menandai satu notifikasi sebagai sudah dibaca
router.patch('/:id/read', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return failure(res, 'User tidak ditemukan', 401);
    }

    const notification = await prisma.notifikasi.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!notification) {
      return failure(res, 'Notifikasi tidak ditemukan', 404);
    }

    const updated = await prisma.notifikasi.update({
      where: { id },
      data: { sudahDibaca: true },
    });

    return success(
      res,
      updated,
      'Notifikasi berhasil ditandai sudah dibaca',
    );
  } catch (error) {
    next(error);
  }
});

// PATCH: Menandai semua notifikasi sebagai sudah dibaca
router.patch('/read-all', async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return failure(res, 'User tidak ditemukan', 401);
    }

    await prisma.notifikasi.updateMany({
      where: {
        userId,
        sudahDibaca: false,
      },
      data: {
        sudahDibaca: true,
      },
    });

    return success(
      res,
      null,
      'Semua notifikasi berhasil ditandai sudah dibaca',
    );
  } catch (error) {
    next(error);
  }
});

export default router;
