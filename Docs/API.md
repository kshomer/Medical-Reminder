# API, Webhooks и Очереди

## REST API (опционально)

API endpoints для будущей веб-панели или мобильного приложения.

### Authentication
```
POST /api/auth/telegram
Body: { initData: string }
Response: { token: string, user: User }
```

### Medications
```
GET    /api/medications          # Список лекарств
POST   /api/medications          # Добавить лекарство
GET    /api/medications/:id      # Детали лекарства
PATCH  /api/medications/:id      # Обновить лекарство
DELETE /api/medications/:id      # Удалить лекарство
```

### Schedules
```
GET    /api/schedules?medicationId=X
POST   /api/schedules
PATCH  /api/schedules/:id
DELETE /api/schedules/:id
```

### Logs
```
GET /api/logs?from=YYYY-MM-DD&to=YYYY-MM-DD
GET /api/logs/stats?period=week|month
```

---

## Webhooks

### Telegram Webhook

```typescript
// server.ts
app.post('/webhook/telegram', async (req, reply) => {
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  
  if (secret !== process.env.WEBHOOK_SECRET) {
    return reply.status(403).send('Forbidden');
  }
  
  await bot.handleUpdate(req.body);
  return reply.status(200).send('OK');
});
```

### Health Check
```typescript
app.get('/health', async (req, reply) => {
  const checks = {
    database: await prisma.$queryRaw`SELECT 1`,
    redis: await redis.ping(),
    telegram: true
  };
  
  const healthy = Object.values(checks).every(Boolean);
  return reply.status(healthy ? 200 : 503).send(checks);
});
```

---

## Bull Queues

### Reminder Queue

```typescript
// queues/reminder.queue.ts
import Queue from 'bull';

export const reminderQueue = new Queue('reminders', {
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT)
  }
});

// Job processor
reminderQueue.process('send-reminder', async (job) => {
  const { userId, medicationId, scheduleId } = job.data;
  
  // Логика отправки уведомления
  await notificationService.sendReminder({
    userId,
    medicationId,
    scheduleId,
    scheduledTime: job.data.scheduledTime
  });
});

// Retry settings
reminderQueue.process('send-reminder', {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000
  }
}, processReminder);
```

### Missed Check Queue

```typescript
export const missedCheckQueue = new Queue('missed-checks', {
  redis: { /*...*/ }
});

missedCheckQueue.process('check-missed', async (job) => {
  const { logId } = job.data;
  
  const log = await prisma.intakeLog.findUnique({
    where: { id: logId }
  });
  
  if (log.status === 'SENT') {
    await prisma.intakeLog.update({
      where: { id: logId },
      data: { status: 'MISSED' }
    });
    
    await bot.telegram.sendMessage(
      log.userId,
      '⚠️ Вы пропустили приём лекарства'
    );
  }
});
```

### Queue Events

```typescript
reminderQueue.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Reminder sent successfully');
});

reminderQueue.on('failed', (job, err) => {
  logger.error({ jobId: job.id, error: err }, 'Reminder failed');
});

reminderQueue.on('stalled', (job) => {
  logger.warn({ jobId: job.id }, 'Job stalled');
});
```

---

**Версия документа**: 2.0  
**Последнее обновление**: 15 октября 2025
filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
});
```

---

## Error Handling

**Централизованная обработка ошибок:**
```typescript
// errors/ApiError.ts
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
  
  static badRequest(message: string) {
    return new ApiError(400, message, 'BAD_REQUEST');
  }
  
  static unauthorized(message: string = 'Unauthorized') {
    return new ApiError(401, message, 'UNAUTHORIZED');
  }
  
  static forbidden(message: string = 'Forbidden') {
    return new ApiError(403, message, 'FORBIDDEN');
  }
  
  static notFound(resource: string) {
    return new ApiError(404, `${resource} not found`, 'NOT_FOUND');
  }
  
  static internal(message: string = 'Internal server error') {
    return new ApiError(500, message, 'INTERNAL_ERROR');
  }
}

// Error handler
app.setErrorHandler((error, req, reply) => {
  if (error instanceof ApiError) {
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message
      }
    });
  }
  
  if (error.validation) {
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.validation
      }
    });
  }
  
  // Unexpected errors
  logger.error({ error, req: req.url }, 'Unhandled error');
  
  return reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message
    }
  });
});
```

---

## Authentication Middleware

```typescript
// middlewares/auth.ts
import jwt from 'jsonwebtoken';

export async function authenticateJWT(req, reply) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Missing or invalid token');
    }
    
    const token = authHeader.substring(7);
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });
    
    if (!user || !user.isActive) {
      throw ApiError.unauthorized('User not found or inactive');
    }
    
    req.user = user;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw ApiError.unauthorized('Invalid token');
    }
    throw error;
  }
}
```

---

## API Versioning

```typescript
// Версионирование через URL
app.register((instance, opts, done) => {
  instance.get('/medications', getMedications);
  instance.post('/medications', createMedication);
  done();
}, { prefix: '/api/v1' });

// Версионирование через заголовки
app.addHook('onRequest', async (req, reply) => {
  const version = req.headers['api-version'] || '1';
  req.apiVersion = version;
});
```

---

## Pagination Helper

```typescript
// utils/pagination.ts
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export async function paginate<T>(
  model: any,
  where: any,
  { page = 1, limit = 20 }: PaginationParams,
  include?: any
): Promise<PaginationResult<T>> {
  const skip = (page - 1) * limit;
  
  const [data, total] = await Promise.all([
    model.findMany({
      where,
      include,
      skip,
      take: limit
    }),
    model.count({ where })
  ]);
  
  const totalPages = Math.ceil(total / limit);
  
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
}

// Использование
const result = await paginate<Medication>(
  prisma.medication,
  { userId, isActive: true },
  { page: 1, limit: 20 },
  { schedules: true }
);
```

---

## Request Logging

```typescript
import { randomUUID } from 'crypto';

// Добавить requestId для трейсинга
app.addHook('onRequest', async (req, reply) => {
  req.id = randomUUID();
});

// Логировать все запросы
app.addHook('onResponse', async (req, reply) => {
  logger.info({
    requestId: req.id,
    method: req.method,
    url: req.url,
    statusCode: reply.statusCode,
    responseTime: reply.getResponseTime()
  }, 'Request completed');
});
```

---

## Caching

```typescript
import Redis from 'ioredis';

const cache = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  db: 1 // Отдельная БД для кэша
});

// Cache middleware
async function cacheMiddleware(req, reply) {
  const cacheKey = `cache:${req.method}:${req.url}`;
  
  const cached = await cache.get(cacheKey);
  if (cached) {
    return reply.send(JSON.parse(cached));
  }
  
  // Сохранить ответ в кэш
  reply.addHook('onSend', async (req, reply, payload) => {
    if (reply.statusCode === 200) {
      await cache.setex(cacheKey, 300, payload); // 5 минут
    }
    return payload;
  });
}

// Использование
app.get('/api/medications', {
  preHandler: [authenticateJWT, cacheMiddleware]
}, getMedications);
```

---

## WebSocket Support (опционально)

```typescript
import fastifyWebsocket from '@fastify/websocket';

app.register(fastifyWebsocket);

app.get('/ws', { websocket: true }, (connection, req) => {
  connection.socket.on('message', async (message) => {
    const data = JSON.parse(message.toString());
    
    if (data.type === 'subscribe') {
      // Подписка на обновления
      const userId = data.userId;
      
      // Отправлять уведомления в реальном времени
      reminderQueue.on('completed', (job) => {
        if (job.data.userId === userId) {
          connection.socket.send(JSON.stringify({
            type: 'reminder_sent',
            data: job.data
          }));
        }
      });
    }
  });
});
```

---

## API Documentation (Swagger)

```typescript
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

app.register(fastifySwagger, {
  swagger: {
    info: {
      title: 'Med Reminder API',
      description: 'API documentation for Med Reminder Bot',
      version: '1.0.0'
    },
    host: 'api.example.com',
    schemes: ['https'],
    consumes: ['application/json'],
    produces: ['application/json'],
    securityDefinitions: {
      Bearer: {
        type: 'apiKey',
        name: 'Authorization',
        in: 'header'
      }
    }
  }
});

app.register(fastifySwaggerUi, {
  routePrefix: '/api/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false
  }
});

// Доступ: http://localhost:3000/api/docs
```

---

## Testing API

### Integration Tests

```typescript
// tests/api/medications.test.ts
import { test } from 'tap';
import { build } from '../helper';

test('GET /api/medications', async (t) => {
  const app = await build(t);
  
  const token = await getAuthToken(app, testUser);
  
  const response = await app.inject({
    method: 'GET',
    url: '/api/medications',
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  
  t.equal(response.statusCode, 200);
  t.ok(Array.isArray(response.json().data));
  t.ok(response.json().meta);
});

test('POST /api/medications', async (t) => {
  const app = await build(t);
  const token = await getAuthToken(app, testUser);
  
  const response = await app.inject({
    method: 'POST',
    url: '/api/medications',
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      name: 'Test Medication',
      startDate: new Date().toISOString(),
      frequency: 'DAILY',
      schedules: [
        { time: '09:00', dosage: '1 таб' }
      ]
    }
  });
  
  t.equal(response.statusCode, 201);
  t.equal(response.json().name, 'Test Medication');
});
```

---

## Performance Optimization

### Database Query Optimization

```typescript
// ❌ N+1 проблема
const medications = await prisma.medication.findMany({
  where: { userId }
});

for (const med of medications) {
  const schedules = await prisma.schedule.findMany({
    where: { medicationId: med.id }
  });
}

// ✅ Eager loading
const medications = await prisma.medication.findMany({
  where: { userId },
  include: {
    schedules: {
      where: { isActive: true }
    }
  }
});

// ✅ Select только нужные поля
const medications = await prisma.medication.findMany({
  where: { userId },
  select: {
    id: true,
    name: true,
    schedules: {
      select: {
        time: true,
        dosage: true
      }
    }
  }
});
```

### Response Compression

```typescript
import fastifyCompress from '@fastify/compress';

app.register(fastifyCompress, {
  global: true,
  threshold: 1024 // Сжимать ответы > 1KB
});
```

---

## Security Best Practices

### Helmet (Security Headers)

```typescript
import helmet from '@fastify/helmet';

app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:']
    }
  }
});
```

### Input Sanitization

```typescript
import sanitize from 'sanitize-html';

function sanitizeInput(input: string): string {
  return sanitize(input, {
    allowedTags: [],
    allowedAttributes: {}
  });
}

// В endpoints
app.post('/api/medications', async (req, reply) => {
  const sanitized = {
    ...req.body,
    name: sanitizeInput(req.body.name),
    description: req.body.description ? sanitizeInput(req.body.description) : null,
    notes: req.body.notes ? sanitizeInput(req.body.notes) : null
  };
  
  // ...
});
```

---

## Monitoring

### Prometheus Metrics

```typescript
import promClient from 'prom-client';

const register = new promClient.Registry();

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

app.addHook('onResponse', async (req, reply) => {
  const duration = reply.getResponseTime() / 1000;
  
  httpRequestDuration
    .labels(req.method, req.routerPath, reply.statusCode.toString())
    .observe(duration);
    
  httpRequestTotal
    .labels(req.method, req.routerPath, reply.statusCode.toString())
    .inc();
});

app.get('/metrics', async (req, reply) => {
  reply.type('text/plain');
  return register.metrics();
});
```

---

**Версия документа**: 2.0  
**Последнее обновление**: 15 октября 2025
