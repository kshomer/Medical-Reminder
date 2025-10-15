    image: postgres:16-alpine
    container_name: medbot-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: medbot-redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
```

---

## 📊 Мониторинг и логи

### Просмотр логов

```bash
# Все сервисы
docker compose -f docker-compose.production.yml logs -f

# Только приложение
docker compose -f docker-compose.production.yml logs -f app

# Только worker (обработка очередей)
docker compose -f docker-compose.production.yml logs -f worker

# Последние 100 строк
docker compose -f docker-compose.production.yml logs --tail=100

# Логи с временными метками
docker compose -f docker-compose.production.yml logs -f -t
```

### Мониторинг ресурсов

```bash
# Использование CPU/RAM/Network
docker stats

# Детальная информация о контейнере
docker inspect medbot-app

# Процессы внутри контейнера
docker top medbot-app
```

### Health Checks

```bash
# Проверить статус всех сервисов
docker compose -f docker-compose.production.yml ps

# Проверить health endpoint приложения
curl https://yourdomain.com/health

# Проверить PostgreSQL
docker compose -f docker-compose.production.yml exec postgres pg_isready

# Проверить Redis
docker compose -f docker-compose.production.yml exec redis redis-cli ping
```

### Bull Board (Queue Monitoring)

Открыть в браузере: `https://yourdomain.com/admin/queues`

Логин/пароль из `.env.production`:
- Username: `admin` (или значение `BULL_BOARD_USER`)
- Password: значение `BULL_BOARD_PASSWORD`

**Что можно увидеть:**
- Количество ожидающих задач (waiting)
- Активные задачи (active)
- Завершённые задачи (completed)
- Провалившиеся задачи (failed)
- Задержанные задачи (delayed)

---

## 💾 Backup и восстановление

### Автоматический ежедневный backup

Создайте скрипт `/home/medbot/backup.sh`:

```bash
#!/bin/bash

BACKUP_DIR="/home/medbot/med-reminder-bot/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Создать директорию для backup
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
docker compose -f /home/medbot/med-reminder-bot/docker-compose.production.yml \
  exec -T postgres pg_dump -U medbot med_reminder | gzip > \
  $BACKUP_DIR/postgres_backup_$DATE.sql.gz

# Backup Redis (RDB snapshot)
docker compose -f /home/medbot/med-reminder-bot/docker-compose.production.yml \
  exec -T redis redis-cli --no-auth-warning -a $REDIS_PASSWORD BGSAVE

# Копировать Redis dump
docker cp medbot-redis:/data/dump.rdb $BACKUP_DIR/redis_backup_$DATE.rdb

# Удалить старые backups (старше 30 дней)
find $BACKUP_DIR -type f -name "*.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -type f -name "*.rdb" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $DATE"
```

**Сделать скрипт исполняемым:**

```bash
chmod +x /home/medbot/backup.sh
```

**Добавить в crontab (запуск каждый день в 3:00 AM):**

```bash
crontab -e

# Добавить строку:
0 3 * * * /home/medbot/backup.sh >> /home/medbot/backup.log 2>&1
```

### Восстановление из backup

**PostgreSQL:**

```bash
# Список backups
ls -lh /home/medbot/med-reminder-bot/backups/postgres_*.sql.gz

# Восстановить из конкретного backup
gunzip < backups/postgres_backup_20251015_030000.sql.gz | \
  docker compose -f docker-compose.production.yml exec -T postgres \
  psql -U medbot -d med_reminder
```

**Redis:**

```bash
# Остановить Redis
docker compose -f docker-compose.production.yml stop redis

# Скопировать backup в контейнер
docker cp backups/redis_backup_20251015_030000.rdb medbot-redis:/data/dump.rdb

# Запустить Redis
docker compose -f docker-compose.production.yml start redis
```

### Backup на удалённое хранилище (S3/Backblaze)

Установить AWS CLI или rclone:

```bash
# Установить rclone
curl https://rclone.org/install.sh | sudo bash

# Настроить remote (например, Backblaze B2)
rclone config

# Добавить в backup.sh после создания backup:
rclone copy $BACKUP_DIR remote:medbot-backups/ --include "*.gz" --include "*.rdb"
```

---

## 🔄 Обновление приложения

### Процесс обновления

```bash
# 1. Перейти в директорию проекта
cd /home/medbot/med-reminder-bot

# 2. Сделать backup (на всякий случай)
./backup.sh

# 3. Остановить текущую версию
docker compose -f docker-compose.production.yml down

# 4. Получить последние изменения
git pull origin main

# 5. Пересобрать и запустить
docker compose -f docker-compose.production.yml up -d --build

# 6. Применить новые миграции (если есть)
docker compose -f docker-compose.production.yml exec app npx prisma migrate deploy

# 7. Проверить логи
docker compose -f docker-compose.production.yml logs -f app

# 8. Проверить health
curl https://yourdomain.com/health
```

### Zero-downtime deployment (продвинутый)

Используйте blue-green deployment или rolling updates:

```bash
# docker-compose.production.yml (добавить scaling)
services:
  app:
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        delay: 10s
        order: start-first
```

---

## 🛡️ Безопасность

### Firewall настройка

```bash
# Установить UFW
sudo apt install ufw

# Разрешить SSH
sudo ufw allow 22/tcp

# Разрешить HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Включить firewall
sudo ufw enable

# Проверить статус
sudo ufw status
```

### Ограничение доступа к портам

PostgreSQL и Redis должны быть доступны **только** из Docker network:

```yaml
# В docker-compose.production.yml
postgres:
  ports:
    - "127.0.0.1:5432:5432"  # Только localhost
```

### Fail2ban для защиты от брутфорса

```bash
# Установить Fail2ban
sudo apt install fail2ban

# Создать конфигурацию для Nginx
sudo nano /etc/fail2ban/jail.local
```

```ini
[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/medbot_error.log
maxretry = 3
bantime = 3600
```

```bash
# Перезапустить Fail2ban
sudo systemctl restart fail2ban

# Проверить статус
sudo fail2ban-client status
```

### Регулярные обновления

```bash
# Автоматические security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

---

## 📈 Масштабирование

### Горизонтальное масштабирование

При росте пользователей (> 1000):

```yaml
# docker-compose.production.yml
services:
  app:
    deploy:
      replicas: 3  # 3 инстанса приложения
      
  worker:
    deploy:
      replicas: 2  # 2 инстанса worker
```

### Database Read Replicas

Для большой нагрузки на чтение:

```yaml
postgres-replica:
  image: postgres:16-alpine
  environment:
    POSTGRES_MASTER_SERVICE_HOST: postgres
  # Настроить streaming replication
```

### Redis Cluster

Для высокой доступности:

```yaml
redis-cluster:
  image: redis:7-alpine
  command: redis-server --cluster-enabled yes
  deploy:
    replicas: 6
```

---

## 🚨 Troubleshooting

### Приложение не запускается

**Проверить логи:**
```bash
docker compose -f docker-compose.production.yml logs app
```

**Частые причины:**
- Неверный `TELEGRAM_BOT_TOKEN`
- PostgreSQL не доступен (проверить `DATABASE_URL`)
- Redis требует пароль (проверить `REDIS_PASSWORD`)
- Порт 3000 занят (изменить `PORT` в .env)

### Webhook не работает

**Проверить webhook info:**
```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

**Если `last_error_date` не 0:**
- SSL проблема (проверить сертификат)
- Домен недоступен (проверить DNS, firewall)
- Приложение не отвечает (проверить health endpoint)

**Переключиться на polling для дебага:**
```bash
# В .env.production
TELEGRAM_USE_POLLING=true

# Удалить webhook
curl -X POST "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
```

### База данных не подключается

```bash
# Проверить что PostgreSQL запущен
docker compose -f docker-compose.production.yml ps postgres

# Проверить логи PostgreSQL
docker compose -f docker-compose.production.yml logs postgres

# Попробовать подключиться вручную
docker compose -f docker-compose.production.yml exec postgres psql -U medbot -d med_reminder
```

### Redis проблемы

```bash
# Проверить что Redis запущен
docker compose -f docker-compose.production.yml ps redis

# Подключиться к Redis CLI
docker compose -f docker-compose.production.yml exec redis redis-cli -a YOUR_PASSWORD

# Проверить очереди Bull
> KEYS bull:*
> LLEN bull:reminder:wait
```

### High CPU/Memory usage

```bash
# Мониторинг ресурсов
docker stats

# Проверить количество задач в очереди
# Открыть Bull Board: https://yourdomain.com/admin/queues

# Увеличить ресурсы контейнера в docker-compose.yml:
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
```

### Потерялись напоминания

**Проверить Bull queues:**
```bash
# Зайти в Redis
docker compose exec redis redis-cli -a YOUR_PASSWORD

# Проверить задачи
KEYS bull:reminder:*
LLEN bull:reminder:wait
LLEN bull:reminder:delayed
```

**Пересоздать задачи:**
```bash
# Запустить скрипт пересоздания задач
docker compose exec app npm run queues:recreate
```

---

## 📧 Алерты и уведомления

### Настройка email алертов

Установить и настроить `postfix` для отправки email:

```bash
sudo apt install postfix mailutils
sudo dpkg-reconfigure postfix
```

### Telegram алерты для админа

Создать отдельного бота для мониторинга:

```bash
# В .env.production добавить:
ADMIN_TELEGRAM_BOT_TOKEN=your_admin_bot_token
ADMIN_TELEGRAM_CHAT_ID=your_chat_id
```

Отправлять критические алерты:
- Приложение упало
- Database недоступна
- > 100 failed jobs в Bull
- High error rate (> 5%)

---

## 📋 Checklist запуска

- [ ] Сервер настроен (Docker, Nginx, Certbot)
- [ ] Telegram Bot Token получен
- [ ] Репозиторий клонирован
- [ ] `.env.production` настроен с secure паролями
- [ ] Nginx конфигурация создана
- [ ] SSL сертификат получен
- [ ] Docker контейнеры запущены
- [ ] Миграции БД применены
- [ ] Webhook установлен
- [ ] Health check проходит
- [ ] Тестовое сообщение `/start` работает
- [ ] Backup скрипт настроен и протестирован
- [ ] Мониторинг (Bull Board) доступен
- [ ] Firewall настроен
- [ ] Fail2ban настроен
- [ ] Документация прочитана командой

---

## 🔗 Полезные ссылки

- **Telegram Bot API**: https://core.telegram.org/bots/api
- **Prisma Docs**: https://www.prisma.io/docs
- **Bull Docs**: https://github.com/OptimalBits/bull
- **Docker Compose**: https://docs.docker.com/compose/
- **Nginx**: https://nginx.org/en/docs/
- **Let's Encrypt**: https://letsencrypt.org/

---

**Версия документа**: 1.0  
**Последнее обновление**: 15 октября 2025  
**Для вопросов**: admin@med-reminder-bot.com