
```
User: /add
Bot: "Введите название лекарства:"
User: "Витамин D3"
Bot: [Кнопки: Сегодня | Завтра]
User: Нажимает "Сегодня"
Bot: [Кнопки: Бессрочно | 7 дней | 14 дней | 30 дней]
User: Нажимает "Бессрочно"
Bot: [Кнопки: Каждый день | По дням недели | Через N дней]
User: Нажимает "Каждый день"
Bot: "Введите время (ЧЧ:ММ):"
User: "09:00"
Bot: "Введите дозировку:"
User: "1 капсула"
Bot: "Особые указания?" [Кнопки: До еды | После еды | Независимо]
User: "Независимо"
Bot: "📋 Проверьте данные: ..." [✅ Сохранить | ✏️ Редактировать | ❌ Отменить]
User: ✅ Сохранить
Bot: "✅ Лекарство успешно добавлено!"

Результат: Каждый день в 9:00 пользователь получает уведомление
```

### US-2: Антибиотик курсом

```
User: /add → "Амоксициллин"
User: Выбирает: Сегодня → 7 дней → Каждый день
User: Время 1: "08:00" → Дозировка: "500 мг"
Bot: "Добавить ещё время?" [Да | Нет]
User: Да
User: Время 2: "14:00" → Дозировка: "500 мг"
User: Да
User: Время 3: "20:00" → Дозировка: "500 мг"
User: Нет → Особенности: "После еды"
User: ✅ Сохранить

Результат: 3 уведомления в день, автоматическая остановка через 7 дней
```

### US-3: Пропуск и статистика

```
09:00 - Bot отправляет уведомление
[Пользователь не нажимает кнопку]
10:00 - Система меняет статус на MISSED
10:01 - Bot: "⚠️ Вы пропустили приём лекарства"

Через неделю:
User: /stats
Bot: 
📊 Статистика за 7 дней
💊 Витамин D3: 6/7 (85.7%)
💊 Амоксициллин: 19/21 (90.5%)
Общий показатель: 89.3% 🎯
```

---

## Форматирование сообщений

### Утилиты форматирования

```typescript
// utils/format.utils.ts

export function formatMedicationList(medications: Medication[]): string {
  if (medications.length === 0) {
    return '📭 У вас пока нет активных лекарств.\n\nИспользуйте /add чтобы добавить.';
  }
  
  let message = '💊 *Ваши лекарства:*\n\n';
  
  medications.forEach((med, index) => {
    message += `${index + 1}. *${med.name}*\n`;
    message += `   📅 ${formatDateRange(med.startDate, med.endDate)}\n`;
    message += `   🕐 ${formatSchedules(med.schedules)}\n`;
    if (med.notes) {
      message += `   📝 ${med.notes}\n`;
    }
    message += '\n';
  });
  
  return message;
}

export function formatDateRange(start: Date, end: Date | null): string {
  const startStr = format(start, 'dd.MM.yyyy');
  
  if (!end) {
    return `с ${startStr} (бессрочно)`;
  }
  
  const endStr = format(end, 'dd.MM.yyyy');
  return `${startStr} - ${endStr}`;
}

export function formatSchedules(schedules: Schedule[]): string {
  return schedules.map(s => `${s.time} (${s.dosage})`).join(', ');
}

export function formatStats(stats: ComplianceStats): string {
  const { totalScheduled, totalTaken, totalMissed, totalSkipped } = stats;
  const rate = ((totalTaken / (totalScheduled - totalSkipped)) * 100).toFixed(1);
  
  return (
    `📊 *Статистика за ${stats.periodDays} дней*\n\n` +
    `✅ Принято: ${totalTaken} из ${totalScheduled}\n` +
    `❌ Пропущено: ${totalMissed}\n` +
    `⏭ Пропущено преднамеренно: ${totalSkipped}\n\n` +
    `*Показатель соблюдения: ${rate}%* ${getComplianceEmoji(parseFloat(rate))}`
  );
}

function getComplianceEmoji(rate: number): string {
  if (rate >= 95) return '🏆';
  if (rate >= 85) return '🎯';
  if (rate >= 70) return '👍';
  if (rate >= 50) return '⚠️';
  return '❌';
}
```

---

## Локализация (i18n)

### Структура переводов

```typescript
// locales/ru.json
{
  "commands": {
    "start": {
      "welcome": "👋 Добро пожаловать в Med Reminder Bot!",
      "already_registered": "✅ Вы уже зарегистрированы!"
    },
    "add": {
      "enter_name": "Введите название лекарства:",
      "enter_time": "Введите время в формате ЧЧ:ММ:",
      "success": "✅ Лекарство успешно добавлено!"
    },
    "list": {
      "empty": "📭 У вас пока нет активных лекарств.",
      "header": "💊 Ваши лекарства:"
    }
  },
  "notifications": {
    "reminder": "💊 Время принять лекарство!\n\n📋 {{name}}\n💉 Дозировка: {{dosage}}",
    "taken": "✅ Отлично! Приём зафиксирован.",
    "missed": "⚠️ Вы пропустили приём лекарства."
  },
  "buttons": {
    "taken": "✅ Принял",
    "snooze": "⏰ +15 мин",
    "skip": "❌ Пропустить",
    "save": "✅ Сохранить",
    "cancel": "❌ Отменить"
  }
}
```

### Использование

```typescript
import i18n from '../utils/i18n';

bot.command('start', async (ctx) => {
  const user = ctx.state.user;
  const lang = user?.language || 'ru';
  
  await ctx.reply(
    i18n.t('commands.start.welcome', { lng: lang })
  );
});
```

---

## Тестирование бота

### Unit тесты команд

```typescript
// bot/commands/start.test.ts
describe('Start Command', () => {
  let bot: Telegraf;
  let mockUserService: jest.Mocked<UserService>;
  
  beforeEach(() => {
    mockUserService = {
      getUserByTelegramId: jest.fn(),
      createUser: jest.fn()
    } as any;
    
    bot = createTestBot({ userService: mockUserService });
  });
  
  it('should register new user', async () => {
    mockUserService.getUserByTelegramId.mockResolvedValue(null);
    mockUserService.createUser.mockResolvedValue({ id: 1 } as any);
    
    const message = createMockMessage('/start', { id: 123 });
    await bot.handleUpdate({ message } as any);
    
    expect(mockUserService.createUser).toHaveBeenCalledWith(
      123,
      expect.objectContaining({ firstName: expect.any(String) })
    );
  });
  
  it('should not register existing user', async () => {
    mockUserService.getUserByTelegramId.mockResolvedValue({ id: 1 } as any);
    
    const message = createMockMessage('/start', { id: 123 });
    await bot.handleUpdate({ message } as any);
    
    expect(mockUserService.createUser).not.toHaveBeenCalled();
  });
});
```

### Integration тесты FSM

```typescript
// bot/scenes/addMedication.test.ts
describe('Add Medication Scene', () => {
  it('should complete full flow', async () => {
    const bot = createTestBot();
    const userId = 123;
    
    // Шаг 1: Вход в сценарий
    await bot.sendCommand('/add', userId);
    expect(bot.lastMessage).toContain('Введите название');
    
    // Шаг 2: Название
    await bot.sendMessage('Аспирин', userId);
    expect(bot.lastMessage).toContain('Добавить описание');
    
    // Шаг 3: Пропуск описания
    await bot.sendMessage('/skip', userId);
    expect(bot.lastMessage).toContain('Когда начинаете');
    
    // Шаг 4: Выбор даты
    await bot.clickButton('start_today', userId);
    expect(bot.lastMessage).toContain('Как долго');
    
    // ... продолжение теста
    
    // Финальный шаг: Подтверждение
    await bot.clickButton('confirm_save', userId);
    expect(bot.lastMessage).toContain('успешно добавлено');
    
    // Проверка БД
    const medications = await prisma.medication.findMany({
      where: { userId }
    });
    expect(medications).toHaveLength(1);
    expect(medications[0].name).toBe('Аспирин');
  });
});
```

---

## Обработка ошибок

### Типы ошибок

```typescript
// utils/errors.ts

export class BotError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'BotError';
  }
}

export class ValidationError extends BotError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class NotFoundError extends BotError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}

export class RateLimitError extends BotError {
  constructor() {
    super('Too many requests', 'RATE_LIMIT', 429);
  }
}
```

### Централизованный обработчик

```typescript
bot.catch(async (err, ctx) => {
  logger.error({
    error: err,
    userId: ctx.from?.id,
    update: ctx.update
  }, 'Bot error');
  
  if (err instanceof ValidationError) {
    return ctx.reply(`❌ ${err.message}`);
  }
  
  if (err instanceof NotFoundError) {
    return ctx.reply('❌ Запрашиваемый ресурс не найден.');
  }
  
  if (err instanceof RateLimitError) {
    return ctx.reply('⚠️ Слишком много запросов. Подождите минуту.');
  }
  
  // Неизвестная ошибка
  await ctx.reply(
    '❌ Произошла ошибка. Попробуйте позже или обратитесь в поддержку.\n\n' +
    'ID ошибки: ' + generateErrorId()
  );
  
  // Уведомить админов
  if (process.env.ADMIN_CHAT_ID) {
    await bot.telegram.sendMessage(
      process.env.ADMIN_CHAT_ID,
      `⚠️ Ошибка у пользователя ${ctx.from?.id}\n\n${err.message}`
    );
  }
});
```

---

## Лучшие практики

### 1. Всегда используйте answerCbQuery

```typescript
// ❌ Плохо
bot.action('some_action', async (ctx) => {
  // Забыли ответить на callback
  await ctx.reply('Done');
});

// ✅ Хорошо
bot.action('some_action', async (ctx) => {
  await ctx.reply('Done');
  await ctx.answerCbQuery(); // Убирает "часики" загрузки
});
```

### 2. Обрабатывайте команду /cancel

```typescript
bot.command('cancel', async (ctx) => {
  if (ctx.scene) {
    await ctx.scene.leave();
    await ctx.reply('❌ Операция отменена.');
  } else {
    await ctx.reply('Нет активных операций.');
  }
});
```

### 3. Валидируйте пользовательский ввод

```typescript
// Валидация времени
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
if (!timeRegex.test(userInput)) {
  return ctx.reply('❌ Неверный формат времени. Используйте ЧЧ:ММ (09:00)');
}

// Валидация даты
const date = parse(userInput, 'dd.MM.yyyy', new Date());
if (!isValid(date)) {
  return ctx.reply('❌ Неверный формат даты. Используйте ДД.ММ.ГГГГ (15.10.2025)');
}
```

### 4. Используйте inline-кнопки для выбора

```typescript
// Лучше использовать кнопки вместо текстового ввода
await ctx.reply('Выберите язык:', {
  reply_markup: {
    inline_keyboard: [
      [{ text: '🇷🇺 Русский', callback_data: 'lang_ru' }],
      [{ text: '🇬🇧 English', callback_data: 'lang_en' }],
      [{ text: '🇺🇦 Українська', callback_data: 'lang_uk' }]
    ]
  }
});
```

### 5. Логируйте важные события

```typescript
bot.command('add', async (ctx) => {
  logger.info({ userId: ctx.from.id }, 'User started adding medication');
  await ctx.scene.enter('add-medication');
});

bot.action(/taken_(\d+)/, async (ctx) => {
  logger.info({ 
    userId: ctx.from.id, 
    logId: ctx.match[1] 
  }, 'User confirmed medication intake');
  
  // ... обработка
});
```

---

## Webhook vs Polling

### Polling (для разработки)

```typescript
// index.ts
if (process.env.NODE_ENV === 'development') {
  bot.launch({
    dropPendingUpdates: true
  });
  
  logger.info('Bot started in polling mode');
}
```

### Webhook (для production)

```typescript
// server.ts
import Fastify from 'fastify';

const app = Fastify();

app.post('/webhook/telegram', async (req, reply) => {
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  
  if (secret !== process.env.WEBHOOK_SECRET) {
    return reply.status(403).send('Forbidden');
  }
  
  await bot.handleUpdate(req.body);
  return reply.status(200).send('OK');
});

// Установка webhook
await bot.telegram.setWebhook(
  `${process.env.TELEGRAM_WEBHOOK_DOMAIN}/webhook/telegram`,
  {
    secret_token: process.env.WEBHOOK_SECRET
  }
);

app.listen({ port: 3000, host: '0.0.0.0' });
```

---

## Заключение

Бот Med Reminder использует современные практики разработки Telegram ботов:
- ✅ FSM для сложных сценариев
- ✅ Middleware для переиспользуемой логики
- ✅ Callback handlers для интерактивности
- ✅ Локализация для мультиязычности
- ✅ Валидация и обработка ошибок

Эта архитектура обеспечивает отличный UX и легко расширяется при добавлении новых функций.

---

**Версия документа**: 2.0  
**Последнее обновление**: 15 октября 2025
