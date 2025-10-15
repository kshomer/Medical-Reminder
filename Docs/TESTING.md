: new Date('2025-10-01'),
          frequency: 'WEEKLY',
          frequencyData: { days: [1, 3, 5] } // Пн, Ср, Пт
        }
      });
      
      // Понедельник (день 1)
      const monday = new Date('2025-10-13');
      expect(await service.checkFrequency(medication.id, monday)).toBe(true);
      
      // Вторник (день 2)
      const tuesday = new Date('2025-10-14');
      expect(await service.checkFrequency(medication.id, tuesday)).toBe(false);
    });
  });
});
```

### Тестирование утилит

```typescript
// utils/date.utils.test.ts
import { formatDateRange, isWithinPeriod } from './date.utils';

describe('Date Utils', () => {
  describe('formatDateRange', () => {
    it('should format date range', () => {
      const start = new Date('2025-10-01');
      const end = new Date('2025-10-07');
      
      expect(formatDateRange(start, end)).toBe('01.10.2025 - 07.10.2025');
    });
    
    it('should handle endless period', () => {
      const start = new Date('2025-10-01');
      
      expect(formatDateRange(start, null)).toBe('с 01.10.2025 (бессрочно)');
    });
  });
});
```

---

## Integration Tests

### Тестирование Bot Commands

```typescript
// bot/commands/add.test.ts
import { createTestBot } from '../test-utils';

describe('Add Medication Flow', () => {
  let bot: TestBot;
  let userId: number;
  
  beforeEach(async () => {
    bot = await createTestBot();
    userId = 123456789;
    
    // Создать тестового пользователя
    await bot.createTestUser(userId);
  });
  
  afterEach(async () => {
    await bot.cleanup();
  });
  
  it('should complete full add medication flow', async () => {
    // Шаг 1: Команда /add
    await bot.sendCommand('/add', userId);
    expect(bot.lastMessage).toContain('Введите название');
    
    // Шаг 2: Название
    await bot.sendMessage('Аспирин', userId);
    expect(bot.lastMessage).toContain('Добавить описание');
    
    // Шаг 3: Пропуск описания
    await bot.sendMessage('/skip', userId);
    expect(bot.lastMessage).toContain('Когда начинаете');
    
    // Шаг 4: Сегодня
    await bot.clickButton('start_today', userId);
    expect(bot.lastMessage).toContain('Как долго');
    
    // Шаг 5: Бессрочно
    await bot.clickButton('duration_endless', userId);
    expect(bot.lastMessage).toContain('Как часто');
    
    // Шаг 6: Каждый день
    await bot.clickButton('freq_daily', userId);
    expect(bot.lastMessage).toContain('Введите время');
    
    // Шаг 7: Время
    await bot.sendMessage('09:00', userId);
    expect(bot.lastMessage).toContain('Введите дозировку');
    
    // Шаг 8: Дозировка
    await bot.sendMessage('1 таблетка', userId);
    expect(bot.lastMessage).toContain('Особые указания');
    
    // Шаг 9: Особенности
    await bot.clickButton('notes_none', userId);
    expect(bot.lastMessage).toContain('Проверьте данные');
    
    // Шаг 10: Сохранение
    await bot.clickButton('confirm_save', userId);
    expect(bot.lastMessage).toContain('успешно добавлено');
    
    // Проверка БД
    const medications = await prisma.medication.findMany({
      where: { userId },
      include: { schedules: true }
    });
    
    expect(medications).toHaveLength(1);
    expect(medications[0].name).toBe('Аспирин');
    expect(medications[0].schedules).toHaveLength(1);
    expect(medications[0].schedules[0].time).toBe('09:00');
  });
  
  it('should validate time format', async () => {
    await bot.sendCommand('/add', userId);
    await bot.sendMessage('Аспирин', userId);
    await bot.sendMessage('/skip', userId);
    await bot.clickButton('start_today', userId);
    await bot.clickButton('duration_endless', userId);
    await bot.clickButton('freq_daily', userId);
    
    // Неверный формат времени
    await bot.sendMessage('9:00', userId);
    expect(bot.lastMessage).toContain('Неверный формат');
    
    // Правильный формат
    await bot.sendMessage('09:00', userId);
    expect(bot.lastMessage).toContain('Введите дозировку');
  });
});
```

### Тестирование Queue Jobs

```typescript
// queues/reminder.queue.test.ts
import { reminderQueue } from './reminder.queue';

describe('Reminder Queue', () => {
  beforeEach(async () => {
    await reminderQueue.empty();
  });
  
  it('should send reminder notification', async () => {
    const jobData = {
      userId: 123,
      medicationId: 456,
      scheduleId: 789,
      scheduledTime: '09:00'
    };
    
    await reminderQueue.add('send-reminder', jobData);
    
    // Ждём обработки
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Проверяем лог
    const log = await prisma.intakeLog.findFirst({
      where: {
        userId: 123,
        medicationId: 456,
        scheduleId: 789,
        status: 'SENT'
      }
    });
    
    expect(log).toBeDefined();
    expect(log.scheduledTime).toBe('09:00');
  });
  
  it('should not send duplicate notification', async () => {
    // Создать существующий лог
    await prisma.intakeLog.create({
      data: {
        userId: 123,
        medicationId: 456,
        scheduleId: 789,
        scheduledDate: new Date(),
        scheduledTime: '09:00',
        sentAt: new Date(),
        status: 'SENT'
      }
    });
    
    const jobData = {
      userId: 123,
      medicationId: 456,
      scheduleId: 789,
      scheduledTime: '09:00'
    };
    
    await reminderQueue.add('send-reminder', jobData);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Проверить, что нет дубликатов
    const logs = await prisma.intakeLog.findMany({
      where: {
        scheduleId: 789,
        scheduledDate: new Date()
      }
    });
    
    expect(logs).toHaveLength(1);
  });
});
```

---

## E2E Tests

### Полный пользовательский сценарий

```typescript
// e2e/user-journey.test.ts
describe('Full User Journey', () => {
  let bot: TestBot;
  let userId: number;
  
  beforeAll(async () => {
    bot = await createTestBot();
    userId = 987654321;
  });
  
  afterAll(async () => {
    await bot.cleanup();
  });
  
  it('should complete full medication lifecycle', async () => {
    // 1. Регистрация
    await bot.sendCommand('/start', userId);
    expect(bot.lastMessage).toContain('Добро пожаловать');
    
    // 2. Добавление лекарства
    await bot.sendCommand('/add', userId);
    // ... полный flow добавления
    
    // 3. Просмотр списка
    await bot.sendCommand('/list', userId);
    expect(bot.lastMessage).toContain('Ваши лекарства');
    expect(bot.lastMessage).toContain('Аспирин');
    
    // 4. Получение уведомления (эмуляция времени)
    await bot.triggerScheduledJob('09:00');
    
    const notifications = await bot.getNotifications(userId);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toContain('Время принять лекарство');
    
    // 5. Подтверждение приёма
    await bot.clickButton('taken_1', userId);
    expect(bot.lastMessage).toContain('Отлично');
    
    // 6. Проверка статистики
    await bot.sendCommand('/stats', userId);
    expect(bot.lastMessage).toContain('Принято: 1 из 1');
    expect(bot.lastMessage).toContain('100%');
    
    // 7. Удаление лекарства
    await bot.sendCommand('/delete', userId);
    await bot.clickButton('delete_med_1', userId);
    await bot.clickButton('confirm_delete', userId);
    expect(bot.lastMessage).toContain('удалено');
    
    // 8. Проверка пустого списка
    await bot.sendCommand('/list', userId);
    expect(bot.lastMessage).toContain('нет активных лекарств');
  });
});
```

---

## Test Utilities

### Mock Bot

```typescript
// test-utils/createTestBot.ts
export class TestBot {
  private messages: Map<number, string[]> = new Map();
  private bot: Telegraf;
  
  constructor(bot: Telegraf) {
    this.bot = bot;
  }
  
  async sendCommand(command: string, userId: number) {
    const update = {
      message: {
        from: { id: userId },
        text: command,
        chat: { id: userId }
      }
    };
    
    await this.bot.handleUpdate(update);
  }
  
  async sendMessage(text: string, userId: number) {
    const update = {
      message: {
        from: { id: userId },
        text,
        chat: { id: userId }
      }
    };
    
    await this.bot.handleUpdate(update);
  }
  
  async clickButton(callbackData: string, userId: number) {
    const update = {
      callback_query: {
        from: { id: userId },
        data: callbackData,
        message: { chat: { id: userId } }
      }
    };
    
    await this.bot.handleUpdate(update);
  }
  
  get lastMessage(): string {
    // Возвращает последнее отправленное сообщение
    // Реализация зависит от mock Telegram API
  }
  
  async cleanup() {
    await prisma.$disconnect();
    await redis.quit();
  }
}
```

### Database Seeding

```typescript
// test-utils/seed.ts
export async function seedTestData() {
  const user = await prisma.user.create({
    data: {
      telegramId: 123456789,
      firstName: 'Test User',
      timezone: 'Europe/Moscow'
    }
  });
  
  const medication = await prisma.medication.create({
    data: {
      userId: user.id,
      name: 'Test Medication',
      startDate: new Date(),
      frequency: 'DAILY'
    }
  });
  
  const schedule = await prisma.schedule.create({
    data: {
      medicationId: medication.id,
      time: '09:00',
      dosage: '1 таблетка'
    }
  });
  
  return { user, medication, schedule };
}
```

---

## Coverage

### Настройка Jest

```json
// package.json
{
  "jest": {
    "coverageThreshold": {
      "global": {
        "branches": 80,
        "functions": 80,
        "lines": 80,
        "statements": 80
      }
    },
    "collectCoverageFrom": [
      "src/**/*.ts",
      "!src/**/*.test.ts",
      "!src/**/*.spec.ts"
    ]
  }
}
```

### Запуск тестов

```bash
# Все тесты
npm test

# С coverage
npm run test:coverage

# Только unit
npm run test:unit

# Только integration
npm run test:integration

# E2E
npm run test:e2e

# Watch mode
npm run test:watch
```

---

## CI Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
      
      - name: Run tests
        run: npm run test:coverage
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
          REDIS_HOST: localhost
      
      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

---

**Версия документа**: 2.0  
**Последнее обновление**: 15 октября 2025


---

## Mock Utilities

### Creating Test Bot

```typescript
// test-utils/TestBot.ts
export class TestBot {
  private bot: Telegraf;
  private messages: Message[] = [];
  private updateId = 1;
  
  constructor() {
    this.bot = new Telegraf(process.env.TEST_BOT_TOKEN);
    this.mockTelegramAPI();
  }
  
  private mockTelegramAPI() {
    // Mock sendMessage
    this.bot.telegram.sendMessage = jest.fn(async (chatId, text, extra) => {
      const message = {
        message_id: this.updateId++,
        chat: { id: chatId },
        text,
        ...extra
      };
      this.messages.push(message);
      return message;
    });
    
    // Mock editMessageReplyMarkup
    this.bot.telegram.editMessageReplyMarkup = jest.fn();
    
    // Mock answerCbQuery
    this.bot.telegram.answerCbQuery = jest.fn();
  }
  
  async sendCommand(command: string, userId: number) {
    await this.bot.handleUpdate({
      update_id: this.updateId++,
      message: {
        message_id: this.updateId,
        from: { id: userId, is_bot: false, first_name: 'Test' },
        chat: { id: userId, type: 'private' },
        date: Date.now(),
        text: command
      }
    });
  }
  
  async sendMessage(text: string, userId: number) {
    await this.sendCommand(text, userId);
  }
  
  async clickButton(callbackData: string, userId: number) {
    await this.bot.handleUpdate({
      update_id: this.updateId++,
      callback_query: {
        id: String(this.updateId),
        from: { id: userId, is_bot: false, first_name: 'Test' },
        message: {
          message_id: this.messages[this.messages.length - 1]?.message_id,
          chat: { id: userId, type: 'private' },
          date: Date.now()
        },
        data: callbackData
      }
    });
  }
  
  get lastMessage(): string {
    return this.messages[this.messages.length - 1]?.text || '';
  }
  
  getMessages(userId: number): Message[] {
    return this.messages.filter(m => m.chat.id === userId);
  }
  
  clearMessages() {
    this.messages = [];
  }
}
```

---

## Performance Tests

### Load Testing with Artillery

**artillery.yml:**
```yaml
config:
  target: "https://yourdomain.com"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Sustained load"
    - duration: 60
      arrivalRate: 100
      name: "Peak load"
  
scenarios:
  - name: "API Health Check"
    flow:
      - get:
          url: "/health"
          
  - name: "Get Medications"
    flow:
      - post:
          url: "/api/auth/telegram"
          json:
            initData: "{{ $randomString() }}"
          capture:
            - json: "$.token"
              as: "token"
      - get:
          url: "/api/medications"
          headers:
            Authorization: "Bearer {{ token }}"
```

**Run:**
```bash
npm install -g artillery
artillery run artillery.yml
```

---

## Snapshot Testing

```typescript
// bot/commands/__snapshots__/start.test.ts.snap
exports[`start command should send welcome message 1`] = `
"👋 Добро пожаловать в Med Reminder Bot!

Я помогу вам не забывать о приёме лекарств.

Используйте /add чтобы добавить первое лекарство."
`;
```

---

**Версия документа**: 2.0  
**Последнее обновление**: 15 октября 2025


---

## Advanced Mock Utilities

### Complete TestBot Implementation

```typescript
// test-utils/TestBot.ts
import { Telegraf, Context } from 'telegraf';
import { Message, CallbackQuery } from 'telegraf/types';

interface MockMessage extends Partial<Message.TextMessage> {
  message_id: number;
  chat: { id: number; type: string };
  from: { id: number; is_bot: boolean; first_name: string };
  date: number;
  text: string;
}

export class TestBot {
  private bot: Telegraf;
  private messages: MockMessage[] = [];
  private updateId = 1;
  private scenes: Map<number, string> = new Map();
  private sessionData: Map<number, any> = new Map();
  
  constructor(bot: Telegraf) {
    this.bot = bot;
    this.mockTelegramAPI();
  }
  
  private mockTelegramAPI() {
    const originalSendMessage = this.bot.telegram.sendMessage;
    
    // Mock sendMessage
    this.bot.telegram.sendMessage = jest.fn(async (chatId: number, text: string, extra?: any) => {
      const message: MockMessage = {
        message_id: this.updateId++,
        chat: { id: chatId, type: 'private' },
        from: { id: chatId, is_bot: false, first_name: 'Test User' },
        date: Math.floor(Date.now() / 1000),
        text: text.toString(),
        reply_markup: extra?.reply_markup
      };
      
      this.messages.push(message);
      return message as any;
    });
    
    // Mock editMessageText
    this.bot.telegram.editMessageText = jest.fn(async (chatId, messageId, inlineMessageId, text, extra) => {
      const message = this.messages.find(m => m.message_id === messageId && m.chat.id === chatId);
      if (message) {
        message.text = text.toString();
      }
      return true;
    });
    
    // Mock editMessageReplyMarkup
    this.bot.telegram.editMessageReplyMarkup = jest.fn(async (chatId, messageId, inlineMessageId, markup) => {
      const message = this.messages.find(m => m.message_id === messageId);
      if (message) {
        message.reply_markup = markup;
      }
      return true;
    });
    
    // Mock answerCbQuery
    this.bot.telegram.answerCbQuery = jest.fn(async (callbackQueryId, text, showAlert) => {
      return true;
    });
    
    // Mock deleteMessage
    this.bot.telegram.deleteMessage = jest.fn(async (chatId, messageId) => {
      const index = this.messages.findIndex(m => m.message_id === messageId);
      if (index !== -1) {
        this.messages.splice(index, 1);
      }
      return true;
    });
  }
  
  async sendCommand(command: string, userId: number = 123456789) {
    await this.bot.handleUpdate({
      update_id: this.updateId++,
      message: {
        message_id: this.updateId,
        from: { id: userId, is_bot: false, first_name: 'Test', username: 'test_user' },
        chat: { id: userId, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: command
      }
    } as any);
  }
  
  async sendMessage(text: string, userId: number = 123456789) {
    await this.sendCommand(text, userId);
  }
  
  async clickButton(callbackData: string, userId: number = 123456789, messageId?: number) {
    const targetMessage = messageId 
      ? this.messages.find(m => m.message_id === messageId)
      : this.messages[this.messages.length - 1];
    
    await this.bot.handleUpdate({
      update_id: this.updateId++,
      callback_query: {
        id: String(this.updateId),
        from: { id: userId, is_bot: false, first_name: 'Test', username: 'test_user' },
        message: targetMessage,
        chat_instance: String(userId),
        data: callbackData
      }
    } as any);
  }
  
  get lastMessage(): string {
    return this.messages[this.messages.length - 1]?.text || '';
  }
  
  getLastMessage(userId: number): MockMessage | undefined {
    return this.messages.filter(m => m.chat.id === userId).pop();
  }
  
  getMessages(userId: number): MockMessage[] {
    return this.messages.filter(m => m.chat.id === userId);
  }
  
  getAllMessages(): MockMessage[] {
    return [...this.messages];
  }
  
  getLastButtons(): string[] {
    const lastMsg = this.messages[this.messages.length - 1];
    if (!lastMsg?.reply_markup?.inline_keyboard) return [];
    
    return lastMsg.reply_markup.inline_keyboard
      .flat()
      .map(btn => btn.text);
  }
  
  getLastCallbackData(): string[] {
    const lastMsg = this.messages[this.messages.length - 1];
    if (!lastMsg?.reply_markup?.inline_keyboard) return [];
    
    return lastMsg.reply_markup.inline_keyboard
      .flat()
      .map(btn => btn.callback_data)
      .filter(Boolean) as string[];
  }
  
  clearMessages() {
    this.messages = [];
  }
  
  async waitForMessage(timeout: number = 1000): Promise<MockMessage> {
    const initialCount = this.messages.length;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (this.messages.length > initialCount) {
        return this.messages[this.messages.length - 1];
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    throw new Error('Timeout waiting for message');
  }
  
  // Helper для проверки, что бот отправил определённое сообщение
  expectMessageContains(text: string, userId?: number) {
    const messages = userId ? this.getMessages(userId) : this.messages;
    const found = messages.some(m => m.text.includes(text));
    expect(found).toBe(true);
  }
  
  // Helper для проверки кнопок
  expectButtons(expectedButtons: string[]) {
    const buttons = this.getLastButtons();
    expect(buttons).toEqual(expectedButtons);
  }
}

// Factory функция для создания TestBot
export function createTestBot(): TestBot {
  const bot = new Telegraf(process.env.TEST_BOT_TOKEN || 'test-token');
  return new TestBot(bot);
}
```

### Database Test Helpers

```typescript
// test-utils/database.ts
import { PrismaClient } from '@prisma/client';

export class DatabaseTestHelper {
  constructor(private prisma: PrismaClient) {}
  
  async createTestUser(telegramId: number = 123456789) {
    return await this.prisma.user.create({
      data: {
        telegramId,
        firstName: 'Test',
        lastName: 'User',
        username: 'test_user',
        language: 'ru',
        timezone: 'Europe/Moscow'
      }
    });
  }
  
  async createTestMedication(userId: number, overrides: any = {}) {
    return await this.prisma.medication.create({
      data: {
        userId,
        name: 'Test Medication',
        startDate: new Date(),
        frequency: 'DAILY',
        isActive: true,
        ...overrides
      }
    });
  }
  
  async createTestSchedule(medicationId: number, overrides: any = {}) {
    return await this.prisma.schedule.create({
      data: {
        medicationId,
        time: '09:00',
        dosage: '1 таблетка',
        reminderOffset: 15,
        maxReminders: 3,
        ...overrides
      }
    });
  }
  
  async createTestIntakeLog(
    userId: number,
    medicationId: number,
    scheduleId: number,
    overrides: any = {}
  ) {
    return await this.prisma.intakeLog.create({
      data: {
        userId,
        medicationId,
        scheduleId,
        scheduledDate: new Date(),
        scheduledTime: '09:00',
        sentAt: new Date(),
        status: 'SENT',
        ...overrides
      }
    });
  }
  
  async cleanupTestData() {
    // Удаляем в правильном порядке (из-за FK constraints)
    await this.prisma.intakeLog.deleteMany({});
    await this.prisma.schedule.deleteMany({});
    await this.prisma.medication.deleteMany({});
    await this.prisma.user.deleteMany({});
  }
  
  async getTestUser(telegramId: number = 123456789) {
    return await this.prisma.user.findUnique({
      where: { telegramId }
    });
  }
}
```

### Queue Test Helpers

```typescript
// test-utils/queue.ts
import Queue from 'bull';

export class QueueTestHelper {
  constructor(private queue: Queue.Queue) {}
  
  async clearQueue() {
    await this.queue.empty();
    await this.queue.clean(0, 'completed');
    await this.queue.clean(0, 'failed');
    await this.queue.clean(0, 'delayed');
  }
  
  async waitForJob(jobId: string, timeout: number = 5000): Promise<Queue.Job> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const job = await this.queue.getJob(jobId);
      if (job) return job;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Job ${jobId} not found within timeout`);
  }
  
  async waitForCompletion(jobId: string, timeout: number = 5000): Promise<any> {
    const job = await this.waitForJob(jobId, timeout);
    
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Job ${jobId} did not complete within timeout`));
      }, timeout);
      
      job.finished().then(result => {
        clearTimeout(timer);
        resolve(result);
      }).catch(error => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }
  
  async getJobCounts() {
    return await this.queue.getJobCounts();
  }
  
  async getFailedJobs() {
    return await this.queue.getFailed();
  }
  
  async retryAllFailed() {
    const failed = await this.queue.getFailed();
    for (const job of failed) {
      await job.retry();
    }
  }
}
```

---

## Complex E2E Test Scenarios

### Complete User Journey Test

```typescript
// e2e/complete-journey.test.ts
describe('Complete User Journey', () => {
  let testBot: TestBot;
  let dbHelper: DatabaseTestHelper;
  let queueHelper: QueueTestHelper;
  let userId: number;
  
  beforeAll(async () => {
    testBot = createTestBot();
    dbHelper = new DatabaseTestHelper(prisma);
    queueHelper = new QueueTestHelper(reminderQueue);
    userId = 987654321;
  });
  
  afterEach(async () => {
    await dbHelper.cleanupTestData();
    await queueHelper.clearQueue();
    testBot.clearMessages();
  });
  
  it('should complete full medication lifecycle', async () => {
    // 1. Registration
    await testBot.sendCommand('/start', userId);
    expect(testBot.lastMessage).toContain('Добро пожаловать');
    
    const user = await dbHelper.getTestUser(userId);
    expect(user).toBeDefined();
    expect(user.telegramId).toBe(userId);
    
    // 2. Add medication (full FSM flow)
    await testBot.sendCommand('/add', userId);
    expect(testBot.lastMessage).toContain('название лекарства');
    
    await testBot.sendMessage('Аспирин', userId);
    expect(testBot.lastMessage).toContain('описание');
    
    await testBot.sendMessage('/skip', userId);
    expect(testBot.lastMessage).toContain('Когда начинаете');
    testBot.expectButtons(['Сегодня', 'Завтра', 'Выбрать дату']);
    
    await testBot.clickButton('start_today', userId);
    expect(testBot.lastMessage).toContain('Как долго');
    
    await testBot.clickButton('duration_endless', userId);
    expect(testBot.lastMessage).toContain('Как часто');
    
    await testBot.clickButton('freq_daily', userId);
    expect(testBot.lastMessage).toContain('время');
    
    await testBot.sendMessage('09:00', userId);
    expect(testBot.lastMessage).toContain('дозировку');
    
    await testBot.sendMessage('1 таблетка', userId);
    expect(testBot.lastMessage).toContain('Особые указания');
    
    await testBot.clickButton('notes_none', userId);
    expect(testBot.lastMessage).toContain('Проверьте данные');
    expect(testBot.lastMessage).toContain('Аспирин');
    expect(testBot.lastMessage).toContain('09:00');
    expect(testBot.lastMessage).toContain('1 таблетка');
    
    await testBot.clickButton('confirm_save', userId);
    expect(testBot.lastMessage).toContain('успешно добавлено');
    
    // Verify database
    const medications = await prisma.medication.findMany({
      where: { userId: user.id },
      include: { schedules: true }
    });
    
    expect(medications).toHaveLength(1);
    expect(medications[0].name).toBe('Аспирин');
    expect(medications[0].schedules).toHaveLength(1);
    expect(medications[0].schedules[0].time).toBe('09:00');
    expect(medications[0].schedules[0].dosage).toBe('1 таблетка');
    
    // Verify queue job created
    const jobId = `reminder_${medications[0].schedules[0].id}`;
    const job = await queueHelper.waitForJob(jobId);
    expect(job).toBeDefined();
    expect(job.data.scheduleId).toBe(medications[0].schedules[0].id);
    
    // 3. List medications
    await testBot.sendCommand('/list', userId);
    expect(testBot.lastMessage).toContain('Ваши лекарства');
    expect(testBot.lastMessage).toContain('Аспирин');
    expect(testBot.lastMessage).toContain('09:00');
    
    // 4. Simulate notification (trigger job manually)
    await job.promote();
    await queueHelper.waitForCompletion(jobId);
    
    // Check notification was sent
    const notifications = testBot.getMessages(userId).slice(-1);
    expect(notifications[0].text).toContain('Время принять лекарство');
    expect(notifications[0].text).toContain('Аспирин');
    testBot.expectButtons(['✅ Принял', '⏰ +15 мин', '❌ Пропустить']);
    
    // Verify intake log created
    const logs = await prisma.intakeLog.findMany({
      where: { userId: user.id }
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('SENT');
    
    // 5. Confirm intake
    await testBot.clickButton(`taken_${logs[0].id}`, userId);
    
    // Verify status updated
    const updatedLog = await prisma.intakeLog.findUnique({
      where: { id: logs[0].id }
    });
    expect(updatedLog.status).toBe('TAKEN');
    expect(updatedLog.takenAt).toBeDefined();
    
    // 6. Check statistics
    await testBot.sendCommand('/stats', userId);
    expect(testBot.lastMessage).toContain('Статистика');
    expect(testBot.lastMessage).toContain('Принято: 1');
    expect(testBot.lastMessage).toContain('100');
    
    // 7. Check history
    await testBot.sendCommand('/history', userId);
    expect(testBot.lastMessage).toContain('История');
    expect(testBot.lastMessage).toContain('Аспирин');
    expect(testBot.lastMessage).toContain('TAKEN');
    
    // 8. Delete medication
    await testBot.sendCommand('/delete', userId);
    expect(testBot.lastMessage).toContain('Выберите лекарство');
    
    await testBot.clickButton(`delete_med_${medications[0].id}`, userId);
    expect(testBot.lastMessage).toContain('Вы уверены');
    
    await testBot.clickButton('confirm_delete', userId);
    expect(testBot.lastMessage).toContain('удалено');
    
    // Verify deleted from database
    const remainingMeds = await prisma.medication.findMany({
      where: { userId: user.id, isActive: true }
    });
    expect(remainingMeds).toHaveLength(0);
    
    // Verify job removed from queue
    const deletedJob = await reminderQueue.getJob(jobId);
    expect(deletedJob).toBeNull();
    
    // 9. Verify empty list
    await testBot.sendCommand('/list', userId);
    expect(testBot.lastMessage).toContain('нет активных лекарств');
  });
  
  it('should handle missed intake correctly', async () => {
    // Setup
    const user = await dbHelper.createTestUser(userId);
    const medication = await dbHelper.createTestMedication(user.id);
    const schedule = await dbHelper.createTestSchedule(medication.id);
    const log = await dbHelper.createTestIntakeLog(
      user.id,
      medication.id,
      schedule.id
    );
    
    // Simulate 1 hour passing without confirmation
    await new Promise(resolve => setTimeout(resolve, 100)); // Mock time in tests
    
    // Trigger missed check job
    await missedCheckQueue.add('check-missed', { logId: log.id });
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Verify status changed to MISSED
    const updatedLog = await prisma.intakeLog.findUnique({
      where: { id: log.id }
    });
    expect(updatedLog.status).toBe('MISSED');
    
    // Verify notification sent
    testBot.expectMessageContains('пропустили приём', userId);
  });
  
  it('should handle snooze correctly', async () => {
    // Setup
    const user = await dbHelper.createTestUser(userId);
    const medication = await dbHelper.createTestMedication(user.id);
    const schedule = await dbHelper.createTestSchedule(medication.id);
    const log = await dbHelper.createTestIntakeLog(
      user.id,
      medication.id,
      schedule.id,
      { snoozeCount: 0 }
    );
    
    // Send notification
    await testBot.bot.telegram.sendMessage(
      userId,
      'Тестовое уведомление',
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '⏰ +15 мин', callback_data: `snooze_${log.id}` }
          ]]
        }
      }
    );
    
    // Click snooze
    await testBot.clickButton(`snooze_${log.id}`, userId);
    
    // Verify snooze count incremented
    const updatedLog = await prisma.intakeLog.findUnique({
      where: { id: log.id }
    });
    expect(updatedLog.snoozeCount).toBe(1);
    
    // Verify snooze job created
    const counts = await queueHelper.getJobCounts();
    expect(counts.delayed).toBeGreaterThan(0);
    
    // Try to snooze 3 times (max)
    for (let i = 1; i < 4; i++) {
      await testBot.clickButton(`snooze_${log.id}`, userId);
    }
    
    // 4th attempt should be rejected
    await testBot.clickButton(`snooze_${log.id}`, userId);
    const finalLog = await prisma.intakeLog.findUnique({
      where: { id: log.id }
    });
    expect(finalLog.snoozeCount).toBe(3); // Max reached
  });
});
```

---

## Performance and Load Testing

### Load Test with Artillery

**tests/load/artillery.yml:**
```yaml
config:
  target: "http://localhost:3000"
  phases:
    # Warm up
    - duration: 30
      arrivalRate: 5
      name: "Warm up"
    
    # Gradual ramp
    - duration: 60
      arrivalRate: 5
      rampTo: 50
      name: "Ramp up"
    
    # Sustained load
    - duration: 120
      arrivalRate: 50
      name: "Sustained load"
    
    # Spike test
    - duration: 30
      arrivalRate: 100
      name: "Spike"
    
    # Cool down
    - duration: 30
      arrivalRate: 10
      name: "Cool down"
  
  processor: "./load-test-processor.js"
  
  variables:
    users:
      - 123456789
      - 987654321
      - 111222333
  
  defaults:
    headers:
      Content-Type: "application/json"

scenarios:
  - name: "Health Check"
    weight: 10
    flow:
      - get:
          url: "/health"
          expect:
            - statusCode: 200
            - contentType: json
            - hasProperty: status
  
  - name: "Telegram Webhook - New Message"
    weight: 40
    flow:
      - post:
          url: "/webhook/telegram"
          json:
            update_id: "{{ $randomNumber(1, 1000000) }}"
            message:
              message_id: "{{ $randomNumber(1, 1000000) }}"
              from:
                id: "{{ users[$randomNumber(0, 2)] }}"
                is_bot: false
                first_name: "Test"
              chat:
                id: "{{ users[$randomNumber(0, 2)] }}"
                type: "private"
              date: "{{ $timestamp }}"
              text: "/list"
          expect:
            - statusCode: 200
  
  - name: "Telegram Webhook - Callback Query"
    weight: 30
    flow:
      - post:
          url: "/webhook/telegram"
          json:
            update_id: "{{ $randomNumber(1, 1000000) }}"
            callback_query:
              id: "{{ $randomString() }}"
              from:
                id: "{{ users[$randomNumber(0, 2)] }}"
                is_bot: false
              data: "taken_{{ $randomNumber(1, 1000) }}"
          expect:
            - statusCode: 200
  
  - name: "API - Get Medications"
    weight: 20
    flow:
      - post:
          url: "/api/auth/telegram"
          json:
            initData: "query_id=test&user=%7B%22id%22%3A{{ users[$randomNumber(0, 2)] }}%7D"
          capture:
            - json: "$.token"
              as: "token"
      - get:
          url: "/api/medications"
          headers:
            Authorization: "Bearer {{ token }}"
          expect:
            - statusCode: 200
            - contentType: json
```

**tests/load/load-test-processor.js:**
```javascript
module.exports = {
  setupUser: function(context, events, done) {
    context.vars.userId = Math.floor(Math.random() * 1000000);
    return done();
  },
  
  logResponse: function(requestParams, response, context, ee, next) {
    if (response.statusCode !== 200) {
      console.log(`Error: ${response.statusCode} - ${response.body}`);
    }
    return next();
  }
};
```

**Run load tests:**
```bash
# Install Artillery
npm install -g artillery

# Run basic test
artillery run tests/load/artillery.yml

# Run with report
artillery run --output report.json tests/load/artillery.yml
artillery report report.json

# Quick test (10 users for 30 seconds)
artillery quick --count 10 --duration 30 http://localhost:3000/health
```

### Custom Performance Tests

```typescript
// tests/performance/notification-perf.test.ts
describe('Notification Performance', () => {
  it('should handle 100 simultaneous notifications', async () => {
    const startTime = Date.now();
    const userCount = 100;
    
    // Create test data
    const users = await Promise.all(
      Array.from({ length: userCount }, (_, i) =>
        dbHelper.createTestUser(100000 + i)
      )
    );
    
    const medications = await Promise.all(
      users.map(user =>
        dbHelper.createTestMedication(user.id)
      )
    );
    
    const schedules = await Promise.all(
      medications.map(med =>
        dbHelper.createTestSchedule(med.id)
      )
    );
    
    // Send all notifications simultaneously
    const sendPromises = schedules.map(schedule =>
      notificationService.sendReminder({
        userId: schedule.medicationId, // Simplified for test
        medicationId: schedule.medicationId,
        scheduleId: schedule.id,
        scheduledTime: '09:00'
      })
    );
    
    await Promise.all(sendPromises);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Should complete in under 5 seconds
    expect(duration).toBeLessThan(5000);
    
    // Verify all notifications sent
    const logs = await prisma.intakeLog.findMany({
      where: {
        scheduleId: { in: schedules.map(s => s.id) }
      }
    });
    
    expect(logs).toHaveLength(userCount);
    
    // Check average response time
    const avgTime = duration / userCount;
    console.log(`Average notification time: ${avgTime}ms`);
    expect(avgTime).toBeLessThan(50); // Under 50ms per notification
  }, 30000); // 30 second timeout
});
```

---

## Snapshot Testing

### Message Snapshot Tests

```typescript
// bot/commands/__tests__/start.test.ts
describe('Start Command Snapshots', () => {
  it('should match welcome message snapshot', async () => {
    const testBot = createTestBot();
    await testBot.sendCommand('/start', 123);
    
    expect(testBot.lastMessage).toMatchSnapshot();
  });
  
  it('should match already registered message snapshot', async () => {
    await dbHelper.createTestUser(123);
    
    const testBot = createTestBot();
    await testBot.sendCommand('/start', 123);
    
    expect(testBot.lastMessage).toMatchSnapshot();
  });
});
```

**Snapshot file (__snapshots__/start.test.ts.snap):**
```
// Jest Snapshot v1

exports[`Start Command Snapshots should match welcome message snapshot 1`] = `
"👋 Добро пожаловать в Med Reminder Bot!

Я помогу вам не забывать о приёме лекарств.

Используйте /add чтобы добавить первое лекарство."
`;

exports[`Start Command Snapshots should match already registered message snapshot 1`] = `"✅ Вы уже зарегистрированы! Используйте /help для списка команд."`;
```

---

## Mutation Testing

### Using Stryker

**stryker.conf.json:**
```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "packageManager": "npm",
  "testRunner": "jest",
  "coverageAnalysis": "perTest",
  "mutate": [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "!src/**/*.spec.ts"
  ],
  "thresholds": {
    "high": 80,
    "low": 60,
    "break": 50
  }
}
```

```bash
# Install Stryker
npm install --save-dev @stryker-mutator/core @stryker-mutator/jest-runner

# Run mutation tests
npx stryker run
```

---

**Версия документа**: 2.0  
**Последнее обновление**: 15 октября 2025  
**Статус**: Полностью восстановлен ✅
