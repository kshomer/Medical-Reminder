import * as cron from 'node-cron';
import { Telegraf } from 'telegraf';
import { NotificationService } from './notification.service';
import { logger } from '../utils/logger';
import { BotContext } from '../bot/types';

export class SchedulerService {
  private notificationService: NotificationService;
  private task: cron.ScheduledTask | null = null;

  constructor(bot: Telegraf<BotContext>) {
    this.notificationService = new NotificationService(bot);
  }

  start() {
    // Запускаем проверку каждую минуту
    this.task = cron.schedule('* * * * *', async () => {
      try {
        await this.notificationService.sendScheduledNotifications();
      } catch (error) {
        logger.error({ error }, 'Error in scheduled task');
      }
    });

    logger.info('Scheduler started - checking for notifications every minute');
  }

  stop() {
    if (this.task) {
      this.task.stop();
      logger.info('Scheduler stopped');
    }
  }

  getNotificationService(): NotificationService {
    return this.notificationService;
  }
}
