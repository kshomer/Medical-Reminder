import { InlineKeyboardButton } from 'telegraf/types';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { ru } from 'date-fns/locale';

export function generateCalendar(date: Date, prefix: string): InlineKeyboardButton[][] {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const keyboard: InlineKeyboardButton[][] = [];

  // Заголовок с месяцем и годом
  keyboard.push([
    {
      text: '◀️',
      callback_data: `${prefix}_prev_month:${format(date, 'yyyy-MM-dd')}`,
    },
    {
      text: format(date, 'LLLL yyyy', { locale: ru }),
      callback_data: 'ignore',
    },
    {
      text: '▶️',
      callback_data: `${prefix}_next_month:${format(date, 'yyyy-MM-dd')}`,
    },
  ]);

  // Дни недели
  keyboard.push([
    { text: 'Пн', callback_data: 'ignore' },
    { text: 'Вт', callback_data: 'ignore' },
    { text: 'Ср', callback_data: 'ignore' },
    { text: 'Чт', callback_data: 'ignore' },
    { text: 'Пт', callback_data: 'ignore' },
    { text: 'Сб', callback_data: 'ignore' },
    { text: 'Вс', callback_data: 'ignore' },
  ]);

  // Дни месяца
  let week: InlineKeyboardButton[] = [];
  const firstDayOfWeek = getDay(monthStart);
  const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  // Пустые ячейки до первого дня
  for (let i = 0; i < offset; i++) {
    week.push({ text: ' ', callback_data: 'ignore' });
  }

  days.forEach((day) => {
    const dayOfWeek = getDay(day);
    
    week.push({
      text: format(day, 'd'),
      callback_data: `${prefix}_select_date:${format(day, 'yyyy-MM-dd')}`,
    });

    // Если воскресенье или последний день месяца
    if (dayOfWeek === 0 || day.getTime() === monthEnd.getTime()) {
      // Дополняем неделю пустыми ячейками
      while (week.length < 7) {
        week.push({ text: ' ', callback_data: 'ignore' });
      }
      keyboard.push(week);
      week = [];
    }
  });

  // Кнопка отмены
  keyboard.push([{ text: '🔙 Отмена', callback_data: `${prefix}_cancel` }]);

  return keyboard;
}

export function generateWeekDaysKeyboard(
  selectedDays: string[] = [],
  prefix: string
): InlineKeyboardButton[][] {
  const weekDays = [
    { short: 'Пн', full: 'Monday' },
    { short: 'Вт', full: 'Tuesday' },
    { short: 'Ср', full: 'Wednesday' },
    { short: 'Чт', full: 'Thursday' },
    { short: 'Пт', full: 'Friday' },
    { short: 'Сб', full: 'Saturday' },
    { short: 'Вс', full: 'Sunday' },
  ];

  const keyboard: InlineKeyboardButton[][] = [];

  // По 2 дня в ряд
  for (let i = 0; i < weekDays.length; i += 2) {
    const row: InlineKeyboardButton[] = [];
    
    for (let j = 0; j < 2 && i + j < weekDays.length; j++) {
      const day = weekDays[i + j];
      const isSelected = selectedDays.includes(day.full);
      
      row.push({
        text: isSelected ? `✅ ${day.short}` : day.short,
        callback_data: `${prefix}_toggle_day:${day.full}`,
      });
    }
    
    keyboard.push(row);
  }

  // Кнопка подтверждения
  keyboard.push([
    { text: '✅ Готово', callback_data: `${prefix}_confirm_days` },
    { text: '🔙 Отмена', callback_data: `${prefix}_cancel` },
  ]);

  return keyboard;
}
