import { Scenes } from 'telegraf';
import { MedicationService } from '../../services/medication.service';
import { logger } from '../../utils/logger';
import { BotContext } from '../types';

const addMedicationScene = new Scenes.WizardScene<BotContext>(
  'add-medication',
  async (ctx) => {
    await ctx.reply('Введите название лекарства:');
    ctx.scene.session.medication = {};
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.message && 'text' in ctx.message) {
      ctx.scene.session.medication!.name = ctx.message.text;
      await ctx.reply('Добавьте описание (или отправьте /skip):');
      return ctx.wizard.next();
    }
    await ctx.reply('Пожалуйста, введите текст.');
  },
  async (ctx) => {
    if (ctx.message && 'text' in ctx.message) {
      if (ctx.message.text !== '/skip') {
        ctx.scene.session.medication!.description = ctx.message.text;
      }
      await ctx.reply('Когда начать принимать?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Сегодня', callback_data: 'start_today' }],
            [{ text: 'Завтра', callback_data: 'start_tomorrow' }]
          ]
        }
      });
      return ctx.wizard.next();
    }
    await ctx.reply('Пожалуйста, введите текст или /skip.');
  },
  async (ctx) => {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const today = new Date();
      ctx.scene.session.medication!.startDate = ctx.callbackQuery.data === 'start_today' ? today : new Date(today.setDate(today.getDate() + 1));
      await ctx.reply('Как долго принимать?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Бессрочно', callback_data: 'duration_endless' }],
            [{ text: '7 дней', callback_data: 'duration_7days' }],
            [{ text: '30 дней', callback_data: 'duration_30days' }]
          ]
        }
      });
      await ctx.answerCbQuery();
      return ctx.wizard.next();
    }
  },
  async (ctx) => {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const today = new Date();
      if (ctx.callbackQuery.data === 'duration_endless') {
        ctx.scene.session.medication!.endDate = null;
      } else if (ctx.callbackQuery.data === 'duration_7days') {
        ctx.scene.session.medication!.endDate = new Date(today.setDate(today.getDate() + 7));
      } else {
        ctx.scene.session.medication!.endDate = new Date(today.setDate(today.getDate() + 30));
      }
      await ctx.reply('Как часто принимать?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Каждый день', callback_data: 'freq_daily' }]
          ]
        }
      });
      await ctx.answerCbQuery();
      return ctx.wizard.next();
    }
  },
  async (ctx) => {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      ctx.scene.session.medication!.frequency = 'DAILY';
      await ctx.reply('Введите время (ЧЧ:ММ, например 09:00):');
      await ctx.answerCbQuery();
      return ctx.wizard.next();
    }
  },
  async (ctx) => {
    if (ctx.message && 'text' in ctx.message) {
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (timeRegex.test(ctx.message.text)) {
        ctx.scene.session.medication!.time = ctx.message.text;
        await ctx.reply('Введите дозировку:');
        return ctx.wizard.next();
      }
      await ctx.reply('❌ Неверный формат времени. Используйте ЧЧ:ММ (09:00).');
    }
  },
  async (ctx) => {
    if (ctx.message && 'text' in ctx.message) {
      ctx.scene.session.medication!.dosage = ctx.message.text;
      await ctx.reply('Есть особенности приёма?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'До еды', callback_data: 'notes_before' }],
            [{ text: 'После еды', callback_data: 'notes_after' }],
            [{ text: 'Пропустить', callback_data: 'notes_none' }]
          ]
        }
      });
      return ctx.wizard.next();
    }
    await ctx.reply('Пожалуйста, введите текст.');
  },
  async (ctx) => {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      if (ctx.callbackQuery.data !== 'notes_none') {
        ctx.scene.session.medication!.notes = ctx.callbackQuery.data === 'notes_before' ? 'До еды' : 'После еды';
      }
      const { name, description, startDate, endDate, frequency, time, dosage, notes } = ctx.scene.session.medication!;
      await ctx.reply(
        `📋 Проверьте данные:\n\n` +
        `💊 Лекарство: ${name}\n` +
        (description ? `📝 Описание: ${description}\n` : '') +
        `📅 Начало: ${startDate?.toLocaleDateString('ru-RU')}\n` +
        `📅 Окончание: ${endDate ? endDate.toLocaleDateString('ru-RU') : 'Бессрочно'}\n` +
        `📆 Частота: ${frequency === 'DAILY' ? 'Каждый день' : frequency}\n` +
        `🕐 Время: ${time}\n` +
        `💉 Дозировка: ${dosage}\n` +
        (notes ? `ℹ️ Особенности: ${notes}\n` : '') +
        `\nВсё верно?`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Сохранить', callback_data: 'confirm_save' }],
              [{ text: '❌ Отменить', callback_data: 'confirm_cancel' }]
            ]
          }
        }
      );
      await ctx.answerCbQuery();
      return ctx.wizard.next();
    }
  },
  async (ctx) => {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      if (ctx.callbackQuery.data === 'confirm_cancel') {
        await ctx.reply('❌ Операция отменена.');
        await ctx.answerCbQuery();
        return ctx.scene.leave();
      }
      
      const medicationService = new MedicationService();
      const telegramId = ctx.from?.id.toString();
      
      if (!telegramId) {
        await ctx.reply('Ошибка: не удалось определить пользователя.');
        return ctx.scene.leave();
      }
      
      try {
        await medicationService.createMedication({
          telegramId,
          name: ctx.scene.session.medication!.name!,
          description: ctx.scene.session.medication!.description,
          startDate: ctx.scene.session.medication!.startDate!,
          endDate: ctx.scene.session.medication!.endDate,
          frequency: ctx.scene.session.medication!.frequency!,
          schedules: [{ time: ctx.scene.session.medication!.time!, dosage: ctx.scene.session.medication!.dosage!, notes: ctx.scene.session.medication!.notes }]
        });
        
        await ctx.reply('✅ Лекарство успешно добавлено!');
        await ctx.answerCbQuery();
      } catch (err) {
        logger.error({ err, userId: ctx.from?.id }, 'Failed to save medication');
        await ctx.reply('Ошибка при сохранении. Попробуйте снова.');
      }
      
      return ctx.scene.leave();
    }
  }
);

addMedicationScene.command('cancel', async (ctx) => {
  await ctx.reply('❌ Операция отменена.');
  return ctx.scene.leave();
});

export { addMedicationScene };