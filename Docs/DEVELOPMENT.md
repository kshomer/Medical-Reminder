# Руководство для разработчиков

## Getting Started

### Требования

- Node.js 20.x или выше
- PostgreSQL 16.x
- Redis 7.x
- Git
- Docker & Docker Compose (опционально)

### Установка локального окружения

```bash
# Клонирование репозитория
git clone https://github.com/yourusername/med-reminder-bot.git
cd med-reminder-bot

# Установка зависимостей
npm install

# Настройка окружения
cp .env.example .env
# Отредактировать .env (DATABASE_URL, TELEGRAM_BOT_TOKEN, и т.д.)

# Запуск БД через Docker
docker-compose up -d postgres redis

# Миграция БД
npx prisma migrate dev

# Генерация Prisma Client
npx prisma generate

# Seed базы данных (опционально)
npm run prisma:seed

# Запуск в dev режиме
npm run dev
```

---

## Структура проекта

```
src/
├── bot/              # Telegram bot логика
│   ├── commands/     # Обработчики команд (/start, /add, etc.)
│   ├── scenes/       # FSM сценарии (добавление лекарства)
│   ├── handlers/     # Callback handlers (кнопки)│   └── middlewares/  # Middleware (auth, rate-limit, logging)
├── services/         # Бизнес-логика
│   ├── user.service.ts
│   ├── medication.service.ts
│   ├── schedule.service.ts
│   ├── notification.service.ts
│   └── analytics.service.ts
├── queues/           # Bull очереди
│   ├── reminder.queue.ts
│   ├── notification.queue.ts
│   └── analytics.queue.ts
├── utils/            # Утилиты
│   ├── logger.ts
│   ├── date.ts
│   └── validators.ts
├── config/           # Конфигурация
│   └── index.ts
├── types/            # TypeScript типы
│   └── index.d.ts
├── prisma/           # Prisma схема и миграции
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── tests/            # Тесты
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── index.ts          # Точка входа
```

---

## Code Style

### ESLint + Prettier

Проект использует ESLint и Prettier для единообразного стиля кода.

```bash
# Проверка кода
npm run lint

# Автоматическое исправление
npm run lint:fix

# Форматирование
npm run format

# Проверка типов TypeScript
npm run type-check
```

### Правила оформления кода

```typescript
// ✅ Хорошо: используйте async/await
async function getData() {
  const result = await fetchData();
  return result;
}

// ❌ Плохо: избегайте .then()
function getData() {
  return fetchData().then(result => result);
}

// ✅ Деструктуризация
const { name, dosage, schedule } = medication;

// ❌ Множественный доступ к свойствам
const name = medication.name;
const dosage = medication.dosage;
const schedule = medication.schedule;

// ✅ Явные типы для параметров функций
function createMedication(data: CreateMedicationDto): Promise<Medication> {
  // ...
}

// ❌ Неявные типы
function createMedication(data) {
  // ...
}

// ✅ Константы в UPPER_SNAKE_CASE
const MAX_MEDICATIONS_PER_USER = 50;
const DEFAULT_REMINDER_OFFSET = 15; // minutes

// ✅ Интерфейсы начинаются с I (опционально) или описывают сущность
interface MedicationData {
  name: string;
  dosage: string;
  schedule: ScheduleData;
}

// ✅ Enums в PascalCase
enum ReminderStatus {
  Pending = 'PENDING',
  Sent = 'SENT',
  Confirmed = 'CONFIRMED',
  Missed = 'MISSED'
}
```

---

## Git Workflow

### Branching Strategy

```
main (production-ready код)
  └── develop (staging)
       ├── feature/add-medication-flow
       ├── feature/statistics-command
       ├── feature/web-panel-integration
       ├── bugfix/notification-duplicate
       ├── bugfix/timezone-calculation
       └── hotfix/critical-database-issue
```

**Правила:**
- `main` - только production-ready код, защищён от прямых коммитов
- `develop` - интеграционная ветка для разработки
- `feature/*` - новая функциональность
- `bugfix/*` - исправления не критичных багов
- `hotfix/*` - срочные исправления для production

### Commit Messages

Используем **Conventional Commits** для единообразия:

```bash
# Новая функциональность
feat: добавлена команда /stats для просмотра статистики
feat(bot): реализован FSM для редактирования лекарства

# Исправление бага
fix: исправлен дубликат уведомлений при перезапуске
fix(scheduler): корректный расчёт следующего времени напоминания

# Документация
docs: обновлена документация API endpoints
docs(readme): добавлены инструкции по деплою

# Рефакторинг
refactor: рефакторинг MedicationService для улучшения читаемости
refactor(services): вынес общую логику валидации в отдельный модуль

# Тесты
test: добавлены unit тесты для ScheduleService
test(e2e): добавлен E2E тест для flow добавления лекарства

# Технические изменения
chore: обновлены зависимости до последних версий
chore(deps): обновлён Prisma до версии 5.x

# Производительность
perf: оптимизирован запрос списка активных расписаний
perf(db): добавлены индексы для частых запросов

# Стиль кода (без изменения логики)
style: исправлено форматирование согласно Prettier
```

### Pull Request Process

1. **Создать feature branch** от `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/my-awesome-feature
   ```

2. **Сделать изменения** и добавить тесты:
   ```bash
   # Разработка
   git add .
   git commit -m "feat: добавлена новая функция"
   ```

3. **Запустить проверки** перед push:
   ```bash
   npm run lint
   npm run type-check
   npm test
   ```

4. **Push и создание PR**:
   ```bash
   git push origin feature/my-awesome-feature
   # Создать PR через GitHub/GitLab UI
   ```

5. **Code Review**:
   - Минимум 1 approver для feature веток
   - Минимум 2 approvers для hotfix в main
   - Все CI checks должны пройти

6. **Merge** после одобрения:
   - Squash merge для feature веток
   - Merge commit для hotfixes

---

## Работа с Prisma

### Создание миграции

```bash
# 1. Изменить schema.prisma
# Например, добавить поле priority в Medication

# 2. Создать миграцию
npx prisma migrate dev --name add_priority_field

# 3. Prisma автоматически:
#    - Создаёт SQL миграцию
#    - Применяет её к БД
#    - Регенерирует Prisma Client
```

### Применение миграций в production

```bash
# Production deployment
npx prisma migrate deploy

# Проверка статуса миграций
npx prisma migrate status
```

### Откат миграции

```bash
# Откат последней миграции (вручную через SQL)
# Prisma не поддерживает автоматический rollback

# Удалить последнюю запись из _prisma_migrations
# Применить обратный SQL скрипт вручную
```

### Prisma Studio - GUI для БД

```bash
npx prisma studio
# Открывается на http://localhost:5555
# Можно просматривать и редактировать данные
```

### Seeding базы данных

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Создать тестового пользователя
  const user = await prisma.user.upsert({
    where: { telegramId: 123456789 },
    update: {},
    create: {
      telegramId: 123456789,
      firstName: 'Test',
      username: 'testuser',
      language: 'ru',
      timezone: 'Europe/Moscow'
    }
  });

  // Создать тестовое лекарство
  await prisma.medication.create({
    data: {
      userId: user.id,
      name: 'Аспирин',
      description: 'От головной боли',
      dosage: '1 таблетка',
      startDate: new Date(),
      isActive: true,
      schedule: {
        create: {
          frequency: 'DAILY',
          timeOfDay: '09:00'
        }
      }
    }
  });

  console.log('✅ Seeding completed');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

```bash
# Запуск seed
npm run prisma:seed
```

---

## Debugging

### VS Code Launch Configuration

Создайте `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Bot",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/src/index.ts",
      "runtimeArgs": ["-r", "ts-node/register"],
      "args": [],
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "sourceMaps": true
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Current Test",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": [
        "${fileBasenameNoExtension}",
        "--runInBand",
        "--no-coverage"
      ],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

**Использование:**
1. Открыть файл, который хотите отладить
2. Поставить breakpoint (F9)
3. Нажать F5 или "Run" → "Start Debugging"
4. Использовать VS Code debug панель для step over (F10), step into (F11)

### Логирование

Проект использует `pino` для структурированного логирования:

```typescript
import { logger } from './utils/logger';

// Debug - детальная информация для отладки
logger.debug({ userId, medicationId }, 'Fetching medication details');

// Info - важные события
logger.info({ userId: user.id }, 'User registered successfully');

// Warn - предупреждения, не критичные проблемы
logger.warn({ reminderCount }, 'Large number of pending reminders');

// Error - ошибки
logger.error({ error, context: { userId } }, 'Failed to send notification');

// Для вложенных объектов
logger.info({
  user: {
    id: user.id,
    telegramId: user.telegramId
  },
  medication: {
    id: med.id,
    name: med.name
  }
}, 'Medication created');
```

**Уровни логирования** (через .env):
```bash
# Разработка - показывать всё
LOG_LEVEL=debug

# Production - только важное
LOG_LEVEL=info
```

### Chrome DevTools для Node.js

```bash
# Запустить с инспектором
node --inspect src/index.ts

# Открыть chrome://inspect в Chrome
# Нажать "inspect" рядом с вашим процессом

# Или использовать флаг для автоматического открытия DevTools
node --inspect-brk src/index.ts
```

---

## Тестирование

### Запуск тестов

```bash
# Все тесты
npm test

# Watch mode (автоматически перезапускать при изменениях)
npm run test:watch

# Coverage отчёт
npm run test:coverage
# Открыть coverage/lcov-report/index.html в браузере

# Только unit тесты
npm run test:unit

# Только integration тесты
npm run test:integration

# Только E2E тесты
npm run test:e2e

# Конкретный файл
npm test medication.service.test.ts

# С фильтром по названию теста
npm test -- -t "should create medication"
```

### Написание тестов

```typescript
// tests/unit/services/medication.service.test.ts
import { MedicationService } from '../../../src/services/medication.service';
import { prismaMock } from '../../helpers/prisma-mock';

describe('MedicationService', () => {
  let medicationService: MedicationService;

  beforeEach(() => {
    medicationService = new MedicationService(prismaMock);
  });

  describe('createMedication', () => {
    it('should create medication with valid data', async () => {
      const mockData = {
        userId: 1,
        name: 'Аспирин',
        dosage: '1 таблетка',
        schedule: {
          frequency: 'DAILY',
          timeOfDay: '09:00'
        }
      };

      prismaMock.medication.create.mockResolvedValue({
        id: 1,
        ...mockData,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const result = await medicationService.create(mockData);

      expect(result).toBeDefined();
      expect(result.name).toBe('Аспирин');
      expect(prismaMock.medication.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Аспирин',
          dosage: '1 таблетка'
        })
      });
    });

    it('should throw error when name is empty', async () => {
      const invalidData = {
        userId: 1,
        name: '',
        dosage: '1 таблетка'
      };

      await expect(
        medicationService.create(invalidData)
      ).rejects.toThrow('Medication name is required');
    });
  });
});
```

---

## Troubleshooting

### "Prisma Client not generated"

**Проблема**: `Cannot find module '@prisma/client'`

**Решение**:
```bash
npx prisma generate
```

Если не помогло:
```bash
rm -rf node_modules/@prisma
npm install
npx prisma generate
```

### "Port 3000 already in use"

**Проблема**: `Error: listen EADDRINUSE: address already in use :::3000`

**Решение**:
```bash
# Найти процесс на порту 3000
lsof -ti:3000

# Убить процесс
lsof -ti:3000 | xargs kill -9

# Или изменить порт в .env
PORT=3001
```

### "Redis connection refused"

**Проблема**: `Error: connect ECONNREFUSED 127.0.0.1:6379`

**Решение**:
```bash
# Проверить запущен ли Redis
redis-cli ping
# Должно вернуть: PONG

# Если нет, запустить через Docker
docker-compose up -d redis

# Или установить и запустить локально (macOS)
brew install redis
brew services start redis
```

### "Database connection error"

**Проблема**: `Error: Can't reach database server`

**Решение**:
1. Проверить `DATABASE_URL` в `.env`:
   ```
   DATABASE_URL="postgresql://user:password@localhost:5432/medbot?schema=public"
   ```

2. Проверить что PostgreSQL запущен:
   ```bash
   docker-compose ps postgres
   # Или
   pg_isready -h localhost -p 5432
   ```

3. Проверить логи PostgreSQL:
   ```bash
   docker-compose logs postgres
   ```

4. Попробовать подключиться вручную:
   ```bash
   psql -h localhost -U user -d medbot
   ```

### "Bull queue not processing jobs"

**Проблема**: Задачи добавляются в очередь, но не выполняются

**Решение**:
1. Проверить логи worker:
   ```bash
   docker-compose logs worker
   ```

2. Проверить Redis:
   ```bash
   redis-cli
   > KEYS bull:reminder:*
   > LLEN bull:reminder:wait
   ```

3. Проверить что worker запущен:
   ```typescript
   // src/queues/reminder.queue.ts
   console.log('🔄 Reminder queue worker started');
   ```

4. Увеличить логирование Bull:
   ```typescript
   const queue = new Queue('reminder', {
     redis: redisConfig,
     settings: {
       lockDuration: 30000,
       stalledInterval: 30000
     }
   });

   queue.on('active', (job) => {
     logger.info({ jobId: job.id }, 'Job started');
   });

   queue.on('completed', (job) => {
     logger.info({ jobId: job.id }, 'Job completed');
   });

   queue.on('failed', (job, err) => {
     logger.error({ jobId: job.id, error: err }, 'Job failed');
   });
   ```

### "Telegram webhook not working"

**Проблема**: Бот не отвечает на сообщения в production

**Решение**:
1. Проверить webhook URL:
   ```bash
   curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo
   ```

2. Должен быть HTTPS с валидным SSL:
   ```json
   {
     "url": "https://yourdomain.com/webhook",
     "has_custom_certificate": false,
     "pending_update_count": 0,
     "last_error_date": 0
   }
   ```

3. Если `last_error_date` не 0, проверить логи сервера

4. Переключиться на polling для отладки:
   ```typescript
   // src/index.ts
   // bot.launch({ webhook: { domain, port } }); // Закомментировать
   bot.launch(); // Использовать polling
   ```

### "Memory leak detected"

**Проблема**: Использование памяти постоянно растёт

**Решение**:
1. Включить heap snapshots:
   ```bash
   node --inspect --max-old-space-size=4096 src/index.ts
   ```

2. Открыть Chrome DevTools → Memory → Take Heap Snapshot

3. Проверить общие причины:
   - Незакрытые database connections
   - Event listeners не удаляются
   - Кэши растут бесконечно
   - setTimeout/setInterval не очищаются

4. Использовать `clinic.js` для профилирования:
   ```bash
   npm install -g clinic
   clinic doctor -- node src/index.ts
   ```

### "TypeScript compilation errors"

**Проблема**: `error TS2304: Cannot find name 'XYZ'`

**Решение**:
```bash
# Очистить кэш TypeScript
rm -rf dist/
rm -rf node_modules/.cache

# Переустановить типы
npm install --save-dev @types/node @types/jest

# Проверка типов
npm run type-check

# Проверка конфигурации
cat tsconfig.json
```

---

## Performance Profiling

### CPU Profiling

```bash
# Использовать Node.js встроенный профайлер
node --prof src/index.ts

# Запустить нагрузку
# Остановить (Ctrl+C)

# Обработать результат
node --prof-process isolate-*-v8.log > profile.txt

# Открыть profile.txt и искать bottlenecks
```

### Memory Profiling

```bash
# Heap snapshot в коде
import v8 from 'v8';
import fs from 'fs';

function takeHeapSnapshot() {
  const filename = `heap-${Date.now()}.heapsnapshot`;
  v8.writeHeapSnapshot(filename);
  console.log(`Heap snapshot saved to ${filename}`);
}

// Вызывать периодически
setInterval(takeHeapSnapshot, 60000); // Каждую минуту
```

### Database Query Performance

```typescript
// Включить логирование медленных запросов
const prisma = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query'
    }
  ]
});

prisma.$on('query', (e) => {
  if (e.duration > 100) { // Медленнее 100ms
    logger.warn({
      query: e.query,
      duration: e.duration,
      params: e.params
    }, 'Slow query detected');
  }
});
```

### Bull Queue Performance

```typescript
import { QueueScheduler } from 'bull';

// Включить scheduler для улучшенной производительности
const queueScheduler = new QueueScheduler('reminder', {
  redis: redisConfig
});

// Мониторинг метрик
setInterval(async () => {
  const waiting = await queue.getWaitingCount();
  const active = await queue.getActiveCount();
  const failed = await queue.getFailedCount();
  
  logger.info({
    waiting,
    active,
    failed
  }, 'Queue metrics');
}, 30000); // Каждые 30 секунд
```

---

## Полезные команды

```bash
# ========================================
# Разработка
# ========================================
npm run dev              # Запуск с hot-reload (nodemon)
npm run build            # Сборка для production
npm start                # Запуск production build

# ========================================
# База данных
# ========================================
npm run prisma:studio    # GUI для просмотра БД
npm run prisma:migrate   # Создать новую миграцию
npm run prisma:deploy    # Применить миграции в prod
npm run prisma:seed      # Заполнить БД тестовыми данными
npm run prisma:reset     # Сбросить БД (удалить всё)

# ========================================
# Качество кода
# ========================================
npm run lint             # Проверка ESLint
npm run lint:fix         # Автофикс ESLint
npm run format           # Prettier форматирование
npm run type-check       # TypeScript проверка

# ========================================
# Тесты
# ========================================
npm test                 # Все тесты
npm run test:watch       # Watch mode
npm run test:unit        # Только unit
npm run test:integration # Только integration
npm run test:e2e         # Только E2E
npm run test:coverage    # С coverage отчётом

# ========================================
# Docker
# ========================================
docker-compose up -d          # Запустить все сервисы
docker-compose up -d postgres # Только PostgreSQL
docker-compose logs -f        # Смотреть логи
docker-compose down           # Остановить всё
docker-compose ps             # Статус сервисов

# ========================================
# Полезные команды для отладки
# ========================================
# Проверить переменные окружения
cat .env

# Проверить порты
lsof -i :3000
lsof -i :5432
lsof -i :6379

# Проверить процессы Node
ps aux | grep node

# Очистка
rm -rf node_modules dist
npm install
npm run build
```

---

## VS Code Recommended Extensions

Создайте `.vscode/extensions.json`:

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "prisma.prisma",
    "orta.vscode-jest",
    "ms-vscode.vscode-typescript-next",
    "usernamehw.errorlens",
    "christian-kohler.path-intellisense",
    "eamodio.gitlens"
  ]
}
```

---

## Environment Variables Reference

```bash
# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/medbot"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Server
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Webhook (production)
WEBHOOK_DOMAIN=https://yourdomain.com
WEBHOOK_PATH=/webhook

# JWT (если используется web панель)
JWT_SECRET=your_super_secret_key

# Bull Dashboard (опционально)
BULL_BOARD_USER=admin
BULL_BOARD_PASSWORD=secure_password
```

---

## Onboarding Checklist для новых разработчиков

- [ ] Установлен Node.js 20.x
- [ ] Установлен Docker Desktop
- [ ] Клонирован репозиторий
- [ ] Установлены зависимости (`npm install`)
- [ ] Скопирован `.env.example` в `.env`
- [ ] Получен Telegram Bot Token от @BotFather
- [ ] Запущены PostgreSQL и Redis через Docker
- [ ] Применены миграции БД (`npx prisma migrate dev`)
- [ ] Выполнен seed БД (`npm run prisma:seed`)
- [ ] Успешно запущен бот (`npm run dev`)
- [ ] Отправлено `/start` боту и получен ответ
- [ ] Запущены тесты (`npm test`)
- [ ] Установлены VS Code extensions
- [ ] Прочитаны ARCHITECTURE.md, DATABASE.md, BOT.md
- [ ] Настроен Git (имя, email)
- [ ] Создана тестовая ветка и сделан первый PR

**Примерное время онбординга**: 2-3 часа

---

**Версия документа**: 2.1 (расширенная)  
**Последнее обновление**: 15 октября 2025  
**Изменения**: Добавлен расширенный troubleshooting, performance profiling, детальные примеры отладки