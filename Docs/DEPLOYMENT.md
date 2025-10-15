# Развёртывание и инфраструктура

## Docker Setup

### Dockerfile

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci
COPY . .
RUN npm run build
RUN npx prisma generate

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["npm", "start"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    restart: always
    environment:
      NODE_ENV: production
    env_file:
      - .env.production
    depends_on:
      - postgres
      - redis
    networks:
      - app-network

  postgres:
    image: postgres:16-alpine
    restart: always
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./backups:/backups
    environment:
      POSTGRES_DB: med_reminder
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    networks:
      - app-network

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    networks:
      - app-network

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app
    networks:
      - app-network

volumes:
  postgres-data:
  redis-data:

networks:
  app-network:
    driver: bridge
```

---

## Деплой на VPS

### 1. Подготовка сервера

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Установка Docker Compose
sudo apt install docker-compose -y
```

### 2. Клонирование и настройка

```bash
# Клонирование
git clone https://github.com/yourusername/med-reminder-bot.git
cd med-reminder-bot

# Настройка окружения
cp .env.example .env.production
nano .env.production  # Заполнить реальные значения
```

### 3. SSL сертификат

```bash
# Установка Certbot
sudo apt install certbot -y

# Получение сертификата
sudo certbot certonly --standalone -d yourdomain.com

# Копирование сертификатов
sudo cp /etc/letsencrypt/live/yourdomain.com/* ./ssl/
```

### 4. Запуск

```bash
# Сборка и запуск
docker-compose up -d --build

# Миграция БД
docker-compose exec app npm run prisma:migrate:deploy

# Установка webhook
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://yourdomain.com/webhook/telegram"}'
```

---

## Мониторинг

### Логирование

```typescript
// utils/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});
```

### Метрики

```typescript
// Prometheus metrics
import promClient from 'prom-client';

const notificationsSent = new promClient.Counter({
  name: 'notifications_sent_total',
  help: 'Total notifications sent'
});

const queueLength = new promClient.Gauge({
  name: 'queue_length',
  help: 'Current queue length'
});
```

---

## Backup

### Автоматический backup

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"
FILENAME="med_reminder_$DATE.sql.gz"

docker-compose exec -T postgres pg_dump -U postgres med_reminder | gzip > "$BACKUP_DIR/$FILENAME"

# Удаление старых (>30 дней)
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup completed: $FILENAME"
```

### Cron

```bash
crontab -e
# Добавить:
0 3 * * * /path/to/backup.sh >> /var/log/backup.log 2>&1
```

### Восстановление

```bash
gunzip < /backups/med_reminder_20251015_030000.sql.gz | \
docker-compose exec -T postgres psql -U postgres med_reminder
```

---

## CI/CD с GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Deploy to VPS
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /app/med-reminder-bot
            git pull
            docker-compose up -d --build
            docker-compose exec app npm run prisma:migrate:deploy
```

---

**Версия документа**: 2.0  
**Последнее обновление**: 15 октября 2025
BACKUP_FILE" | \
docker-compose -f docker-compose.production.yml exec -T postgres psql -U postgres med_reminder

# Checkout previous commit
echo "📂 Rolling back code..."
git checkout HEAD~1

# Rebuild and start
echo "🔨 Rebuilding containers..."
docker-compose -f docker-compose.production.yml up -d --build

# Check health
echo "🏥 Checking health..."
sleep 10

for i in {1..10}; do
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        echo "✅ Rollback successful!"
        exit 0
    fi
    sleep 2
done

echo "❌ Rollback failed"
exit 1
```

---

## Monitoring Setup

### Prometheus Configuration

**docker/prometheus.yml:**
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'med-reminder-app'
    static_configs:
      - targets: ['app:3000']
    metrics_path: '/metrics'

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres:5432']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']

  - job_name: 'nginx'
    static_configs:
      - targets: ['nginx:80']
```

### Grafana Dashboard

**docker/grafana-dashboards/med-reminder.json:**
```json
{
  "dashboard": {
    "title": "Med Reminder Bot",
    "panels": [
      {
        "title": "HTTP Request Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])"
          }
        ]
      },
      {
        "title": "Response Time",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))"
          }
        ]
      },
      {
        "title": "Queue Length",
        "targets": [
          {
            "expr": "queue_length"
          }
        ]
      },
      {
        "title": "Database Connections",
        "targets": [
          {
            "expr": "pg_stat_database_numbackends"
          }
        ]
      }
    ]
  }
}
```

---

## Alerting (Prometheus Alertmanager)

### docker/alertmanager.yml

```yaml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'telegram'

receivers:
  - name: 'telegram'
    telegram_configs:
      - bot_token: 'YOUR_BOT_TOKEN'
        chat_id: YOUR_ADMIN_CHAT_ID
        parse_mode: 'HTML'
        message: |
          <b>{{ .GroupLabels.alertname }}</b>
          {{ range .Alerts }}
          Status: {{ .Status }}
          {{ range .Labels.SortedPairs }}{{ .Name }}: {{ .Value }}
          {{ end }}
          {{ range .Annotations.SortedPairs }}{{ .Name }}: {{ .Value }}
          {{ end }}
          {{ end }}

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname']
```

### Alert Rules

**docker/alert-rules.yml:**
```yaml
groups:
  - name: med_reminder_alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} requests/sec"

      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High response time"
          description: "95th percentile response time is {{ $value }}s"

      - alert: QueueBacklog
        expr: queue_length > 1000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Queue backlog detected"
          description: "Queue has {{ $value }} pending jobs"

      - alert: DatabaseDown
        expr: up{job="postgres"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Database is down"

      - alert: RedisDown
        expr: up{job="redis"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Redis is down"

      - alert: HighMemoryUsage
        expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value | humanizePercentage }}"
```

---

## Backup Strategy

### Automated Backup Script

**scripts/backup-db.sh:**
```bash
#!/bin/bash

# Configuration
BACKUP_DIR="/backups"
RETENTION_DAYS=30
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="med_reminder_${DATE}.sql.gz"

# Create backup
docker-compose exec -T postgres pg_dump -U postgres -Fc med_reminder | gzip > "${BACKUP_DIR}/${FILENAME}"

# Check backup size
BACKUP_SIZE=$(du -h "${BACKUP_DIR}/${FILENAME}" | cut -f1)
echo "✅ Backup created: ${FILENAME} (${BACKUP_SIZE})"

# Upload to S3 (опционально)
if [ -n "$AWS_S3_BUCKET" ]; then
    aws s3 cp "${BACKUP_DIR}/${FILENAME}" "s3://${AWS_S3_BUCKET}/backups/${FILENAME}"
    echo "☁️  Uploaded to S3"
fi

# Delete old backups
find ${BACKUP_DIR} -name "med_reminder_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
echo "🧹 Deleted backups older than ${RETENTION_DAYS} days"

# Verify backup
gunzip -t "${BACKUP_DIR}/${FILENAME}"
if [ $? -eq 0 ]; then
    echo "✅ Backup verification successful"
else
    echo "❌ Backup verification failed!"
    # Send alert
    curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -d "chat_id=${ADMIN_CHAT_ID}" \
        -d "text=⚠️ Database backup verification failed!"
    exit 1
fi
```

### Restore Script

**scripts/restore-db.sh:**
```bash
#!/bin/bash

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: ./restore-db.sh <backup_file>"
    exit 1
fi

echo "⚠️  WARNING: This will replace the current database!"
read -p "Are you sure? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted"
    exit 0
fi

# Stop application
echo "⏸️  Stopping application..."
docker-compose down app

# Drop and recreate database
echo "🗄️  Recreating database..."
docker-compose exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS med_reminder;"
docker-compose exec -T postgres psql -U postgres -c "CREATE DATABASE med_reminder;"

# Restore backup
echo "📥 Restoring backup..."
gunzip < "$BACKUP_FILE" | docker-compose exec -T postgres pg_restore -U postgres -d med_reminder

# Start application
echo "▶️  Starting application..."
docker-compose up -d

echo "✅ Restore completed"
```

### Cron Jobs

```bash
crontab -e

# Daily backup at 3 AM
0 3 * * * /opt/med-reminder-bot/scripts/backup-db.sh >> /var/log/backup.log 2>&1

# Weekly full backup to S3 (Sunday 4 AM)
0 4 * * 0 AWS_S3_BUCKET=my-bucket /opt/med-reminder-bot/scripts/backup-db.sh >> /var/log/backup.log 2>&1

# Clean old logs (daily at 2 AM)
0 2 * * * find /var/log/nginx -name "*.log" -mtime +7 -delete

# Check disk space (every 6 hours)
0 */6 * * * df -h | grep -E "/$|/backups" | awk '{if($5+0 > 80) print "⚠️ Disk usage high: "$0}' | xargs -I {} curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" -d "chat_id=${ADMIN_CHAT_ID}" -d "text={}"
```

---

## Log Management

### Logrotate Configuration

**/etc/logrotate.d/med-reminder:**
```
/var/log/nginx/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        docker-compose -f /opt/med-reminder-bot/docker-compose.production.yml exec nginx nginx -s reload
    endscript
}

/opt/med-reminder-bot/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 nodejs nodejs
}
```

### Centralized Logging (ELK Stack - опционально)

**docker-compose.logging.yml:**
```yaml
version: '3.8'

services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    volumes:
      - elasticsearch-data:/usr/share/elasticsearch/data
    networks:
      - app-network

  logstash:
    image: docker.elastic.co/logstash/logstash:8.11.0
    volumes:
      - ./docker/logstash.conf:/usr/share/logstash/pipeline/logstash.conf
    depends_on:
      - elasticsearch
    networks:
      - app-network

  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    ports:
      - "5601:5601"
    environment:
      ELASTICSEARCH_HOSTS: http://elasticsearch:9200
    depends_on:
      - elasticsearch
    networks:
      - app-network

volumes:
  elasticsearch-data:
```

---

## SSL Certificate Management

### Auto-renewal with Certbot

**scripts/renew-ssl.sh:**
```bash
#!/bin/bash

# Renew certificate
certbot renew --quiet --post-hook "docker-compose -f /opt/med-reminder-bot/docker-compose.production.yml exec nginx nginx -s reload"

# Copy to Docker volume
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem /opt/med-reminder-bot/ssl/
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem /opt/med-reminder-bot/ssl/

echo "✅ SSL certificate renewed"
```

**Cron:**
```bash
# Check for renewal twice daily
0 0,12 * * * /opt/med-reminder-bot/scripts/renew-ssl.sh >> /var/log/ssl-renew.log 2>&1
```

---

## Performance Tuning

### PostgreSQL Optimization

**docker/postgres-init.sql:**
```sql
-- Performance settings
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_io_concurrency = 200;
ALTER SYSTEM SET work_mem = '4MB';
ALTER SYSTEM SET min_wal_size = '1GB';
ALTER SYSTEM SET max_wal_size = '4GB';

-- Connection pooling
ALTER SYSTEM SET max_connections = 100;

-- Logging
ALTER SYSTEM SET log_min_duration_statement = 1000; -- Log slow queries (>1s)
ALTER SYSTEM SET log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h ';

-- Reload configuration
SELECT pg_reload_conf();
```

### Redis Optimization

```bash
# In docker-compose.production.yml, Redis command:
redis-server \
  --appendonly yes \
  --appendfsync everysec \
  --maxmemory 256mb \
  --maxmemory-policy allkeys-lru \
  --save 900 1 \
  --save 300 10 \
  --save 60 10000 \
  --tcp-backlog 511 \
  --timeout 300
```

---

## Security Hardening

### Firewall (UFW)

```bash
# Allow SSH
ufw allow 22/tcp

# Allow HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Allow Prometheus (только с определённых IP)
ufw allow from 10.0.0.0/8 to any port 9090

# Enable firewall
ufw enable
```

### Fail2ban

**/etc/fail2ban/jail.local:**
```ini
[nginx-req-limit]
enabled = true
filter = nginx-req-limit
action = iptables-multiport[name=ReqLimit, port="http,https"]
logpath = /var/log/nginx/error.log
findtime = 600
bantime = 7200
maxretry = 10
```

**/etc/fail2ban/filter.d/nginx-req-limit.conf:**
```ini
[Definition]
failregex = limiting requests, excess:.* by zone.*client: <HOST>
ignoreregex =
```

### Docker Security

```bash
# Run Docker daemon with security options
# /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "live-restore": true,
  "userland-proxy": false,
  "no-new-privileges": true
}
```

---

## Disaster Recovery Plan

### RTO/RPO Targets
- **RTO (Recovery Time Objective)**: 1 hour
- **RPO (Recovery Point Objective)**: 24 hours

### Recovery Procedures

1. **Database Corruption:**
   ```bash
   # Restore from last backup
   ./scripts/restore-db.sh /backups/med_reminder_latest.sql.gz
   ```

2. **Server Failure:**
   ```bash
   # On new server
   git clone https://github.com/yourusername/med-reminder-bot.git
   cd med-reminder-bot
   cp /backup-location/.env.production ./
   ./deploy.sh
   ./scripts/restore-db.sh /backup-location/latest-backup.sql.gz
   ```

3. **Redis Data Loss:**
   ```bash
   # Redis data is not critical (can be rebuilt)
   # Restart Redis
   docker-compose restart redis
   
   # Recreate jobs
   docker-compose exec app npm run rebuild-jobs
   ```

---

## Troubleshooting Guide

### Common Issues

**Problem: Container won't start**
```bash
# Check logs
docker-compose logs app

# Check health
docker-compose ps

# Restart specific service
docker-compose restart app
```

**Problem: High memory usage**
```bash
# Check container stats
docker stats

# Check PostgreSQL connections
docker-compose exec postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# Check Redis memory
docker-compose exec redis redis-cli INFO memory
```

**Problem: Webhook not working**
```bash
# Check webhook info
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo

# Check nginx logs
docker-compose logs nginx | tail -100

# Test webhook endpoint
curl -X POST https://yourdomain.com/webhook/telegram \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

**Problem: Jobs not processing**
```bash
# Check Bull queue
docker-compose exec app node -e "
const Queue = require('bull');
const q = new Queue('reminders', 'redis://redis:6379');
q.getJobCounts().then(console.log);
"

# Check Redis connection
docker-compose exec redis redis-cli PING

# Restart workers
docker-compose restart app
```

---

**Версия документа**: 2.0  
**Последнее обновление**: 15 октября 2025
