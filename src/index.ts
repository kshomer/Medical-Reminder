import { Telegraf } from 'telegraf';
import { logger } from './utils/logger';
import { setupBot } from './bot';
import { BotContext } from './bot/types';
import { SchedulerService } from './services/scheduler.service';
import * as dotenv from 'dotenv';

dotenv.config();

const bot = new Telegraf<BotContext>(process.env.TELEGRAM_BOT_TOKEN!);

// Запускаем scheduler для уведомлений
const scheduler = new SchedulerService(bot);

setupBot(bot, scheduler);

scheduler.start();

bot.launch({ dropPendingUpdates: true })
  .then(() => logger.info('Bot started in polling mode with scheduler'))
  .catch((err) => logger.error({ err }, 'Failed to start bot'));

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing gracefully...');
  scheduler.stop();
  await bot.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing gracefully...');
  scheduler.stop();
  await bot.stop();
  process.exit(0);
});