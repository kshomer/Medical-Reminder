import { Context } from 'telegraf';
import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';

export async function deleteMedication(ctx: Context) {
  const telegramId = ctx.from?.id.toString();

  if (!telegramId) {
    logger.error({ chatId: ctx.chat?.id }, 'No user ID in delete command');
    return ctx.reply('Ошибка: не удалось определить пользователя.');
  }

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: {
        medications: {
          where: { isActive: true },
        },
      },
    });

    if (!user) {
      return ctx.reply('Вы не зарегистрированы. Используйте /start');
    }

    if (user.medications.length === 0) {
      return ctx.reply('У вас нет активных лекарств для удаления.');
    }

    const keyboard = user.medications.map((med) => [
      {
        text: `❌ ${med.name}`,
        callback_data: `delete_med:${med.id}`,
      },
    ]);

    keyboard.push([{ text: '🔙 Отмена', callback_data: 'cancel_delete' }]);

    await ctx.reply('Выберите лекарство для удаления:', {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  } catch (error) {
    logger.error({ error, userId: telegramId }, 'Error in delete command');
    await ctx.reply('Произошла ошибка.');
  }
}

export async function handleDeleteCallback(ctx: Context, medicationId: number) {
  const telegramId = ctx.from?.id.toString();

  if (!telegramId) {
    return ctx.answerCbQuery('Ошибка: не удалось определить пользователя');
  }

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) {
      return ctx.answerCbQuery('Пользователь не найден');
    }

    // Деактивируем лекарство и его расписание
    await prisma.medication.update({
      where: { id: medicationId, userId: user.id },
      data: {
        isActive: false,
        schedules: {
          updateMany: {
            where: { medicationId },
            data: { isActive: false },
          },
        },
      },
    });

    await ctx.editMessageText('✅ Лекарство успешно удалено.');
    await ctx.answerCbQuery('Удалено');

    logger.info({ userId: telegramId, medicationId }, 'Medication deleted');
  } catch (error) {
    logger.error({ error, medicationId }, 'Error deleting medication');
    await ctx.answerCbQuery('Ошибка при удалении');
  }
}
