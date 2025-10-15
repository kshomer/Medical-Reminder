# Prisma Database Setup

## Создание миграции базы данных

Перед первым запуском приложения необходимо создать миграцию базы данных.

### Шаг 1: Убедитесь, что PostgreSQL запущен

```bash
# Запуск через Docker
docker-compose up -d postgres

# Или используйте локальный PostgreSQL
# Убедитесь что DATABASE_URL в .env указывает на правильную базу
```

### Шаг 2: Создайте первую миграцию

```bash
# Создание и применение миграции
npm run prisma:migrate:dev

# Введите имя миграции, например: init
```

### Шаг 3: Сгенерируйте Prisma Client

```bash
npm run prisma:generate
```

## Полезные команды

```bash
# Просмотр статуса миграций
npx prisma migrate status

# Применение миграций в продакшене
npx prisma migrate deploy

# Открыть Prisma Studio для просмотра данных
npx prisma studio

# Сброс базы данных (ВНИМАНИЕ: удаляет все данные!)
npx prisma migrate reset
```

## Структура базы данных

- **User** - пользователи бота
- **Medication** - лекарства
- **Schedule** - расписание приема
- **IntakeLog** - лог приемов лекарств
