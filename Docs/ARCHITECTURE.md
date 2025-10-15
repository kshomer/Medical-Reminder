30, // 30 команд
  onLimitExceeded: (ctx) => {
    ctx.reply('⚠️ Слишком много запросов. Подождите минуту.');
  }
});
```

### 3. Webhook Secret
```typescript
app.post('/webhook/telegram', async (req, res) => {
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (secret !== process.env.WEBHOOK_SECRET) {
    return res.status(403).send('Forbidden');
  }
  // Обработка webhook
});
```

### 4. SQL Injection Protection
Prisma использует prepared statements автоматически

### 5. XSS Protection
Все пользовательские данные экранируются перед отправкой в Telegram

---

## Производительность

### Оптимизации базы данных

#### 1. Индексы
```prisma
@@index([userId, isActive])
@@index([status, sentAt])
@@unique([scheduleId, scheduledDate])
```

#### 2. Connection Pooling
```typescript
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  pool_timeout = 10
  connection_limit = 20
}
```

#### 3. Eager Loading
```typescript
// Вместо N+1 запросов
const medications = await prisma.medication.findMany({
  include: {
    schedules: true,
    user: true
  }
});
```

### Кэширование

#### Redis для сессий
```typescript
const session = new RedisSession({
  store: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  }
});
```

#### Кэширование расписаний
```typescript
// Кэшируем частые запросы на 5 минут
const schedules = await cache.wrap(
  `schedules:${medicationId}`,
  () => scheduleService.getSchedules(medicationId),
  { ttl: 300 }
);
```

---

## Мониторинг и наблюдаемость

### Логирование

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

// Использование
logger.info({ userId, medicationId }, 'Medication created');
logger.error({ err, context }, 'Failed to send notification');
```

### Метрики

```typescript
// Количество отправленных уведомлений
metrics.increment('notifications.sent');

// Время обработки команды
metrics.timing('command.process_time', duration);

// Размер очереди
metrics.gauge('queue.length', await reminderQueue.count());
```

### Health Checks

```typescript
app.get('/health', async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    telegram: await checkTelegram()
  };
  
  const healthy = Object.values(checks).every(v => v);
  res.status(healthy ? 200 : 503).json(checks);
});
```

---

## Отказоустойчивость

### 1. Retry механизм
```typescript
reminderQueue.process('send-reminder', async (job) => {
  try {
    await sendNotification(job.data);
  } catch (error) {
    if (job.attemptsMade < 3) {
      throw error; // Bull автоматически повторит
    }
    logger.error({ error, job }, 'Failed after 3 attempts');
  }
});
```

### 2. Circuit Breaker
```typescript
const breaker = new CircuitBreaker(telegramAPI.sendMessage, {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
});
```

### 3. Graceful Shutdown
```typescript
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing gracefully...');
  
  await bot.stop();
  await reminderQueue.close();
  await prisma.$disconnect();
  
  process.exit(0);
});
```

### 4. Job Persistence
Bull сохраняет задачи в Redis → выдерживают перезапуск

---

## Тестируемость

### Dependency Injection
Позволяет легко мокать зависимости:

```typescript
describe('MedicationService', () => {
  let service: MedicationService;
  let mockPrisma: MockPrismaClient;
  
  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    service = new MedicationService(mockPrisma);
  });
  
  it('should create medication', async () => {
    // test implementation
  });
});
```

### Изоляция слоёв
Каждый слой можно тестировать независимо

---

## Ограничения текущей архитектуры

### 1. Monolithic
- Всё в одном процессе
- **Когда проблема**: > 100k пользователей
- **Решение**: Микросервисы (Bot Service, Notification Service, Analytics Service)

### 2. Single Database
- Один PostgreSQL для всех данных
- **Когда проблема**: > 1M записей в intake_logs
- **Решение**: Sharding или отдельная БД для логов

### 3. Отсутствие кэша результатов
- Каждый запрос идёт в БД
- **Когда проблема**: > 1000 RPS
- **Решение**: Redis cache layer для часто запрашиваемых данных

---

## Будущие улучшения

### Фаза 1: Текущая архитектура (MVP)
```
Bot ← → Services ← → Prisma ← → PostgreSQL
                ↓
              Bull + Redis
```

### Фаза 2: Кэширование
```
Bot ← → Services ← → Cache ← → Prisma ← → PostgreSQL
                      ↓
                   Bull + Redis
```

### Фаза 3: Микросервисы
```
            ┌──────────────┐
            │  API Gateway │
            └───────┬──────┘
         ┌──────────┼──────────┐
         ↓          ↓          ↓
    ┌────────┐ ┌──────────┐ ┌──────────┐
    │  Bot   │ │Notification│ │Analytics│
    │Service │ │  Service  │ │ Service │
    └────────┘ └──────────┘ └──────────┘
         │          │          │
         └──────────┴──────────┘
                    ↓
              Message Queue
                    ↓
              PostgreSQL
```

---

## Диаграмма развёртывания

```
┌────────────────────────────────────────────────────────┐
│                    VPS / Cloud Server                  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │                    Nginx                         │ │
│  │            (Reverse Proxy + SSL)                 │ │
│  └─────────────────┬────────────────────────────────┘ │
│                    │                                   │
│  ┌─────────────────┴────────────────────────────────┐ │
│  │                Docker Network                    │ │
│  │                                                  │ │
│  │  ┌────────────┐  ┌──────────┐  ┌────────────┐  │ │
│  │  │    App     │  │PostgreSQL│  │   Redis    │  │ │
│  │  │(Node.js +  │  │Container │  │ Container  │  │ │
│  │  │ Telegraf)  │  │          │  │            │  │ │
│  │  └────────────┘  └──────────┘  └────────────┘  │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │              PM2 (Process Manager)               │ │
│  └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
                         │
                         ↓
                ┌────────────────┐
                │  Telegram API  │
                └────────────────┘
```

---

## Заключение

Архитектура Med Reminder Bot спроектирована с учётом:
- ✅ **Простоты разработки** (для быстрого MVP)
- ✅ **Надёжности** (очереди, retry, персистентность)
- ✅ **Масштабируемости** (готовность к росту)
- ✅ **Поддерживаемости** (чёткое разделение слоёв)

Текущая архитектура оптимальна для **1-10k пользователей**. При росте можно постепенно усложнять систему, добавляя кэширование, микросервисы и горизонтальное масштабирование.

---

**Версия документа**: 2.0  
**Последнее обновление**: 15 октября 2025
