import { Context } from 'telegraf';
import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { format } from 'date-fns';

export async function list(ctx: Context) {
  const telegramId = ctx.from?.id.toString();

  if (!telegramId) {
    logger.error({ chatId: ctx.chat?.id }, 'No user ID in list command');
    return ctx.reply('Ошибка: не удалось определить пользователя.');
  }

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: {
        medications: {
          where: { isActive: true },
          include: {
            schedules: {
              where: { isActive: true },
            },
          },
        },
      },
    });

    if (!user) {
      return ctx.reply('Вы не зарегистрированы. Используйте /start');
    }

    if (user.medications.length === 0) {
      return ctx.reply(
        '📋 У вас пока нет активных лекарств.\n\n' + 'Используйте /add чтобы добавить первое лекарство.'
      );
    }

    let message = '💊 <b>Ваши лекарства:</b>\n\n';

    user.medications.forEach((med, index) => {
      message += `<b>${index + 1}. ${med.name}</b>\n`;
      if (med.description) {
        message += `   ${med.description}\n`;
      }
      message += `   📅 Начало: ${format(med.startDate, 'dd.MM.yyyy')}\n`;
      if (med.endDate) {
        message += `   📅 Окончание: ${format(med.endDate, 'dd.MM.yyyy')}\n`;
      }
      message += `   📆 Частота: ${getFrequencyText(med.frequency)}\n`;

      if (med.schedules.length > 0) {
        message += `   ⏰ Время приёма:\n`;
        med.schedules.forEach((schedule) => {
          message += `      • ${schedule.time} - ${schedule.dosage}`;
          if (schedule.notes) {
            message += ` (${schedule.notes})`;
          }
          message += '\n';
        });
      }
      message += '\n';
    });

    message += '\n<i>Используйте /edit для редактирования или /delete для удаления</i>';

    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    logger.error({ error, userId: telegramId }, 'Error in list command');
    await ctx.reply('Произошла ошибка при получении списка лекарств.');
  }
}

function getFrequencyText(frequency: string): string {
  switch (frequency) {
    case 'DAILY':
      return 'Каждый день';
    case 'WEEKLY':
      return 'По дням недели';
    case 'INTERVAL':
      return 'Через N дней';
    default:
      return frequency;
  }
}
