import { Telegraf } from 'telegraf';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { format, startOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { BotContext } from '../bot/types';
import type { Medication, Schedule, User } from '@prisma/client';

export class NotificationService {
  private bot: Telegraf<BotContext>;

  constructor(bot: Telegraf<BotContext>) {
    this.bot = bot;
  }

  async sendScheduledNotifications() {
    try {
      const now = new Date();
      const currentTime = format(now, 'HH:mm');

      logger.info({ time: currentTime }, 'Checking for scheduled medications');

      // Получаем все активные расписания на текущее время
      const schedules = await prisma.schedule.findMany({
        where: {
          time: currentTime,
          isActive: true,
          medication: {
            isActive: true,
          },
        },
        include: {
          medication: {
            include: {
              user: true,
            },
          },
        },
      });

      logger.info({ count: schedules.length }, 'Found schedules to process');

      for (const schedule of schedules) {
        await this.processSchedule(schedule, now);
      }
    } catch (error) {
      logger.error({ error }, 'Error in sendScheduledNotifications');
    }
  }

  private async processSchedule(
    schedule: Schedule & { medication: Medication & { user: User } },
    now: Date
  ) {
    try {
      const { medication } = schedule;
      const user = medication.user;

      // Преобразуем время в часовой пояс пользователя
      const userTime = toZonedTime(now, user.timezone);
      const today = startOfDay(userTime);

      // Проверяем, нужно ли отправлять уведомление сегодня
      if (!this.shouldSendToday(medication, userTime)) {
        return;
      }

      // Проверяем, не отправляли ли уже сегодня
      const existingLog = await prisma.intakeLog.findUnique({
        where: {
          scheduleId_scheduledDate: {
            scheduleId: schedule.id,
            scheduledDate: today,
          },
        },
      });

      if (existingLog) {
        logger.debug(
          { scheduleId: schedule.id, userId: user.telegramId },
          'Notification already sent today'
        );
        return;
      }

      // Создаем запись в логе
      await prisma.intakeLog.create({
        data: {
          userId: user.id,
          medicationId: medication.id,
          scheduleId: schedule.id,
          scheduledDate: today,
          status: 'SENT',
          sentAt: now,
        },
      });

      // Отправляем уведомление
      await this.sendNotification(user.telegramId, medication, schedule);

      logger.info(
        { userId: user.telegramId, medicationId: medication.id },
        'Notification sent successfully'
      );
    } catch (error) {
      logger.error({ error, scheduleId: schedule.id }, 'Error processing schedule');
    }
  }

  private shouldSendToday(medication: Medication, userTime: Date): boolean {
    const dayOfWeek = format(userTime, 'EEEE');

    switch (medication.frequency) {
      case 'DAILY':
        return true;

      case 'WEEKLY': {
        if (!medication.weekDays) return false;
        try {
          const weekDays = JSON.parse(medication.weekDays);
          return weekDays.includes(dayOfWeek);
        } catch {
          return false;
        }
      }

      case 'INTERVAL': {
        if (!medication.intervalDays) return false;
        const daysSinceStart = Math.floor(
          (userTime.getTime() - medication.startDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysSinceStart % medication.intervalDays === 0;
      }

      default:
        return true;
    }
  }

  private async sendNotification(
    telegramId: string,
    medication: Medication,
    schedule: Schedule
  ) {
    try {
      const message =
        `💊 <b>Время принять лекарство!</b>\n\n` +
        `<b>${medication.name}</b>\n` +
        `💉 Дозировка: ${schedule.dosage}\n` +
        `⏰ Время: ${schedule.time}\n` +
        (schedule.notes ? `ℹ️ ${schedule.notes}\n` : '') +
        `\nНажмите кнопку после приёма:`;

      await this.bot.telegram.sendMessage(telegramId, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '✅ Принял',
                callback_data: `confirm_intake:${schedule.id}:${format(new Date(), 'yyyy-MM-dd')}`,
              },
            ],
            [
              {
                text: '⏰ Напомнить через 15 минут',
                callback_data: `snooze_intake:${schedule.id}:${format(new Date(), 'yyyy-MM-dd')}`,
              },
            ],
            [
              {
                text: '❌ Пропустить',
                callback_data: `skip_intake:${schedule.id}:${format(new Date(), 'yyyy-MM-dd')}`,
              },
            ],
          ],
        },
      });
    } catch (error) {
      logger.error({ error, telegramId }, 'Failed to send notification');
      throw error;
    }
  }

  async confirmIntake(scheduleId: number, date: string, userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { telegramId: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Парсим дату и приводим к началу дня
      const scheduledDate = startOfDay(new Date(date));

      await prisma.intakeLog.update({
        where: {
          scheduleId_scheduledDate: {
            scheduleId,
            scheduledDate,
          },
        },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
        },
      });

      logger.info({ scheduleId, userId }, 'Intake confirmed');
      return true;
    } catch (error) {
      logger.error({ error, scheduleId }, 'Error confirming intake');
      throw error;
    }
  }

  async skipIntake(scheduleId: number, date: string, userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { telegramId: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Парсим дату и приводим к началу дня
      const scheduledDate = startOfDay(new Date(date));

      await prisma.intakeLog.update({
        where: {
          scheduleId_scheduledDate: {
            scheduleId,
            scheduledDate,
          },
        },
        data: {
          status: 'MISSED',
        },
      });

      logger.info({ scheduleId, userId }, 'Intake marked as missed');
      return true;
    } catch (error) {
      logger.error({ error, scheduleId }, 'Error skipping intake');
      throw error;
    }
  }
}
