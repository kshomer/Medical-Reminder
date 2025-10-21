# CLAUDE.md

Этот файл предоставляет рекомендации для Claude Code (claude.ai/code) при работе с кодом в этом репозитории.

## Обзор проекта

**Med Reminder Bot** — это Telegram-бот для отслеживания приёма лекарств с автоматическими напоминаниями, отслеживанием выполнения и статистикой. Построен на TypeScript, Node.js, Telegraf, PostgreSQL и Prisma.

Основной tech stack:

- **Backend**: Node.js 20.x, TypeScript 5.x
- **Bot Framework**: Telegraf 4.x
- **Database**: PostgreSQL 16.x + Prisma 5.x (ORM)
- **Task Queue**: Bull (Redis-backed)
- **Logging**: Pino
- **Testing**: Jest + ts-jest
- **Code Quality**: ESLint + Prettier

## Быстрые команды

### Разработка

```bash
npm run dev              # Запуск с hot-reload (nodemon)
npm run build            # Компиляция в dist/
npm start                # Запуск скомпилированного production-bilда
```

### База данных

```bash
npx prisma migrate dev --name <описание>      # Создать и применить миграцию
npx prisma studio                             # Открыть GUI базы данных (http://localhost:5555)
npm run prisma:seed                           # Заполнить тестовыми данными
npx prisma generate                           # Регенерировать Prisma Client (если нужно)
```

### Качество кода

```bash
npm run lint             # Проверка ESLint
npm run lint:fix         # Автоматическое исправление ESLint
npm run format           # Запуск Prettier
npm test                 # Запуск всех тестов
npm run test:watch       # Запуск тестов в режиме watch
npm test <filename>      # Запуск конкретного test-файла
```

### Инфраструктура

```bash
docker-compose up -d postgres redis   # Запустить PostgreSQL и Redis
docker-compose down                   # Остановить все services
docker-compose logs -f                # Смотреть логи services
```

## Архитектура проекта

### Структура директорий

```
src/
├── index.ts                     # Точка входа приложения
├── bot/                         # Логика Telegram-бота
│   ├── index.ts                # Инициализация бота и middleware-и
│   ├── types.ts                # Bot-specific TypeScript типы
│   ├── commands/               # Handlers команд (/start, /list, /delete, /help, /stats)
│   ├── scenes/                 # FSM-сценарии (add-medication.scene.ts, add-medication-improved.scene.ts)
│   └── handlers/               # Handlers callback-запросов
├── services/                    # Бизнес-логика (dependency-injectable сервисы)
│   ├── user.service.ts
│   ├── medication.service.ts
│   ├── scheduler.service.ts
│   ├── notification.service.ts
│   └── analytics.service.ts
├── utils/                       # Utility функции
│   ├── logger.ts               # Конфигурация Pino logger
│   ├── format.utils.ts         # Utilities для форматирования текста
│   ├── calendar.ts             # Date/calendar utilities
│   ├── prisma.ts               # Prisma Client instance
│   └── validators.ts           # Helpers для валидации input
├── config/                      # Конфигурация
│   └── index.ts                # Загрузка environment и конфига
├── types/                       # TypeScript type definitions
└── prisma/
    ├── schema.prisma           # Database schema
    └── migrations/             # SQL миграционные файлы
```

### Основные Data Models (Prisma)

- **User**: Telegram-пользователь с timezone
- **Medication**: Запись о лекарстве с frequency и timings
- **Schedule**: Конкретное время + dosage для лекарства (может быть несколько на лекарство)
- **IntakeLog**: Records о том, когда напоминания были отправлены/подтверждены

Ключевые relations:

- User → многие Medications
- Medication → многие Schedules
- Medication → многие IntakeLogs
- Indexes на: `(userId, scheduledDate)`, `(status, sentAt)`, unique `(scheduleId, scheduledDate)`

## Workflow разработки

### Git & Commits

Используй формат **Conventional Commits**:
```bash
feat: добавлена новая command
feat(bot): реализован FSM для редактирования лекарства
fix: исправлено дублирование уведомлений
fix(scheduler): корректный расчет timezone
docs: обновлена документация API
refactor: упрощена логика MedicationService
test: добавлены unit-тесты для ScheduleService
chore: обновлены dependencies
perf: оптимизированы database-запросы с indexes
```

**Branching**: `main` (production) ← `develop` ← `feature/*`, `bugfix/*`, `hotfix/*`

**PR requirements**: ESLint pass, тесты pass, минимум 1 approval

### Setup локального environment

1. Скопируй `.env.example` в `.env`
2. Обязательные переменные: `TELEGRAM_BOT_TOKEN`, `DATABASE_URL`, `NODE_ENV`, `PORT`, `LOG_LEVEL`
3. Запусти services: `docker-compose up -d postgres redis`
4. Применить миграции: `npx prisma migrate dev`
5. Проверить: `npm run dev`

## Ключевые архитектурные patterns

### Service Layer

Services содержат business-логику и используют dependency-injection для testability. Пример:
```typescript
class MedicationService {
  constructor(private prisma: PrismaClient) {}

  async createMedication(data: CreateMedicationDto) {
    // Business-логика с Prisma operations
  }
}
```

### Bot Commands & Scenes

- **Commands**: Simple request handlers (cmd/)
- **Scenes**: Multi-step FSM flows для complex interactions (например, добавление лекарства с расписанием)
- **Handlers**: Callback query handlers для inline-кнопок

### Database Patterns

- Используй Prisma eager loading (`include`, `select`) для избежания N+1 queries
- Leverage indexes на IntakeLog для быстрых reminder-запросов
- Миграции применяются через `prisma migrate deploy` в production

### Логирование

Используй Pino logger со structured logging:
```typescript
logger.info({ userId, medicationId }, 'Medication created');
logger.error({ err, context }, 'Failed to send notification');
```

Levels: `debug` (dev) → `info` (prod)

## Performance & Scalability

**Текущий scope**: Оптимизирован для ~1-10k пользователей

- Monolithic архитектура (single process)
- Все данные в PostgreSQL (с proper indexes)
- Bull queues для background jobs

**Future scaling**: Рассмотри sharding, микросервисы или caching при превышении 100k пользователей или 1M+ intake_logs.

## Testing Strategy

- **Unit Tests**: Service-логика с mocked Prisma (в `tests/unit/`)
- **Integration Tests**: Database operations (в `tests/integration/`)
- **E2E Tests**: Full bot flows (в `tests/e2e/`)

Запуск конкретных тестов:
```bash
npm test medication.service.test.ts       # Один файл
npm test -- -t "should create medication" # По названию
npm run test:coverage                     # С coverage report
```

## Типичные задачи

### Добавить новую bot command

1. Создай файл в `src/bot/commands/`
2. Экспортируй handler-функцию, принимающую `ctx: Context`
3. Зарегистрируй в `src/bot/index.ts`
4. Добавь тесты

### Модифицировать database schema

1. Отредактируй `prisma/schema.prisma`
2. Запусти `npx prisma migrate dev --name <описание>`
3. Миграция auto-применяется и Prisma Client регенерируется

### Добавить новый service

1. Создай класс в `src/services/`
2. Inject Prisma Client в constructor
3. Реализуй business-логику методы
4. Используй в commands/handlers через dependency injection

### Debug bot interaction

Включи Telegraf debug режим в `.env`: `DEBUG=telegraf:*`
Используй VS Code debugger (смотри DEVELOPMENT.md для launch.json конфига)

## Важные файлы

- **Docs/ARCHITECTURE.md**: Детальная архитектура системы, security, monitoring, roadmap масштабирования
- **Docs/DATABASE.md**: Полная документация schema
- **Docs/BOT.md**: Telegram bot commands, FSM flows, логика уведомлений
- **Docs/DEVELOPMENT.md**: Расширенный development guide (debugging, profiling, troubleshooting)
- **jest.config.js**: Конфигурация тестов
- **docker-compose.yml**: Local development services (PostgreSQL, Redis)

## Быстрое troubleshooting

Смотри `Docs/DEVELOPMENT.md` для детального troubleshooting. Часто встречаемые issues:

- "Prisma Client not generated" → `npx prisma generate`
- "Database connection error" → Проверь `DATABASE_URL` в `.env`, убедись что PostgreSQL running
- "Port already in use" → `lsof -i :3000` затем `kill -9 <PID>`
- "Bull queue not processing" → Проверь что Redis running и worker логи

## Code Style notes

- **async/await** предпочтительнее чем `.then()`
- **Destructuring** для object properties
- **Explicit types** на parameters функций
- **UPPER_SNAKE_CASE** для constants
- **PascalCase** для Enums
- **camelCase** для variables и functions
- **Interfaces** описывают data shape (prefix `I` не требуется)

Enforce с помощью: `npm run lint:fix && npm run format`

## Known Issues & Limitations

- Нет автоматического rollback для Prisma миграций (требуется manual SQL)
- Single database connection pool (рассмотри scaling перед 1M records в intake_logs)
- Monolithic bot process (может scale до микросервисов если нужно)

---

**Последнее обновление**: 22 октября 2025
**Версия**: 1.0
