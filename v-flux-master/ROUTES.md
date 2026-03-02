# V-Flux Master Backend — API Routes

## Public
GET /sub/:token — VLESS подписка для VPN-клиентов (V2Box, v2rayNG)

## Nodes (Bearer: node token)
GET /api/nodes/sync — нода забирает список юзеров при старте

## Admin (Bearer: ADMIN_TOKEN из .env)

### Ноды
GET    /api/admin/nodes          — список всех нод
GET    /api/admin/nodes/stats    — статистика: онлайн, скорость, БД
POST   /api/admin/nodes          — добавить ноду
PATCH  /api/admin/nodes/:id      — обновить ноду
DELETE /api/admin/nodes/:id      — удалить ноду

### Юзеры
GET    /api/admin/users          — список юзеров
GET    /api/admin/users/:id      — детали юзера
DELETE /api/admin/users/:id      — удалить + снять с нод
POST   /api/admin/users/:id/subscription — выдать подписку

## Telegram
POST /bot{TOKEN} — webhook бота

## Cron Workers
🏥 Health checker     — каждые 5 мин (кеш нод, скорость)
📊 Traffic collector  — каждые 30 мин (сбор трафика, throttle)
⏰ Subscription check — каждый час (деактивация истёкших)