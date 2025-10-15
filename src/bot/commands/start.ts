import { Context } from 'telegraf';
import { UserService } from '../../services/user.service';
import { logger } from '../../utils/logger';

export async function start(ctx: Context) {
  const userService = new UserService();
  const telegramId = ctx.from?.id.toString();

  if (!telegramId) {
    logger.error({ chatId: ctx.chat?.id }, 'No user ID in start command');
    return ctx.reply('Ошибка: не удалось определить пользователя.');
  }

  const existingUser = await userService.getUserByTelegramId(telegramId);
  
  if (existingUser) {
    return ctx.reply('✅ Вы уже зарегистрированы! Используйте /help для списка команд.');
  }

  await userService.createUser({
    telegramId,
    firstName: ctx.from?.first_name,
    timezone: 'Europe/Moscow'
  });

  await ctx.reply(
    `👋 Добро пожаловать в Med Reminder Bot!\n\n` +
    `Я помогу вам не забывать о приёме лекарств.\n\n` +
    `Используйте /add чтобы добавить первое лекарство.`
  );
}