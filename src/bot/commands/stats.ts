import { Context } from 'telegraf';
import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, format } from 'date-fns';

export async function stats(ctx: Context) {
  const telegramId = ctx.from?.id.toString();

  if (!telegramId) {
    logger.error({ chatId: ctx.chat?.id }, 'No user ID in stats command');
    return ctx.reply('Ошибка: не удалось определить пользователя.');
  }

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) {
      return ctx.reply('Вы не зарегистрированы. Используйте /start');
    }

    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    // Статистика за неделю
    const weekLogs = await prisma.intakeLog.findMany({
      where: {
        userId: user.id,
        scheduledDate: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
    });

    const weekConfirmed = weekLogs.filter((log) => log.status === 'CONFIRMED').length;
    const weekTotal = weekLogs.length;
    const weekPercentage = weekTotal > 0 ? Math.round((weekConfirmed / weekTotal) * 100) : 0;

    // Статистика за месяц
    const monthLogs = await prisma.intakeLog.findMany({
      where: {
        userId: user.id,
        scheduledDate: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
    });

    const monthConfirmed = monthLogs.filter((log) => log.status === 'CONFIRMED').length;
    const monthTotal = monthLogs.length;
    const monthPercentage = monthTotal > 0 ? Math.round((monthConfirmed / monthTotal) * 100) : 0;

    // Общая статистика
    const totalLogs = await prisma.intakeLog.count({
      where: {
        userId: user.id,
      },
    });

    const totalConfirmed = await prisma.intakeLog.count({
      where: {
        userId: user.id,
        status: 'CONFIRMED',
      },
    });

    const totalPercentage =
      totalLogs > 0 ? Math.round((totalConfirmed / totalLogs) * 100) : 0;

    const message =
      `📊 <b>Статистика приёма лекарств</b>\n\n` +
      `📅 <b>За эту неделю</b> (${format(weekStart, 'dd.MM')} - ${format(weekEnd, 'dd.MM')})\n` +
      `   Принято: ${weekConfirmed} из ${weekTotal}\n` +
      `   Соблюдение: ${weekPercentage}%\n` +
      `   ${getProgressBar(weekPercentage)}\n\n` +
      `📆 <b>За этот месяц</b> (${format(monthStart, 'MMMM yyyy')})\n` +
      `   Принято: ${monthConfirmed} из ${monthTotal}\n` +
      `   Соблюдение: ${monthPercentage}%\n` +
      `   ${getProgressBar(monthPercentage)}\n\n` +
      `📈 <b>За всё время</b>\n` +
      `   Принято: ${totalConfirmed} из ${totalLogs}\n` +
      `   Соблюдение: ${totalPercentage}%\n` +
      `   ${getProgressBar(totalPercentage)}`;

    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    logger.error({ error, userId: telegramId }, 'Error in stats command');
    await ctx.reply('Произошла ошибка при получении статистики.');
  }
}

function getProgressBar(percentage: number): string {
  const filled = Math.round(percentage / 10);
  const empty = 10 - filled;
  return '▰'.repeat(filled) + '▱'.repeat(empty) + ` ${percentage}%`;
}
