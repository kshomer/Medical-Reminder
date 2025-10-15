# 💊 Med Reminder Bot

> Telegram-бот для напоминаний о приёме лекарств с автоматическими уведомлениями и отслеживанием выполнения

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16.x-blue)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 📖 О проекте

**Med Reminder Bot** помогает пользователям не забывать о приёме лекарств. Бот отправляет напоминания в заданное время, отслеживает выполнение и предоставляет статистику соблюдения режима.

### Целевая аудитория
- Пользователи с хроническими заболеваниями
- Люди, проходящие курс лечения
- Все, кто принимает витамины или БАДы по расписанию

### Ключевые возможности
- ⏰ Автоматические напоминания в нужное время
- 📅 Гибкое расписание (ежедневно, по дням недели, через N дней)
- ✅ Отслеживание приёма лекарств
- 📊 Статистика соблюдения режима
- 🔔 Повторные напоминания при пропуске
- 📝 История приёмов

---

## 🚀 Quick Start

### Предварительные требования
- Node.js 20.x или выше
- PostgreSQL 16.x
- Telegram Bot Token (получить у [@BotFather](https://t.me/botfather))

### Установка

```bash
# Клонирование репозитория
git clone https://github.com/yourusername/med-reminder-bot.git
cd med-reminder-bot

# Установка зависимостей
npm install

# Настройка окружения
cp .env.example .env
# Отредактируйте .env и добавьте свои значения

# Запуск базы данных (Docker)
docker-compose up -d postgres

# Миграция базы данных
npm run prisma:migrate:dev

# Запуск в режиме разработки
npm run dev
```

### Первый запуск

```bash
# Генерация Prisma Client
npm run prisma:generate

# Заполнение тестовыми данными (опционально)
npm run prisma:seed

# Запуск бота
npm start
```

---

## 🛠 Технологический стек

### Backend
- **Node.js 20.x** — runtime окружение
- **TypeScript 5.x** — язык программирования
- **Fastify 4.x** — веб-сервер
- **Telegraf 4.x** — Telegram bot framework

### База данных
- **PostgreSQL 16.x** — основная база данных
- **Prisma 5.x** — ORM с автогенерацией типов

### Инфраструктура
- **Docker** — контейнеризация
- **PM2** — process manager
- **Nginx** — reverse proxy

---

## 📚 Документация

### Для разработчиков
- **[DEVELOPMENT.md](docs/DEVELOPMENT.md)** — как начать разработку, код-стайл, workflow
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** — архитектура системы, компоненты
- **[DATABASE.md](docs/DATABASE.md)** — структура базы данных, модели
- **[TESTING.md](docs/TESTING.md)** — стратегия тестирования

### Функциональность
- **[BOT.md](docs/BOT.md)** — команды бота, FSM сценарии, логика уведомлений
- **[API.md](docs/API.md)** — REST API endpoints, webhooks, queue jobs

### Развёртывание
- **[DEPLOYMENT.md](docs/DEPLOYMENT.md)** — деплой, Docker, мониторинг, backup

### Планирование
- **[ROADMAP.md](docs/ROADMAP.md)** — фазы разработки, MVP критерии, будущие фичи

---

## 📊 Статус проекта

| Фаза | Статус | Дата |
|------|--------|------|
| MVP | 🚧 В разработке | Декабрь 2025 |
| Production | 📋 Планируется | Q1 2026 |

### Текущие метрики MVP
- [ ] Регистрация и базовые команды
- [ ] Добавление лекарств (DAILY частота)
- [ ] Отправка уведомлений
- [ ] Кнопка "Принял"
- [ ] Просмотр списка лекарств
- [ ] Docker setup

---

## 🤝 Участие в разработке

Мы приветствуем вклад в проект! Пожалуйста, ознакомьтесь с [DEVELOPMENT.md](docs/DEVELOPMENT.md) перед началом.

### Процесс
1. Fork репозитория
2. Создайте feature branch (`git checkout -b feature/amazing-feature`)
3. Commit изменений (`git commit -m 'Add amazing feature'`)
4. Push в branch (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

---

## 📝 Лицензия

Этот проект распространяется под лицензией MIT. См. файл [LICENSE](LICENSE) для деталей.

---

## 📞 Контакты

- **Вопросы**: [создайте issue](https://github.com/yourusername/med-reminder-bot/issues)
- **Email**: your.email@example.com
- **Telegram**: [@yourhandle](https://t.me/yourhandle)

---

## 🙏 Благодарности

- [Telegraf](https://telegraf.js.org/) — отличный фреймворк для Telegram ботов
- [Prisma](https://www.prisma.io/) — современный ORM для TypeScript
- [Bull](https://github.com/OptimalBits/bull) — надёжные очереди задач

---

**Версия**: 2.0  
**Последнее обновление**: 15 октября 2025  
**Статус**: Готово к разработке ✅
