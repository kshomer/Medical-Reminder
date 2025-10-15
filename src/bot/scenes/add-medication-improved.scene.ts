import { Scenes } from 'telegraf';
import { MedicationService } from '../../services/medication.service';
import { logger } from '../../utils/logger';
import { BotContext } from '../types';
import { generateCalendar, generateWeekDaysKeyboard } from '../../utils/calendar';
import { addDays, format, parse } from 'date-fns';

const medicationService = new MedicationService();

// Шаг 1: Название лекарства
const step1Name = async (ctx: BotContext) => {
  await ctx.reply('📝 Введите название лекарства:');
  ctx.scene.session.medication = { schedules: [] };
  return ctx.wizard.next();
};

// Шаг 2: Получение названия
const step2GetName = async (ctx: BotContext) => {
  if (ctx.message && 'text' in ctx.message) {
    ctx.scene.session.medication!.name = ctx.message.text;
    await ctx.reply('📄 Добавьте описание (или отправьте /skip):');
    return ctx.wizard.next();
  }
  await ctx.reply('Пожалуйста, введите текст.');
};

// Шаг 3: Описание
const step3Description = async (ctx: BotContext) => {
  if (ctx.message && 'text' in ctx.message) {
    if (ctx.message.text !== '/skip') {
      ctx.scene.session.medication!.description = ctx.message.text;
    }
    
    await ctx.reply('📅 Когда начать принимать?', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Сегодня', callback_data: 'start_today' }],
          [{ text: 'Завтра', callback_data: 'start_tomorrow' }],
          [{ text: '📆 Выбрать дату', callback_data: 'start_calendar' }],
        ],
      },
    });
    return ctx.wizard.next();
  }
  await ctx.reply('Пожалуйста, введите текст или /skip.');
};

// Шаг 4: Дата начала
const step4StartDate = async (ctx: BotContext) => {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    return;
  }

  const data = ctx.callbackQuery.data;

  if (data === 'start_today') {
    ctx.scene.session.medication!.startDate = new Date();
    await ctx.answerCbQuery();
    await askDuration(ctx);
    return ctx.wizard.next();
  } else if (data === 'start_tomorrow') {
    ctx.scene.session.medication!.startDate = addDays(new Date(), 1);
    await ctx.answerCbQuery();
    await askDuration(ctx);
    return ctx.wizard.next();
  } else if (data === 'start_calendar') {
    // Показываем календарь
    ctx.scene.session.medication!.tempDate = new Date();
    const keyboard = generateCalendar(new Date(), 'start');
    await ctx.editMessageText('📆 Выберите дату начала приёма:', {
      reply_markup: { inline_keyboard: keyboard },
    });
    await ctx.answerCbQuery();
    return;
  } else if (data.startsWith('start_select_date:')) {
    const dateStr = data.split(':')[1];
    ctx.scene.session.medication!.startDate = parse(dateStr, 'yyyy-MM-dd', new Date());
    await ctx.answerCbQuery('Дата выбрана');
    await askDuration(ctx);
    return ctx.wizard.next();
  } else if (data.startsWith('start_prev_month:') || data.startsWith('start_next_month:')) {
    const dateStr = data.split(':')[1];
    const currentDate = parse(dateStr, 'yyyy-MM-dd', new Date());
    const newDate = data.startsWith('start_prev')
      ? addDays(currentDate, -30)
      : addDays(currentDate, 30);
    
    const keyboard = generateCalendar(newDate, 'start');
    await ctx.editMessageReplyMarkup({ inline_keyboard: keyboard });
    await ctx.answerCbQuery();
    return;
  } else if (data === 'start_cancel') {
    await ctx.editMessageText('Отменено. Начните заново с /add');
    await ctx.answerCbQuery();
    return ctx.scene.leave();
  }
};

async function askDuration(ctx: BotContext) {
  await ctx.editMessageText('⏱ Как долго принимать?', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Бессрочно', callback_data: 'duration_endless' }],
        [{ text: '7 дней', callback_data: 'duration_7' }],
        [{ text: '14 дней', callback_data: 'duration_14' }],
        [{ text: '30 дней', callback_data: 'duration_30' }],
        [{ text: '📆 Выбрать период', callback_data: 'duration_custom' }],
      ],
    },
  });
}

// Шаг 5: Длительность
const step5Duration = async (ctx: BotContext) => {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    return;
  }

  const data = ctx.callbackQuery.data;
  const startDate = ctx.scene.session.medication!.startDate!;

  if (data === 'duration_endless') {
    ctx.scene.session.medication!.endDate = null;
  } else if (data === 'duration_7') {
    ctx.scene.session.medication!.endDate = addDays(startDate, 7);
  } else if (data === 'duration_14') {
    ctx.scene.session.medication!.endDate = addDays(startDate, 14);
  } else if (data === 'duration_30') {
    ctx.scene.session.medication!.endDate = addDays(startDate, 30);
  } else if (data === 'duration_custom') {
    ctx.scene.session.medication!.tempDate = addDays(startDate, 7);
    const keyboard = generateCalendar(addDays(startDate, 7), 'end');
    await ctx.editMessageText('📆 Выберите дату окончания приёма:', {
      reply_markup: { inline_keyboard: keyboard },
    });
    await ctx.answerCbQuery();
    return;
  } else if (data.startsWith('end_select_date:')) {
    const dateStr = data.split(':')[1];
    ctx.scene.session.medication!.endDate = parse(dateStr, 'yyyy-MM-dd', new Date());
    await ctx.answerCbQuery('Дата выбрана');
  } else if (data.startsWith('end_prev_month:') || data.startsWith('end_next_month:')) {
    const dateStr = data.split(':')[1];
    const currentDate = parse(dateStr, 'yyyy-MM-dd', new Date());
    const newDate = data.startsWith('end_prev')
      ? addDays(currentDate, -30)
      : addDays(currentDate, 30);
    
    const keyboard = generateCalendar(newDate, 'end');
    await ctx.editMessageReplyMarkup({ inline_keyboard: keyboard });
    await ctx.answerCbQuery();
    return;
  } else if (data === 'end_cancel') {
    await ctx.editMessageText('Отменено. Начните заново с /add');
    await ctx.answerCbQuery();
    return ctx.scene.leave();
  }

  if (!data.startsWith('end_prev') && !data.startsWith('end_next')) {
    await ctx.answerCbQuery();
    await askFrequency(ctx);
    return ctx.wizard.next();
  }
};

async function askFrequency(ctx: BotContext) {
  await ctx.editMessageText('📆 Как часто принимать?', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Каждый день', callback_data: 'freq_daily' }],
        [{ text: 'Выбрать дни недели', callback_data: 'freq_weekly' }],
        [{ text: 'Через N дней', callback_data: 'freq_interval' }],
      ],
    },
  });
}

// Шаг 6: Частота приёма
const step6Frequency = async (ctx: BotContext) => {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    return;
  }

  const data = ctx.callbackQuery.data;

  if (data === 'freq_daily') {
    ctx.scene.session.medication!.frequency = 'DAILY';
    ctx.scene.session.medication!.weekDays = undefined;
    ctx.scene.session.medication!.intervalDays = undefined;
    await ctx.answerCbQuery();
    await askTimesPerDay(ctx);
    return ctx.wizard.next();
  } else if (data === 'freq_weekly') {
    ctx.scene.session.medication!.frequency = 'WEEKLY';
    ctx.scene.session.medication!.weekDays = [];
    const keyboard = generateWeekDaysKeyboard([], 'freq');
    await ctx.editMessageText('📅 Выберите дни недели для приёма:', {
      reply_markup: { inline_keyboard: keyboard },
    });
    await ctx.answerCbQuery();
    return;
  } else if (data === 'freq_interval') {
    ctx.scene.session.medication!.frequency = 'INTERVAL';
    await ctx.editMessageText('🔢 Введите через сколько дней принимать лекарство (например, 2):');
    await ctx.answerCbQuery();
    return;
  } else if (data.startsWith('freq_toggle_day:')) {
    const day = data.split(':')[1];
    const currentDays = ctx.scene.session.medication!.weekDays || [];
    
    if (currentDays.includes(day)) {
      ctx.scene.session.medication!.weekDays = currentDays.filter((d) => d !== day);
    } else {
      ctx.scene.session.medication!.weekDays = [...currentDays, day];
    }
    
    const keyboard = generateWeekDaysKeyboard(ctx.scene.session.medication!.weekDays, 'freq');
    await ctx.editMessageReplyMarkup({ inline_keyboard: keyboard });
    await ctx.answerCbQuery();
    return;
  } else if (data === 'freq_confirm_days') {
    const selectedDays = ctx.scene.session.medication!.weekDays || [];
    if (selectedDays.length === 0) {
      await ctx.answerCbQuery('⚠️ Выберите хотя бы один день');
      return;
    }
    await ctx.answerCbQuery('✅ Дни выбраны');
    await askTimesPerDay(ctx);
    return ctx.wizard.next();
  } else if (data === 'freq_cancel') {
    await ctx.editMessageText('Отменено. Начните заново с /add');
    await ctx.answerCbQuery();
    return ctx.scene.leave();
  }
};

// Шаг 6b: Обработка интервала (если выбран "Через N дней")
const step6bInterval = async (ctx: BotContext) => {
  if (ctx.scene.session.medication!.frequency === 'INTERVAL') {
    if (ctx.message && 'text' in ctx.message) {
      const interval = parseInt(ctx.message.text);
      if (isNaN(interval) || interval < 1) {
        await ctx.reply('❌ Введите положительное число (например, 2 или 3)');
        return;
      }
      ctx.scene.session.medication!.intervalDays = interval;
      await askTimesPerDay(ctx);
      return ctx.wizard.next();
    }
    await ctx.reply('Пожалуйста, введите число.');
    return;
  }
  
  // Если не INTERVAL, пропускаем этот шаг
  return ctx.wizard.next();
};

async function askTimesPerDay(ctx: BotContext) {
  await ctx.reply('🔢 Сколько раз в день принимать?', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '1 раз в день', callback_data: 'times_1' }],
        [{ text: '2 раза в день', callback_data: 'times_2' }],
        [{ text: '3 раза в день', callback_data: 'times_3' }],
        [{ text: '📝 Указать своё', callback_data: 'times_custom' }],
      ],
    },
  });
}

// Шаг 7: Количество раз в день
const step7TimesPerDay = async (ctx: BotContext) => {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    return;
  }

  const data = ctx.callbackQuery.data;

  if (data === 'times_1' || data === 'times_2' || data === 'times_3') {
    const times = parseInt(data.split('_')[1]);
    ctx.scene.session.medication!.timesPerDay = times;
    ctx.scene.session.medication!.schedules = [];
    ctx.scene.session.medication!.currentScheduleIndex = 0;
    await ctx.answerCbQuery();
    await askTimeForSchedule(ctx, 0, times);
    return ctx.wizard.next();
  } else if (data === 'times_custom') {
    await ctx.editMessageText('🔢 Введите количество раз в день (число от 1 до 10):');
    await ctx.answerCbQuery();
    return;
  }
};

// Шаг 7b: Обработка custom количества
const step7bCustomTimes = async (ctx: BotContext) => {
  if (ctx.scene.session.medication!.timesPerDay) {
    // Уже установлено, пропускаем
    return ctx.wizard.next();
  }

  if (ctx.message && 'text' in ctx.message) {
    const times = parseInt(ctx.message.text);
    if (isNaN(times) || times < 1 || times > 10) {
      await ctx.reply('❌ Введите число от 1 до 10');
      return;
    }
    ctx.scene.session.medication!.timesPerDay = times;
    ctx.scene.session.medication!.schedules = [];
    ctx.scene.session.medication!.currentScheduleIndex = 0;
    await askTimeForSchedule(ctx, 0, times);
    return ctx.wizard.next();
  }
  
  await ctx.reply('Пожалуйста, введите число.');
};

async function askTimeForSchedule(ctx: BotContext, index: number, total: number) {
  const scheduleNum = index + 1;
  await ctx.reply(
    `⏰ Приём ${scheduleNum} из ${total}\n\n` + `Введите время приёма (например, 09:00):`
  );
}

// Шаг 8: Ввод времени
const step8Time = async (ctx: BotContext) => {
  if (ctx.message && 'text' in ctx.message) {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(ctx.message.text)) {
      await ctx.reply('❌ Неверный формат времени. Используйте ЧЧ:ММ (например, 09:00)');
      return;
    }

    const index = ctx.scene.session.medication!.currentScheduleIndex || 0;
    if (!ctx.scene.session.medication!.schedules) {
      ctx.scene.session.medication!.schedules = [];
    }
    
    // Сохраняем время для текущего schedule
    if (!ctx.scene.session.medication!.schedules[index]) {
      ctx.scene.session.medication!.schedules[index] = {
        time: ctx.message.text,
        dosage: '',
      };
    } else {
      ctx.scene.session.medication!.schedules[index].time = ctx.message.text;
    }

    await ctx.reply('💊 Введите дозировку (например, 1 таблетка, 5 мл):');
    return ctx.wizard.next();
  }
  await ctx.reply('Пожалуйста, введите время в формате ЧЧ:ММ');
};

// Шаг 9: Ввод дозировки
const step9Dosage = async (ctx: BotContext) => {
  if (ctx.message && 'text' in ctx.message) {
    const index = ctx.scene.session.medication!.currentScheduleIndex || 0;
    ctx.scene.session.medication!.schedules![index].dosage = ctx.message.text;

    await ctx.reply('ℹ️ Есть особенности приёма?', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'До еды', callback_data: 'notes_before' }],
          [{ text: 'После еды', callback_data: 'notes_after' }],
          [{ text: 'Во время еды', callback_data: 'notes_during' }],
          [{ text: 'Пропустить', callback_data: 'notes_none' }],
        ],
      },
    });
    return ctx.wizard.next();
  }
  await ctx.reply('Пожалуйста, введите дозировку.');
};

// Шаг 10: Особенности приёма
const step10Notes = async (ctx: BotContext) => {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    return;
  }

  const data = ctx.callbackQuery.data;
  const index = ctx.scene.session.medication!.currentScheduleIndex || 0;

  if (data === 'notes_before') {
    ctx.scene.session.medication!.schedules![index].notes = 'До еды';
  } else if (data === 'notes_after') {
    ctx.scene.session.medication!.schedules![index].notes = 'После еды';
  } else if (data === 'notes_during') {
    ctx.scene.session.medication!.schedules![index].notes = 'Во время еды';
  } else if (data === 'notes_none') {
    ctx.scene.session.medication!.schedules![index].notes = undefined;
  }

  await ctx.answerCbQuery();

  const timesPerDay = ctx.scene.session.medication!.timesPerDay || 1;
  const nextIndex = index + 1;

  // Проверяем, нужны ли ещё приёмы
  if (nextIndex < timesPerDay) {
    ctx.scene.session.medication!.currentScheduleIndex = nextIndex;
    await ctx.editMessageText('✅ Сохранено!');
    await askTimeForSchedule(ctx, nextIndex, timesPerDay);
    // Возвращаемся к шагу ввода времени
    ctx.wizard.selectStep(7); // step8Time
    return;
  }

  // Все приёмы введены, показываем подтверждение
  await showFinalConfirmation(ctx);
  return ctx.wizard.next();
};

async function showFinalConfirmation(ctx: BotContext) {
  const med = ctx.scene.session.medication!;
  const schedules = med.schedules || [];

  let message = '📋 <b>Проверьте данные:</b>\n\n';
  message += `💊 <b>Лекарство:</b> ${med.name}\n`;
  
  if (med.description) {
    message += `📝 <b>Описание:</b> ${med.description}\n`;
  }

  message += `📅 <b>Начало:</b> ${format(med.startDate!, 'dd.MM.yyyy')}\n`;
  
  if (med.endDate) {
    message += `📅 <b>Окончание:</b> ${format(med.endDate, 'dd.MM.yyyy')}\n`;
  } else {
    message += `📅 <b>Окончание:</b> Бессрочно\n`;
  }

  // Частота
  if (med.frequency === 'DAILY') {
    message += `📆 <b>Частота:</b> Каждый день\n`;
  } else if (med.frequency === 'WEEKLY') {
    const days = med.weekDays || [];
    const daysRu = days.map((d) => translateDayToRu(d)).join(', ');
    message += `📆 <b>Частота:</b> ${daysRu}\n`;
  } else if (med.frequency === 'INTERVAL') {
    message += `📆 <b>Частота:</b> Через ${med.intervalDays} дней\n`;
  }

  message += `🔢 <b>Раз в день:</b> ${med.timesPerDay}\n\n`;

  message += `⏰ <b>Расписание приёма:</b>\n`;
  schedules.forEach((schedule, idx) => {
    message += `\n<b>${idx + 1}.</b> ${schedule.time} - ${schedule.dosage}`;
    if (schedule.notes) {
      message += ` (${schedule.notes})`;
    }
  });

  message += `\n\n<b>Всё верно?</b>`;

  await ctx.editMessageText(message, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Сохранить', callback_data: 'confirm_save' }],
        [{ text: '❌ Отменить', callback_data: 'confirm_cancel' }],
      ],
    },
  });
}

function translateDayToRu(day: string): string {
  const map: Record<string, string> = {
    Monday: 'Пн',
    Tuesday: 'Вт',
    Wednesday: 'Ср',
    Thursday: 'Чт',
    Friday: 'Пт',
    Saturday: 'Сб',
    Sunday: 'Вс',
  };
  return map[day] || day;
}

// Шаг 11: Финальное подтверждение и сохранение
const step11Confirmation = async (ctx: BotContext) => {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
    return;
  }

  const data = ctx.callbackQuery.data;

  if (data === 'confirm_cancel') {
    await ctx.editMessageText('❌ Отменено.');
    await ctx.answerCbQuery();
    return ctx.scene.leave();
  }

  if (data === 'confirm_save') {
    const telegramId = ctx.from?.id.toString();

    if (!telegramId) {
      await ctx.editMessageText('Ошибка: не удалось определить пользователя.');
      await ctx.answerCbQuery();
      return ctx.scene.leave();
    }

    try {
      const med = ctx.scene.session.medication!;
      
      await medicationService.createMedication({
        telegramId,
        name: med.name!,
        description: med.description,
        startDate: med.startDate!,
        endDate: med.endDate,
        frequency: med.frequency!,
        weekDays: med.weekDays,
        intervalDays: med.intervalDays,
        timesPerDay: med.timesPerDay!,
        schedules: med.schedules!,
      });

      await ctx.editMessageText('✅ <b>Лекарство успешно добавлено!</b>', {
        parse_mode: 'HTML',
      });
      await ctx.answerCbQuery('Сохранено!');
      
      logger.info({ userId: telegramId, medication: med.name }, 'Medication added via improved scene');
    } catch (err) {
      logger.error({ err, userId: ctx.from?.id }, 'Failed to save medication');
      await ctx.editMessageText('❌ Ошибка при сохранении. Попробуйте снова.');
      await ctx.answerCbQuery('Ошибка');
    }

    return ctx.scene.leave();
  }
};

export const addMedicationImprovedScene = new Scenes.WizardScene<BotContext>(
  'add-medication-improved',
  step1Name,
  step2GetName,
  step3Description,
  step4StartDate,
  step5Duration,
  step6Frequency,
  step6bInterval,
  step7TimesPerDay,
  step7bCustomTimes,
  step8Time,
  step9Dosage,
  step10Notes,
  step11Confirmation
);
