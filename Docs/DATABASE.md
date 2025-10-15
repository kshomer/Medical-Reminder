
    }
  }
});

if (existing) {
  // Уведомление уже отправлено сегодня
  return;
}
```

---

## Оптимизация производительности

### 1. Индексы

**Уже добавлены в схеме:**
```prisma
@@index([userId, isActive])           // medications
@@index([medicationId, isActive])     // schedules
@@unique([scheduleId, scheduledDate]) // intake_logs
@@index([userId, scheduledDate])      // intake_logs
@@index([status, sentAt])             // intake_logs
```

**Зачем нужны:**
- Ускорение WHERE запросов
- Быстрый поиск по составным ключам
- Уникальность для предотвращения дубликатов

### 2. Connection Pooling

```typescript
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// .env
DATABASE_URL="postgresql://user:password@localhost:5432/med_reminder?connection_limit=20&pool_timeout=10"
```

**Рекомендации:**
- Development: connection_limit=5
- Production: connection_limit=20-50 (зависит от нагрузки)

### 3. Eager Loading vs Lazy Loading

**Плохо (N+1 проблема):**
```typescript
const medications = await prisma.medication.findMany();

for (const med of medications) {
  const schedules = await prisma.schedule.findMany({
    where: { medicationId: med.id }
  });
}
// N+1 запросов к БД
```

**Хорошо:**
```typescript
const medications = await prisma.medication.findMany({
  include: {
    schedules: true
  }
});
// Один запрос с JOIN
```

### 4. Select только нужные поля

```typescript
// Плохо - загружаем все поля
const users = await prisma.user.findMany();

// Хорошо - только нужные
const users = await prisma.user.findMany({
  select: {
    id: true,
    telegramId: true,
    timezone: true
  }
});
```

### 5. Пагинация

```typescript
const pageSize = 20;
const page = 1;

const logs = await prisma.intakeLog.findMany({
  where: { userId: 123 },
  orderBy: { scheduledDate: 'desc' },
  take: pageSize,
  skip: (page - 1) * pageSize
});
```

---

## Архивация и очистка

### Стратегия хранения логов

```typescript
// Очистка логов старше 6 месяцев
await prisma.intakeLog.deleteMany({
  where: {
    createdAt: {
      lt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
    }
  }
});
```

### Архивация в отдельную таблицу

```prisma
model IntakeLogArchive {
  // Та же структура, что и IntakeLog
  // Но без индексов для экономии места
}
```

```typescript
// Перенос в архив
const oldLogs = await prisma.intakeLog.findMany({
  where: {
    createdAt: {
      lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    }
  }
});

await prisma.intakeLogArchive.createMany({
  data: oldLogs
});

await prisma.intakeLog.deleteMany({
  where: {
    id: { in: oldLogs.map(l => l.id) }
  }
});
```

---

## Backup и восстановление

### Автоматический backup

```bash
#!/bin/bash
# backup-db.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"
FILENAME="med_reminder_$DATE.sql.gz"

pg_dump -h localhost -U postgres -d med_reminder | gzip > "$BACKUP_DIR/$FILENAME"

# Удаление старых бэкапов (>30 дней)
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup completed: $FILENAME"
```

### Cron задача

```bash
crontab -e

# Ежедневный бэкап в 3:00
0 3 * * * /path/to/backup-db.sh >> /var/log/db-backup.log 2>&1
```

### Восстановление из бэкапа

```bash
gunzip < /backups/med_reminder_20251015_030000.sql.gz | \
psql -h localhost -U postgres -d med_reminder
```

---

## Безопасность

### 1. Защита от SQL Injection

Prisma использует prepared statements автоматически:

```typescript
// Безопасно - Prisma экранирует параметры
const user = await prisma.user.findUnique({
  where: { telegramId: userInput }
});
```

### 2. Хэширование чувствительных данных

Если в будущем появятся чувствительные данные:

```typescript
import bcrypt from 'bcrypt';

const hashedData = await bcrypt.hash(sensitiveData, 10);
```

### 3. Row Level Security (RLS)

В PostgreSQL можно настроить политики доступа:

```sql
-- Пользователь видит только свои данные
CREATE POLICY user_isolation_policy ON medications
  USING (user_id = current_setting('app.current_user_id')::int);
```

### 4. Шифрование на уровне БД

```sql
-- Шифрование конкретных колонок
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE medications 
  ALTER COLUMN notes 
  TYPE bytea 
  USING pgp_sym_encrypt(notes, 'encryption_key');
```

---

## Мониторинг производительности

### Slow Query Log

```sql
-- PostgreSQL конфигурация
ALTER DATABASE med_reminder SET log_min_duration_statement = 1000; -- 1 секунда
```

### Prisma Query Log

```typescript
const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'stdout', level: 'error' },
    { emit: 'stdout', level: 'warn' }
  ]
});

prisma.$on('query', (e) => {
  if (e.duration > 1000) {
    logger.warn({ query: e.query, duration: e.duration }, 'Slow query detected');
  }
});
```

### Размер базы данных

```sql
SELECT 
  pg_size_pretty(pg_database_size('med_reminder')) as database_size;

SELECT 
  relname as table_name,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

---

## Транзакции

### Атомарные операции

```typescript
// Создание лекарства + расписаний в одной транзакции
const result = await prisma.$transaction(async (tx) => {
  const medication = await tx.medication.create({
    data: {
      userId: 123,
      name: 'Аспирин',
      startDate: new Date(),
      frequency: 'DAILY'
    }
  });

  const schedules = await tx.schedule.createMany({
    data: [
      { medicationId: medication.id, time: '09:00', dosage: '1 таб' },
      { medicationId: medication.id, time: '21:00', dosage: '1 таб' }
    ]
  });

  return { medication, schedules };
});
```

### Retry на ошибку

```typescript
import { Prisma } from '@prisma/client';

async function createWithRetry(data: any, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await prisma.medication.create({ data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002' && i < maxRetries - 1) {
          // Unique constraint violation - retry
          continue;
        }
      }
      throw error;
    }
  }
}
```

---

## Тестирование

### Тестовая база данных

```bash
# .env.test
DATABASE_URL="postgresql://postgres:password@localhost:5432/med_reminder_test"
```

```typescript
// test/setup.ts
beforeAll(async () => {
  await prisma.$executeRawUnsafe('DROP SCHEMA public CASCADE');
  await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  await prisma.$migrate.deploy();
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

### Seed данные для тестов

```typescript
// prisma/seed.test.ts
export async function seedTestData() {
  const user = await prisma.user.create({
    data: {
      telegramId: 123456789,
      firstName: 'Test',
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

  return { user, medication };
}
```

---

## Миграция данных

### Пример миграции: добавление поля

```sql
-- migration.sql
ALTER TABLE medications ADD COLUMN priority INT DEFAULT 0;

-- Обновление существующих записей
UPDATE medications SET priority = 1 WHERE name LIKE '%Антибиотик%';
```

### Prisma миграция

```bash
# Создать миграцию
npx prisma migrate dev --name add_priority_to_medications

# Применить в production
npx prisma migrate deploy
```

---

## Частые проблемы и решения

### 1. Deadlock

**Проблема:** Две транзакции блокируют друг друга

**Решение:**
- Всегда изменяйте записи в одном порядке
- Используйте короткие транзакции
- Добавьте retry логику

### 2. Connection pool exhausted

**Проблема:** Слишком много открытых соединений

**Решение:**
```typescript
// Увеличить connection_limit
DATABASE_URL="...?connection_limit=50"

// Или использовать pgBouncer
```

### 3. Медленные запросы

**Проблема:** Запросы выполняются долго

**Решение:**
- Добавить индексы
- Использовать EXPLAIN ANALYZE
- Оптимизировать JOIN запросы

### 4. Дублирующиеся уведомления

**Проблема:** Два уведомления за один день

**Решение:**
```prisma
@@unique([scheduleId, scheduledDate])
```

---

## Масштабирование

### Read Replicas

```typescript
// Отдельные подключения для чтения и записи
const prismaWrite = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL_WRITE }
  }
});

const prismaRead = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL_READ }
  }
});

// Чтение из реплики
const users = await prismaRead.user.findMany();

// Запись в основную БД
await prismaWrite.user.create({ data: {...} });
```

### Sharding (горизонтальное разбиение)

```typescript
// Разбиение по userId
function getShardConnection(userId: number) {
  const shardIndex = userId % NUM_SHARDS;
  return prismaShards[shardIndex];
}

const prisma = getShardConnection(userId);
await prisma.medication.findMany({ where: { userId } });
```

---

## Заключение

База данных Med Reminder Bot спроектирована с учётом:
- ✅ **Целостности данных** (constraints, foreign keys)
- ✅ **Производительности** (индексы, оптимизированные запросы)
- ✅ **Надёжности** (транзакции, backup)
- ✅ **Масштабируемости** (готовность к росту)

Текущая схема оптимальна для **10-100k пользователей**. При дальнейшем росте можно добавить read replicas, sharding или перейти на микросервисную архитектуру с отдельными БД для каждого сервиса.

---

**Версия документа**: 2.0  
**Последнее обновление**: 15 октября 2025
