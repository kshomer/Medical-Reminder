import { Telegraf, Scenes, session } from 'telegraf';
import { start } from './commands/start';
import { help } from './commands/help';
import { list } from './commands/list';
import { stats } from './commands/stats';
import { deleteMedication, handleDeleteCallback } from './commands/delete';
import { addMedicationImprovedScene } from './scenes/add-medication-improved.scene';
import { logger } from '../utils/logger';
import { BotContext } from './types';
import { SchedulerService } from '../services/scheduler.service';

let schedulerService: SchedulerService;

export function setupBot(bot: Telegraf<BotContext>, scheduler?: SchedulerService) {
  if (scheduler) {
    schedulerService = scheduler;
  }

  const stage = new Scenes.Stage<BotContext>([addMedicationImprovedScene]);

  bot.use(session());
  bot.use(stage.middleware());

  // Команды
  bot.command('start', start);
  bot.command('help', help);
  bot.command('list', list);
  bot.command('stats', stats);
  bot.command('delete', deleteMedication);
  
  bot.command('add', async (ctx) => {
    logger.info({ userId: ctx.from?.id }, 'User started adding medication (improved)');
    await ctx.scene.enter('add-medication-improved');
  });

  // Обработчики callback для уведомлений
  bot.action(/^confirm_intake:(\d+):(.+)$/, async (ctx) => {
    const match = ctx.match;
    const scheduleId = parseInt(match[1]);
    const date = match[2];
    const userId = ctx.from?.id.toString();

    if (!userId || !schedulerService) return ctx.answerCbQuery('Ошибка');

    try {
      await schedulerService
        .getNotificationService()
        .confirmIntake(scheduleId, date, userId);
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      const originalText =
        (ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message
          ? ctx.callbackQuery.message.text
          : 'Напоминание') || '';
      await ctx.editMessageText(originalText + '\n\n✅ <b>Отмечено как принято</b>', {
        parse_mode: 'HTML',
      });
      await ctx.answerCbQuery('✅ Принято!');
    } catch (error) {
      logger.error({ error }, 'Error confirming intake');
      await ctx.answerCbQuery('Ошибка');
    }
  });

  bot.action(/^skip_intake:(\d+):(.+)$/, async (ctx) => {
    const match = ctx.match;
    const scheduleId = parseInt(match[1]);
    const date = match[2];
    const userId = ctx.from?.id.toString();

    if (!userId || !schedulerService) return ctx.answerCbQuery('Ошибка');

    try {
      await schedulerService.getNotificationService().skipIntake(scheduleId, date, userId);
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      const originalText =
        (ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message
          ? ctx.callbackQuery.message.text
          : 'Напоминание') || '';
      await ctx.editMessageText(originalText + '\n\n❌ <b>Пропущено</b>', {
        parse_mode: 'HTML',
      });
      await ctx.answerCbQuery('Пропущено');
    } catch (error) {
      logger.error({ error }, 'Error skipping intake');
      await ctx.answerCbQuery('Ошибка');
    }
  });

  bot.action(/^snooze_intake:(\d+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('⏰ Напомню через 15 минут');
    // TODO: Реализовать отложенное напоминание
  });

  // Обработчики для удаления
  bot.action(/^delete_med:(\d+)$/, async (ctx) => {
    const medicationId = parseInt(ctx.match[1]);
    await handleDeleteCallback(ctx, medicationId);
  });

  bot.action('cancel_delete', async (ctx) => {
    await ctx.editMessageText('Отменено.');
    await ctx.answerCbQuery();
  });

  // Обработчик для игнорирования callback (используется в календаре)
  bot.action('ignore', async (ctx) => {
    await ctx.answerCbQuery();
  });

  bot.on('message', async (ctx) => {
    await ctx.reply('Используйте /help для списка команд.');
  });

  bot.catch(async (err, ctx) => {
    logger.error({ err, userId: ctx.from?.id }, 'Bot error');
    await ctx.reply('Произошла ошибка. Попробуйте позже или свяжитесь с поддержкой.');
  });
}