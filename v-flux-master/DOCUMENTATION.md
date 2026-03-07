# V-Flux Master Backend -- Документация

---

## 1. Обзор проекта

V-Flux Master Backend -- центральный управляющий сервер VPN-сервиса V-Flux. Управляет пользователями, подписками, VPN-нодами и предоставляет интерфейс через Telegram-бота и веб-админку.

### Архитектура

```
+------------------+       +-------------------+       +------------------+
|  Telegram Bot    | <---> |  Master Backend   | <---> |  VPN Node 1      |
|  (Webhook)       |       |  (Express 5)      |       |  (V-Flux Core)   |
+------------------+       |                   |       +------------------+
                           |  PostgreSQL       |       +------------------+
+------------------+       |  Workers (Cron)   | <---> |  VPN Node 2      |
|  Admin Panel     | <---> |                   |       |  (V-Flux Core)   |
|  (React SPA)     |       +-------------------+       +------------------+
+------------------+                                   +------------------+
                                                       |  VPN Node N...   |
+------------------+                                   +------------------+
|  VPN-клиент      | ----> GET /sub/:token
|  (V2Box и др.)   |       (VLESS конфиг)
+------------------+
```

### Компоненты

| Компонент | Технология | Назначение |
|-----------|-----------|------------|
| HTTP-сервер | Express 5 | API для нод, админки, подписок |
| Telegram Bot | node-telegram-bot-api (Webhook) | Интерфейс пользователя |
| Admin Panel | React (SPA) | Мониторинг и управление |
| База данных | PostgreSQL + Sequelize ORM | Хранение данных |
| Workers | node-cron | Health check, сбор трафика, проверка подписок |

### Структура проекта

```
v-flux-master/
  src/
    app.js              -- Express приложение, маршруты, middleware
    server.js           -- Запуск сервера и воркеров
    bot.js              -- Инициализация Telegram бота
    routes/
      subRouter.js      -- Выдача VPN конфигов клиентам
      nodeSyncRouter.js -- Синхронизация нод
      adminNodesRouter.js -- Админ API: ноды
      adminUsersRouter.js -- Админ API: пользователи
    middleware/
      ipWhitelist.js    -- Фильтрация по IP
      adminAuth.js      -- Bearer-авторизация админки
      rateLimiter.js    -- Rate limiting
    services/
      nodeService.js    -- Взаимодействие с VPN-нодами
      referralService.js -- Реферальные награды
    workers/
      healthChecker.js  -- Проверка здоровья нод (5 мин)
      trafficCollector.js -- Сбор трафика (30 мин)
      subscriptionChecker.js -- Проверка истекших подписок (1 час)
    commands/            -- Обработчики команд бота
    locales/             -- Мультиязычные переводы
    utils/
      nodeApi.js         -- Фабрика axios для запросов к нодам
  db/
    models/              -- Sequelize модели
    migrations/          -- Миграции БД
    seeders/             -- Начальные данные
  admin-panel/           -- React админ-панель (исходники)
  public/admin/          -- Собранная админ-панель (static)
```

---

## 2. API Endpoints

### 2.1. GET /sub/:token

**Назначение:** Выдача VLESS-конфига VPN-клиенту. Вызывается автоматически приложениями V2Box, v2rayNG и др. каждый час.

**Авторизация:** Нет (токен в URL -- это `sub_token` пользователя).

**Rate Limit:** 30 запросов/мин на IP.

**Параметры запроса:**

| Параметр | Тип | Описание |
|----------|-----|----------|
| `token` | string (path) | Уникальный токен подписки пользователя (`sub_token` из БД) |

**Логика балансировки:**
1. Фильтр: убираем ноды где `user_count >= max_users` (нет места)
2. Сортировка: из оставшихся -- минимум `active_connections`
3. Fallback: все полные -- берем ноду с минимум коннектов
4. Fallback: кеш пуст (первый запуск) -- случайная нода

**Формат ответа:**

- `200 OK` -- Base64-закодированный VLESS-конфиг (text/plain)
- `200 OK` (пустой) -- подписка истекла или не найдена
- `404 Not Found` (пустой) -- пользователь не найден
- `503 Service Unavailable` (пустой) -- нет активных нод

**Заголовки ответа:**

```
Content-Type: text/plain; charset=utf-8
Subscription-Userinfo: upload=0; download={traffic_used}; total={traffic_limit}; expire={unix_timestamp}
```

> Для платных подписок заголовок `Subscription-Userinfo` содержит только `expire`. Для триала -- полную статистику трафика.

**Пример:**

```bash
curl http://localhost:3000/sub/a1b2c3d4e5f6...

# Ответ (Base64):
# dmxlc3M6Ly91dWlkQGRvbWFpbi5jb206NDQzP3R5cGU9d3Mmc2VjdXJpdHk9dGxzJnBhdGg9JTJGdmZsdXgmZW5jcnlwdGlvbj1ub25lI1YtRmx1eC1OZXRoZXJsYW5kcw==

# Декодированный VLESS:
# vless://uuid@domain.com:443?type=ws&security=tls&path=%2Fvflux&encryption=none#V-Flux-Netherlands
```

---

### 2.2. GET /api/nodes/sync

**Назначение:** Нода дергает при старте/рестарте для получения полного списка активных пользователей. После рестарта нода теряет пользователей из памяти.

**Авторизация:** Bearer token ноды (`Authorization: Bearer {node_token}`).

**IP Whitelist:** Только IP-адреса из поля `host` таблицы `Nodes`.

**Параметры запроса:** Нет.

**Формат ответа:**

```json
{
  "users": [
    {
      "uuid": "550e8400-e29b-41d4-a716-446655440000",
      "traffic_limit": 5368709120,
      "throttled": false
    }
  ]
}
```

**Побочный эффект:** Обновляет `last_health_at` ноды.

**Пример:**

```bash
curl -H "Authorization: Bearer test-node-token-123" \
     http://localhost:3000/api/nodes/sync
```

---

### 2.3. GET /api/admin/nodes

**Назначение:** Получить список всех нод.

**Авторизация:** Bearer token админа (`Authorization: Bearer {ADMIN_TOKEN}`).

**IP Whitelist:** Только IP из `ADMIN_ALLOWED_IPS` (.env).

**Rate Limit:** 60 запросов/мин на IP.

**Формат ответа:**

```json
{
  "nodes": [
    {
      "id": 1,
      "name": "NL-1",
      "host": "1.2.3.4",
      "port": 8080,
      "token": "secret-token",
      "domain": "nl1.v-flux.com",
      "location": "Netherlands",
      "max_users": 250,
      "bandwidth_mbps": 1000,
      "active": true,
      "last_health_at": "2026-03-07T12:00:00.000Z",
      "createdAt": "2026-02-26T17:00:00.000Z",
      "updatedAt": "2026-03-07T12:00:00.000Z"
    }
  ]
}
```

---

### 2.4. GET /api/admin/nodes/stats

**Назначение:** Полная статистика по всем активным нодам + общая статистика из БД. Делает live-запрос к каждой ноде (`GET /stats`).

**Авторизация:** Bearer token админа.

**IP Whitelist:** Только IP из `ADMIN_ALLOWED_IPS`.

**Формат ответа:**

```json
{
  "nodes": [
    {
      "id": 1,
      "name": "NL-1",
      "location": "Netherlands",
      "users_on_node": 150,
      "users_online": 42,
      "total_connections": 856,
      "current_speed_rx": "125.3 Mbps",
      "current_speed_tx": "89.7 Mbps",
      "uptime": "15d 6h",
      "bandwidth_mbps": 1000,
      "online_details": [
        {
          "uuid": "550e8400-...",
          "connections": 24,
          "throttled": false
        }
      ]
    }
  ],
  "db": {
    "total_users": 1250,
    "active_subscriptions": 830,
    "expired_subscriptions": 420
  }
}
```

---

### 2.5. POST /api/admin/nodes

**Назначение:** Добавить новую ноду.

**Авторизация:** Bearer token админа.

**Параметры запроса (JSON body):**

| Поле | Тип | Обязательное | Описание |
|------|-----|:------------:|----------|
| `name` | string | да | Имя ноды |
| `host` | string | да | IP-адрес ноды |
| `port` | integer | да | Порт API ноды |
| `token` | string | да | Bearer-токен для доступа к ноде |
| `domain` | string | да | Домен для VLESS-конфигов |
| `location` | string | нет | Локация (напр. "Netherlands") |
| `max_users` | integer | нет | Макс. юзеров (по умолчанию 250) |

**Формат ответа:** `201 Created`

```json
{
  "node": {
    "id": 2,
    "name": "DE-1",
    "host": "5.6.7.8",
    "port": 8080,
    "token": "new-token",
    "domain": "de1.v-flux.com",
    "location": "Germany",
    "max_users": 250,
    "active": true
  }
}
```

**Пример:**

```bash
curl -X POST http://localhost:3000/api/admin/nodes \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"DE-1","host":"5.6.7.8","port":8080,"token":"new-token","domain":"de1.v-flux.com","location":"Germany"}'
```

---

### 2.6. PATCH /api/admin/nodes/:id

**Назначение:** Обновить параметры ноды.

**Авторизация:** Bearer token админа.

**Параметры запроса (JSON body):**

Допустимые поля: `name`, `host`, `port`, `token`, `domain`, `location`, `max_users`, `active`.

**Формат ответа:** `200 OK`

```json
{
  "node": { "id": 1, "name": "NL-1-updated", "..." : "..." }
}
```

**Пример:**

```bash
curl -X PATCH http://localhost:3000/api/admin/nodes/1 \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"active": false}'
```

---

### 2.7. DELETE /api/admin/nodes/:id

**Назначение:** Удалить ноду из БД.

**Авторизация:** Bearer token админа.

**Формат ответа:** `200 OK`

```json
{
  "message": "Node NL-1 deleted"
}
```

---

### 2.8. GET /api/admin/nodes/:id/users

**Назначение:** Получить список онлайн-пользователей на конкретной ноде. Делает live-запрос к ноде и обогащает данными из БД.

**Авторизация:** Bearer token админа.

**Формат ответа:**

```json
{
  "node": "NL-1",
  "online": 3,
  "users": [
    {
      "uuid": "550e8400-...",
      "active_connections": 24,
      "throttled": false,
      "bytes_up": 1048576,
      "bytes_down": 52428800,
      "username": "john_doe",
      "first_name": "John",
      "telegram_id": 123456789,
      "region": "ru",
      "plan": "Monthly",
      "traffic_used": 1073741824,
      "traffic_limit": 161061273600,
      "expires_at": "2026-04-07T00:00:00.000Z",
      "online": true
    }
  ]
}
```

---

### 2.9. GET /api/admin/users

**Назначение:** Получить список всех пользователей с активными подписками.

**Авторизация:** Bearer token админа.

**Формат ответа:**

```json
{
  "users": [
    {
      "id": 1,
      "telegram_id": 123456789,
      "username": "john_doe",
      "first_name": "John",
      "lang": "ru",
      "region": "ru",
      "plan": "Monthly",
      "active": true,
      "expires_at": "2026-04-07T00:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

### 2.10. GET /api/admin/users/:id

**Назначение:** Детальная информация о пользователе, включая все подписки и платежи.

**Авторизация:** Bearer token админа.

**Формат ответа:**

```json
{
  "user": {
    "id": 1,
    "telegram_id": 123456789,
    "username": "john_doe",
    "Subscriptions": [
      {
        "id": 1,
        "plan_id": 2,
        "active": true,
        "expires_at": "2026-04-07T00:00:00.000Z",
        "traffic_used": 1073741824,
        "traffic_limit": 161061273600,
        "Plan": { "name": "Monthly" }
      }
    ],
    "Payments": []
  }
}
```

---

### 2.11. DELETE /api/admin/users/:id

**Назначение:** Удалить пользователя. Снимает с всех VPN-нод, деактивирует подписки, удаляет из БД.

**Авторизация:** Bearer token админа.

**Логика:**
1. `removeUserFromAllNodes(uuid)` -- удаление с нод
2. Деактивация всех подписок (`active = false`)
3. Удаление записи пользователя из БД

**Формат ответа:**

```json
{
  "message": "User 123456789 deleted and removed from all nodes"
}
```

---

### 2.12. POST /api/admin/users/:id/subscription

**Назначение:** Выдать подписку пользователю вручную (админом).

**Авторизация:** Bearer token админа.

**Параметры запроса (JSON body):**

| Поле | Тип | Обязательное | Описание |
|------|-----|:------------:|----------|
| `plan_id` | integer | да | ID тарифного плана |
| `days` | integer | нет | Кол-во дней (по умолчанию = `plan.duration_days`) |

**Логика:**
1. Ищет старую активную подписку
2. Деактивирует старые подписки
3. Если старая подписка еще не истекла -- продлевает от `expires_at`, иначе от текущей даты
4. Создает новую подписку
5. `syncUserOnAllNodes` -- добавляет/обновляет юзера на всех нодах

**Формат ответа:** `201 Created`

```json
{
  "subscription": {
    "id": 5,
    "user_id": 1,
    "plan_id": 2,
    "active": true,
    "expires_at": "2026-05-07T00:00:00.000Z",
    "traffic_limit": 161061273600,
    "traffic_used": 0,
    "throttled": false
  }
}
```

---

### 2.13. POST /bot{TOKEN} (Webhook)

**Назначение:** Webhook для получения обновлений от Telegram. Telegram отправляет сюда все сообщения и callback-запросы.

**Rate Limit:** 300 запросов/мин на IP.

**Авторизация:** Токен бота в URL (известен только Telegram).

**Формат ответа:** `200 OK` (всегда).

---

## 3. Безопасность

### 3.1. IP Whitelist для нод

**Файл:** `src/middleware/ipWhitelist.js` -- `nodeIpWhitelist`

Применяется к маршрутам `/api/nodes/*`. Запрашивает все ноды из БД и разрешает доступ только с IP, указанных в поле `host` таблицы `Nodes`.

```
Запрос -> Извлечь client IP -> Запросить Node.findAll({attributes: ['host']}) -> Совпадает? -> next()
                                                                                  Нет -> 403 Forbidden
```

> IPv6-mapped IPv4-адреса нормализуются: `::ffff:1.2.3.4` -> `1.2.3.4`.

### 3.2. IP Whitelist для админки

**Файл:** `src/middleware/ipWhitelist.js` -- `adminIpWhitelist`

Применяется к маршрутам `/api/admin/*`. IP-адреса задаются в `.env`:

```
ADMIN_ALLOWED_IPS=1.2.3.4,5.6.7.8
```

Если `ADMIN_ALLOWED_IPS` пуст -- фильтрация отключена (доступ с любого IP).

### 3.3. Rate Limiting

**Файл:** `src/middleware/rateLimiter.js`

| Лимитер | Маршруты | Лимит | Окно |
|---------|----------|-------|------|
| `subLimiter` | `/sub/*` | 30 запросов | 1 минута |
| `adminLimiter` | `/api/admin/*` | 60 запросов | 1 минута |
| `botLimiter` | `/bot{TOKEN}` | 300 запросов | 1 минута |

Используются стандартные заголовки `RateLimit-*`, без устаревших `X-RateLimit-*`.

### 3.4. Bearer Token авторизация

**Файл:** `src/middleware/adminAuth.js`

Все маршруты `/api/admin/*` требуют заголовок:

```
Authorization: Bearer {ADMIN_TOKEN}
```

Токен сравнивается с `process.env.ADMIN_TOKEN`. При несовпадении -- `403 Forbidden`.

Ноды авторизуются аналогично -- Bearer token проверяется в `nodeSyncRouter.js` по полю `token` таблицы `Nodes`.

### 3.5. Helmet и CORS

```javascript
app.use(helmet());  // Заголовки безопасности (X-Content-Type-Options, X-Frame-Options и др.)
app.use(cors());    // CORS разрешен для всех origin
```

### 3.6. Секретный путь админки

Админ-панель (React SPA) доступна по секретному пути:

```
/cpanel-9f2k
```

Статические файлы отдаются из `public/admin/`. Все подмаршруты возвращают `index.html` (SPA fallback с wildcard роутом Express 5: `{*path}`).

---

## 4. База данных

### 4.1. Модель User (таблица `Users`)

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | INTEGER | PK, auto-increment | |
| `telegram_id` | BIGINT | NOT NULL, UNIQUE, INDEX | Telegram user ID |
| `username` | STRING | nullable | Telegram username |
| `first_name` | STRING | nullable | Имя в Telegram |
| `last_name` | STRING | nullable | Фамилия в Telegram |
| `uuid` | STRING | NOT NULL, UNIQUE, INDEX | UUID для VLESS-конфига |
| `sub_token` | STRING | NOT NULL, UNIQUE, INDEX | Токен для ссылки подписки |
| `lang` | STRING(5) | NOT NULL, default: `'en'` | Язык интерфейса |
| `region` | STRING(5) | nullable | Регион для ценообразования |
| `referral_code` | STRING(10) | NOT NULL, UNIQUE, INDEX | Код для реферальной ссылки |
| `referred_by` | INTEGER | FK -> Users(id), ON DELETE SET NULL | Кто пригласил |
| `createdAt` | DATE | NOT NULL | |
| `updatedAt` | DATE | NOT NULL | |

**Связи:**
- `User.hasMany(Subscription)` -- через `user_id`
- `User.hasMany(Payment)` -- через `user_id`
- `User.belongsTo(User, as: 'referrer')` -- через `referred_by`
- `User.hasMany(ReferralReward, as: 'rewards')` -- через `referrer_id`

---

### 4.2. Модель Plan (таблица `Plans`)

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | INTEGER | PK, auto-increment | |
| `name` | STRING | NOT NULL, UNIQUE | Название плана |
| `duration_days` | INTEGER | NOT NULL | Длительность в днях |
| `traffic_limit_bytes` | BIGINT | NOT NULL | Лимит трафика в байтах |
| `is_trial` | BOOLEAN | NOT NULL, default: `false` | Триальный план |
| `active` | BOOLEAN | NOT NULL, default: `true` | Доступен для покупки |
| `createdAt` | DATE | NOT NULL | |
| `updatedAt` | DATE | NOT NULL | |

**Связи:**
- `Plan.hasMany(Subscription)` -- через `plan_id`
- `Plan.hasMany(PlanPrice)` -- через `plan_id`

---

### 4.3. Модель PlanPrice (таблица `PlanPrices`)

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | INTEGER | PK, auto-increment | |
| `plan_id` | INTEGER | NOT NULL, FK -> Plans(id), ON DELETE CASCADE | |
| `region` | STRING(5) | NOT NULL | Регион (ru, uae, tr, uz) |
| `price` | INTEGER | NOT NULL | Цена |
| `currency` | STRING(3) | NOT NULL | Валюта (RUB, USD, UZS) |
| `createdAt` | DATE | NOT NULL | |
| `updatedAt` | DATE | NOT NULL | |

**Индексы:**
- UNIQUE `(plan_id, region)` -- одна цена на план+регион

---

### 4.4. Модель Subscription (таблица `Subscriptions`)

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | INTEGER | PK, auto-increment | |
| `user_id` | INTEGER | NOT NULL, FK -> Users(id), ON DELETE CASCADE | |
| `plan_id` | INTEGER | NOT NULL, FK -> Plans(id), ON DELETE SET NULL | |
| `started_at` | DATE | NOT NULL | Дата начала |
| `expires_at` | DATE | NOT NULL | Дата окончания |
| `traffic_limit` | BIGINT | NOT NULL | Лимит трафика (байты) |
| `traffic_used` | BIGINT | NOT NULL, default: `0` | Использованный трафик (байты) |
| `throttled` | BOOLEAN | NOT NULL, default: `false` | Скорость ограничена |
| `active` | BOOLEAN | NOT NULL, default: `true` | Подписка активна |
| `createdAt` | DATE | NOT NULL | |
| `updatedAt` | DATE | NOT NULL | |

**Индексы:**
- `(user_id, active)` -- быстрый поиск активной подписки юзера
- `(expires_at)` -- для subscription checker (поиск истекших)
- `(active, expires_at)` -- составной индекс

**Связи:**
- `Subscription.belongsTo(User)` -- через `user_id`
- `Subscription.belongsTo(Plan)` -- через `plan_id`

---

### 4.5. Модель Node (таблица `Nodes`)

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | INTEGER | PK, auto-increment | |
| `name` | STRING | NOT NULL | Имя ноды (NL-1, DE-1) |
| `host` | STRING | NOT NULL | IP-адрес ноды |
| `port` | INTEGER | NOT NULL, default: `8080` | Порт API ноды |
| `token` | STRING | NOT NULL | Bearer-токен для авторизации |
| `domain` | STRING | NOT NULL | Домен для VLESS-конфигов |
| `location` | STRING | nullable | Локация (Netherlands, Germany) |
| `max_users` | INTEGER | NOT NULL, default: `250` | Макс. кол-во юзеров |
| `bandwidth_mbps` | INTEGER | default: `1000` | Пропускная способность (Mbps) |
| `active` | BOOLEAN | NOT NULL, default: `true` | Нода активна |
| `last_health_at` | DATE | nullable | Последний health check |
| `createdAt` | DATE | NOT NULL | |
| `updatedAt` | DATE | NOT NULL | |

**Связи:** Нет.

---

### 4.6. Модель Payment (таблица `Payments`)

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | INTEGER | PK, auto-increment | |
| `user_id` | INTEGER | NOT NULL, FK -> Users(id), ON DELETE CASCADE | |
| `amount` | INTEGER | NOT NULL | Сумма |
| `currency` | STRING(3) | NOT NULL | Валюта |
| `method` | STRING(10) | NOT NULL | Способ оплаты |
| `provider_id` | STRING | UNIQUE | ID транзакции провайдера |
| `status` | STRING(10) | NOT NULL, default: `'pending'` | Статус (pending, success, failed) |
| `createdAt` | DATE | NOT NULL | |
| `updatedAt` | DATE | NOT NULL | |

**Индексы:**
- `(user_id, status)` -- поиск платежей юзера по статусу
- `(provider_id)` -- поиск по ID провайдера

---

### 4.7. Модель ReferralReward (таблица `ReferralRewards`)

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | INTEGER | PK, auto-increment | |
| `referrer_id` | INTEGER | NOT NULL, FK -> Users(id), ON DELETE CASCADE, INDEX | Кто пригласил |
| `referred_id` | INTEGER | NOT NULL, UNIQUE, FK -> Users(id), ON DELETE CASCADE | Кого пригласили |
| `days_awarded` | INTEGER | NOT NULL, default: `30` | Начислено дней |
| `traffic_awarded` | BIGINT | NOT NULL, default: `107374182400` | Начислено трафика (100 GB) |
| `createdAt` | DATE | NOT NULL | |
| `updatedAt` | DATE | NOT NULL | |

> `referred_id` UNIQUE -- одна награда на приглашенного (нельзя начислить дважды).

---

### 4.8. Начальные данные (Seed)

**Файл:** `db/seeders/20260226170919-initial-seed.js`

#### Тарифные планы

| Название | Дней | Трафик | Триал |
|----------|------|--------|:-----:|
| Trial | 3 | 5 GB | да |
| Monthly | 30 | 150 GB | нет |
| Semi-Annual | 180 | 900 GB | нет |
| Annual | 365 | 1800 GB | нет |

#### Цены по регионам

| План | RU | UAE | TR | UZ |
|------|-----|-----|-----|-----|
| Monthly | 120 RUB | 4 USD | 2 USD | 30,000 UZS |
| Semi-Annual | 600 RUB | 20 USD | 10 USD | 150,000 UZS |
| Annual | 1,200 RUB | 40 USD | 20 USD | 250,000 UZS |

---

## 5. Telegram Bot

### 5.1. Инициализация

**Файл:** `src/bot.js`

Бот работает через Webhook. При запуске устанавливает webhook на URL:

```
{DOMAIN}/bot{TELEGRAM_BOT_TOKEN}
```

### 5.2. Команды меню

| Команда | Описание |
|---------|----------|
| `/start` | Регистрация нового пользователя или приветствие существующего |
| `/language` | Выбор языка интерфейса |
| `/subscribe` | Просмотр тарифов и покупка подписки |
| `/referral` | Реферальная ссылка и статистика |
| `/help` | Помощь |
| `/terms` | Правила использования |

### 5.3. Подробное описание команд

#### /start

**Файл:** `src/commands/start.js`

Для нового пользователя:
1. Определяет язык из `language_code` Telegram (`detectLang`)
2. Определяет регион по языку (`detectRegion`): ru->ru, tr->tr, uz->uz, ar/hi->uae, прочее->uae
3. Генерирует: UUID (crypto.randomUUID), sub_token (32 hex), referral_code (8 hex)
4. Если в ссылке `?start=ref_XXXXX` -- записывает `referred_by`
5. Создает пользователя в БД
6. Показывает приветствие + главное меню

Для существующего пользователя:
- Показывает "С возвращением!" + главное меню

#### Подключение (callback: `connect`)

**Файл:** `src/commands/connect.js`

1. Если нет активной подписки -- автоматически активирует триал (Trial, 3 дня, 5 GB)
2. Добавляет юзера на все VPN-ноды (`addUserToAllNodes`)
3. Показывает ссылку подписки: `{DOMAIN}/sub/{sub_token}`
4. Кнопки: копировать ссылку, инструкция iOS/Android/Desktop, QR-код, назад

Инструкции по платформам:
- iOS -- `instruction_ios`
- Android -- `instruction_android`
- Desktop -- `instruction_desktop`

QR-код: генерируется через библиотеку `qrcode` как PNG-изображение.

#### Аккаунт (callback: `account`)

**Файл:** `src/commands/account.js`

Показывает:
- Telegram ID
- Текущий план
- Статус подписки
- Дата истечения и оставшиеся дни
- Трафик: использованный/лимит (для триала) или "безлимит" (для платных)

#### Подписка (callback: `subscribe`, команда `/subscribe`)

**Файл:** `src/commands/subscribe.js`

1. Загружает активные платные планы с ценами для региона пользователя
2. Показывает список планов с иконками (Monthly, Semi-Annual, Annual)
3. При выборе плана -- предлагает способ оплаты (карта / Telegram Stars)
4. Оплата пока в режиме заглушки (stub)

#### Реферал (callback: `referral`, команда `/referral`)

**Файл:** `src/commands/referral.js`

Показывает:
- Реферальную ссылку: `https://t.me/{bot_username}?start=ref_{referral_code}`
- Кнопка "Поделиться с другом" (Telegram share)
- Кнопка "Скопировать ссылку"
- Статистику: сколько друзей приглашено, сколько дней получено

#### Язык (callback: `language`, команда `/language`)

**Файл:** `src/commands/language.js`

Показывает список языков с флагами. При выборе:
1. Обновляет `lang` пользователя в БД
2. Показывает подтверждение на новом языке
3. Возвращает в главное меню

#### Главное меню

**Файл:** `src/commands/menu.js`

Inline-клавиатура:
```
[ Подключиться ]
[ Аккаунт ] [ Подписка ]
[ Реферал ] [ Язык ]
[ Инструкция ]
```

Кнопка `back_to_menu` -- удаляет текущее сообщение и показывает меню заново.

### 5.4. Поддерживаемые языки

**Файл:** `src/locales/index.js`

| Код | Язык | Флаг |
|-----|------|------|
| `ru` | Русский | RU |
| `en` | English | GB |
| `ar` | العربية | AE |
| `uz` | O'zbekcha | UZ |
| `hi` | हिंदी | IN |
| `tr` | Turkce | TR |

Функция `t(lang, key, params)` -- подставляет параметры `{param}` в строку перевода. Fallback: `en`.

Функция `detectLang(languageCode)` -- определяет язык по Telegram language_code (первые 2 символа).

---

## 6. Worker Services (Cron)

### 6.1. Health Checker (каждые 5 минут)

**Файл:** `src/workers/healthChecker.js`

**Расписание:** `*/5 * * * *` (каждые 5 минут). Также запускается немедленно при старте сервера.

**Логика:**
1. Загружает все ноды из БД (включая неактивные)
2. Отправляет `GET /health` на каждую ноду
3. Если нода ответила:
   - `active = true`, обновляет `last_health_at`
   - Кеширует данные: `active_connections`, `user_count`, `network_rx_bytes`, `network_tx_bytes`, `uptime_secs`
   - Вычисляет текущую скорость (speed_rx, speed_tx) как разницу `network_*_bytes` между замерами, деленную на время
4. Если нода не ответила:
   - `active = false` -- нода исключается из балансировки `/sub/:token`

**Кеш:** Хранится в памяти (`healthCache`). Доступен через `getHealthCache()`. Используется в:
- `subRouter.js` -- для балансировки нагрузки
- `adminNodesRouter.js` -- для отображения скорости и uptime

### 6.2. Traffic Collector (каждые 30 минут)

**Файл:** `src/workers/trafficCollector.js`

**Расписание:** `*/30 * * * *`

**Логика сбора трафика:**
1. Запрашивает `GET /stats` со всех активных нод
2. Суммирует `bytes_up + bytes_down` по UUID со всех нод (юзер может быть на нескольких)
3. Суммирует `active_connections` по UUID со всех нод
4. Один запрос `User.findAll` с `include: Subscription` -- все нужные юзеры
5. Создает `userMap` (uuid -> {user, sub}) для мгновенного доступа
6. Для каждого UUID с трафиком:
   - Прибавляет к `subscription.traffic_used`
   - Делает `POST /users/{uuid}/reset-traffic` на нодах -- обнуляет счетчик
7. Таким образом: на ноде всегда "мало" трафика, а в БД -- накопленная сумма

**Оптимизация с userMap:**
- Вместо N запросов к БД (один на юзера) -- 2 SQL запроса на весь цикл
- 1000 онлайн-юзеров = 2 SQL запроса вместо 4000

**Throttle по трафику:**
- Если `traffic_used >= traffic_limit` и юзер не throttled:
  - `throttleOnAllNodes(uuid)` -- скорость падает до 2-3 Mbps (настройка на ноде)
  - `subscription.throttled = true`

**Throttle по антишарингу:**
- `MAX_CONNECTIONS_PER_USER = 256`
- 1 устройство ~ 20-30 WebSocket соединений
- Если суммарные коннекты юзера со всех нод > 256 -- throttle
- Юзер получает 2-3 Mbps, "друзья" которым раздали ссылку уходят сами

**Auto-unthrottle:**
- Если throttled юзер имеет коннекты <= 256 И трафик в норме:
  - `unthrottleOnAllNodes(uuid)` -- скорость восстановлена
  - `subscription.throttled = false`
- Максимальное время на ограниченной скорости: 30 минут (один цикл)

### 6.3. Subscription Checker (каждый час)

**Файл:** `src/workers/subscriptionChecker.js`

**Расписание:** `0 * * * *` (начало каждого часа)

**Логика:**
1. Находит подписки где `active = true` и `expires_at < NOW()`
2. Для каждой:
   - `subscription.active = false`
   - `removeUserFromAllNodes(uuid)` -- юзер удаляется с нод
3. При следующем обновлении VPN-клиент получит пустой ответ от `/sub/:token` -- VPN отключится

---

## 7. Балансировка нагрузки

**Файл:** `src/routes/subRouter.js`

Алгоритм выбора ноды при запросе `GET /sub/:token`:

```
1. Загрузить все активные ноды из БД
2. Получить healthCache (из Health Checker)

3. Если кеш НЕ пуст:
   a. Фильтр: убрать ноды где user_count >= max_users
   b. Из оставшихся -- сортировка по active_connections (по возрастанию)
   c. Выбрать ноду с минимумом коннектов

   d. Если ВСЕ ноды полные (фильтр убрал все):
      -- Fallback: сортировка ВСЕХ нод по active_connections
      -- Выбрать с минимумом (лучше, чем отказ)

4. Если кеш ПУСТ (первый запуск сервера):
   -- Случайная нода из списка

5. Сформировать VLESS-ссылку с выбранной нодой
6. Закодировать в Base64, отдать клиенту
```

**Формат VLESS-ссылки:**

```
vless://{user.uuid}@{node.domain}:443?type=ws&security=tls&path=%2Fvflux&encryption=none#V-Flux-{location}
```

---

## 8. Реферальная система

**Файл:** `src/services/referralService.js`

### Путь пользователя

```
1. Юзер A нажимает "Пригласить друга" -- получает ссылку:
   t.me/{bot}?start=ref_{referral_code}

2. Юзер B переходит по ссылке
   -> /start записывает referred_by = A.id

3. Юзер B получает триал 3 дня, пользуется VPN

4. Юзер B покупает подписку
   -> webhook оплаты вызывает processReferralReward(B.id)

5. Юзер A получает бонус: +30 дней и +100 GB
```

### Бонусы

| Параметр | Значение |
|----------|----------|
| Дни | +30 дней к подписке |
| Трафик | +100 GB (107,374,182,400 байт) |

### Кейсы

| Ситуация | Действие |
|----------|----------|
| У реферера есть активная подписка | Продлеваем `expires_at` + добавляем к `traffic_limit` |
| У реферера нет подписки | Создаем бесплатную (план Monthly) на 30 дней с 100 GB, добавляем на ноды |
| Реферер был throttled по трафику | Если новый лимит покрывает использованный трафик -- unthrottle |
| Награда уже была начислена | Пропускаем (`referred_id` UNIQUE в ReferralRewards) |
| Юзер пришел не по ссылке | Пропускаем (`referred_by` = null) |

### Запись награды

После начисления бонуса создается запись в `ReferralRewards`:
- `referrer_id` -- кто пригласил
- `referred_id` -- кого пригласили (UNIQUE -- защита от дублей)
- `days_awarded` -- сколько дней начислено
- `traffic_awarded` -- сколько трафика начислено

---

## 9. Админ-панель

**Путь:** `/cpanel-9f2k`

**Технология:** React SPA (исходники в `admin-panel/`, собранная версия в `public/admin/`)

### 9.1. Авторизация

Токен хранится в `localStorage` как `admin_token`. При `401`/`403` ответе -- автоматический logout (удаление токена + перезагрузка).

### 9.2. API-клиент

**Файл:** `admin-panel/src/api/admin.js`

```javascript
const api = axios.create({
  baseURL: '/api/admin',
  timeout: 15000,
});
```

Автоматически добавляет `Authorization: Bearer {token}` ко всем запросам.

**Доступные методы:**
- `fetchNodeStats()` -- `GET /nodes/stats`
- `fetchUsers()` -- `GET /users`
- `fetchNodeUsers(id)` -- `GET /nodes/{id}/users`

### 9.3. Dashboard

**Файл:** `admin-panel/src/components/Dashboard.jsx`

**Карточки статистики (верхний ряд):**

| Карточка | Описание | Источник |
|----------|----------|----------|
| Users | Всего пользователей в БД | `db.total_users` |
| Online | Суммарно онлайн на всех нодах | Сумма `users_online` по нодам |
| Active Subs | Активных подписок | `db.active_subscriptions` |
| Connections | Суммарно WebSocket-коннектов | Сумма `total_connections` по нодам |
| Nodes | Количество активных нод | Количество элементов `nodes` |
| Throttled | Юзеров с ограниченной скоростью | Подсчет `throttled` из `online_details` |

**Автообновление:** Данные загружаются каждые 30 секунд (`setInterval(loadData, 30000)`).

**Кнопки:**
- Refresh -- принудительная перезагрузка данных
- Logout -- удаление `admin_token` из localStorage

### 9.4. Карточки нод (NodeCard)

**Файл:** `admin-panel/src/components/NodeCard.jsx`

Каждая карточка отображает:

| Элемент | Описание |
|---------|----------|
| Имя и локация | Заголовок карточки |
| Online | Количество юзеров онлайн |
| On Node | Всего юзеров на ноде |
| Conns | Общее число коннектов |
| Users bar | Прогресс-бар заполненности (из 250 макс.) |
| Bandwidth bar | Прогресс-бар использования канала (TX+RX / bandwidth_mbps) |
| TX / RX | Текущая скорость передачи/приема |
| Uptime | Время работы ноды |

**Цвета прогресс-баров:**
- Зеленый: < 40%
- Желтый: 40-70%
- Красный: > 70%

**Кнопка "Show Users":** Загружает список онлайн-юзеров на ноде (`GET /nodes/{id}/users`). Для каждого юзера показывает:
- Имя / username / UUID
- План
- Throttled индикатор
- Online индикатор
- Трафик: использованный / лимит
- Количество коннектов
- Дата истечения подписки

---

## 10. Деплой

### 10.1. Переменные окружения (.env)

**Файл:** `.env.example`

| Переменная | Описание | Пример |
|------------|----------|--------|
| `PORT` | Порт HTTP-сервера | `3000` |
| `DB_USER` | Пользователь PostgreSQL | `postgres` |
| `DB_PASS` | Пароль PostgreSQL | `password` |
| `DB_NAME` | Имя базы данных | `vflux` |
| `DB_HOST` | Хост PostgreSQL | `localhost` |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram-бота | `123456:ABC-DEF...` |
| `DOMAIN` | Публичный домен сервера (с https) | `https://master.v-flux.com` |
| `ADMIN_TOKEN` | Токен для авторизации в админ API | `secret-admin-token` |
| `ADMIN_ALLOWED_IPS` | IP-адреса для доступа к админке (через запятую) | `1.2.3.4,5.6.7.8` |
| `ACCESS_TOKEN_SECRET` | Секрет для JWT (зарезервировано) | |
| `REFRESH_TOKEN_SECRET` | Секрет для refresh JWT (зарезервировано) | |

### 10.2. NPM скрипты

| Скрипт | Команда | Описание |
|--------|---------|----------|
| `npm start` | `node src/server.js` | Запуск сервера (production) |
| `npm run dev` | `nodemon src/server.js` | Запуск с автоперезагрузкой (development) |
| `npm run db` | drop + create + migrate + seed | Полное пересоздание БД |
| `npm run db:migrate` | `sequelize-cli db:migrate` | Применить миграции |
| `npm run db:migrate:undo` | `sequelize-cli db:migrate:undo:all` | Откатить все миграции |
| `npm run db:seed` | `sequelize-cli db:seed:all` | Заполнить начальными данными |
| `npm run db:seed:undo` | `sequelize-cli db:seed:undo:all` | Удалить начальные данные |
| `npm run db:reset` | undo + migrate + seed | Сброс БД (без drop/create) |
| `npm run lint` | `eslint .` | Проверка кода |
| `npm run lint:fix` | `eslint . --fix` | Автоисправление стиля |

### 10.3. Зависимости

#### Production

| Пакет | Версия | Назначение |
|-------|--------|------------|
| express | ^5.2.1 | HTTP-сервер (Express 5) |
| sequelize | ^6.37.7 | ORM для PostgreSQL |
| pg / pg-hstore | ^8.18.0 | Драйвер PostgreSQL |
| node-telegram-bot-api | ^0.67.0 | Telegram Bot API |
| node-cron | ^4.2.1 | Планировщик задач (cron) |
| axios | ^1.13.5 | HTTP-клиент (запросы к нодам) |
| helmet | ^8.1.0 | Заголовки безопасности |
| cors | ^2.8.6 | Cross-Origin Resource Sharing |
| express-rate-limit | ^8.2.1 | Rate limiting |
| morgan | ^1.10.1 | HTTP-логирование |
| dotenv | ^17.3.1 | Переменные окружения |
| qrcode | ^1.5.4 | Генерация QR-кодов |
| winston | ^3.19.0 | Логирование |
| winston-daily-rotate-file | ^5.0.0 | Ротация лог-файлов |

#### Development

| Пакет | Версия | Назначение |
|-------|--------|------------|
| nodemon | ^3.1.14 | Автоперезапуск при изменениях |
| eslint | ^9.39.3 | Линтер |
| prettier | ^3.8.1 | Форматирование кода |
| eslint-config-prettier | ^10.1.8 | Интеграция ESLint + Prettier |
| eslint-plugin-prettier | ^5.5.5 | Prettier как правило ESLint |
| sequelize-cli | ^6.6.5 | CLI для миграций и сидов |

### 10.4. Запуск

```bash
# 1. Установить зависимости
npm install

# 2. Скопировать и заполнить .env
cp .env.example .env

# 3. Создать и заполнить БД
npm run db

# 4. Запуск (production)
npm start

# 4. Запуск (development)
npm run dev
```

### 10.5. Взаимодействие с нодами

Мастер общается с VPN-нодами через HTTP API (axios):

```javascript
// src/utils/nodeApi.js
const api = axios.create({
  baseURL: `http://{host}:{port}`,
  headers: { Authorization: `Bearer {token}` },
  timeout: 10000,
});
```

**Эндпоинты нод** (которые вызывает мастер):

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/health` | Проверка здоровья |
| GET | `/stats` | Статистика (юзеры, трафик, коннекты) |
| POST | `/users` | Добавить юзера `{uuid, traffic_limit}` |
| PATCH | `/users/{uuid}` | Обновить юзера `{traffic_limit}` |
| DELETE | `/users/{uuid}` | Удалить юзера |
| POST | `/users/{uuid}/throttle` | Ограничить скорость |
| POST | `/users/{uuid}/unthrottle` | Снять ограничение скорости |
| POST | `/users/{uuid}/reset-traffic` | Сбросить счетчик трафика |
