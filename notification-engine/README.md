# 🔔 Notifyre — Event-Driven Notification Engine

> Send emails and SMS at scale with automatic retries, dead-letter queues, and full delivery tracking — all running in Docker.

---

## ✨ Features

- **Async Email & SMS** via SendGrid and Twilio
- **RabbitMQ** message broker with direct exchanges
- **Auto-retry** (up to 3 attempts with 15s delay)
- **Dead Letter Queue** for permanently failed messages
- **PostgreSQL** event sourcing — full audit trail
- **Prisma ORM** for type-safe database queries
- **DRY_RUN mode** — test without real API keys
- **Docker Compose** one-command setup
- **Horizontally scalable** workers
- **Winston logging** across all services

---

## 🏗️ Architecture

```
Client
  │
  ▼
┌─────────────────┐
│   API Service   │  POST /api/notifications
│   (Express.js)  │
└────────┬────────┘
         │  Save to PostgreSQL
         │  Publish to RabbitMQ
         ▼
┌─────────────────┐
│    RabbitMQ     │  notification.exchange
│                 │  ├── email.queue
│                 │  └── sms.queue
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Worker Service │  Consumes & delivers
│                 │  ├── SendGrid (email)
│                 │  └── Twilio (SMS)
└────────┬────────┘
         │  On failure:
         ▼
┌─────────────────┐
│  retry.queue    │  15s TTL → DLQ after 3 retries
└────────┬────────┘
         ▼
┌─────────────────┐
│  Dead Letter    │  Logs permanently failed messages
│  Service        │
└─────────────────┘
```

---

## 🚀 Quick Start (Docker)

### 1. Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

### 2. Clone & configure

```bash
cd notification-engine
```

Edit `.env` files in `api-service/` and `worker-service/`:

| Variable | Description |
|---|---|
| `SENDGRID_API_KEY` | Your SendGrid API key |
| `EMAIL_FROM` | Verified sender email in SendGrid |
| `TWILIO_SID` | Your Twilio Account SID |
| `TWILIO_TOKEN` | Your Twilio Auth Token |
| `TWILIO_PHONE` | Your Twilio phone number (E.164 format) |

> **💡 No API keys yet?** Set `DRY_RUN=true` in `worker-service/.env` to test without sending real messages.

### 3. Start everything

```bash
docker compose up --build
```

### 4. Test it

```bash
# Send an email notification
curl -X POST http://localhost:5000/api/notifications \
  -H "Content-Type: application/json" \
  -d '{"type":"email","recipient":"you@example.com","message":"Hello from Notifyre!"}'

# Send an SMS notification
curl -X POST http://localhost:5000/api/notifications \
  -H "Content-Type: application/json" \
  -d '{"type":"sms","recipient":"+919876543210","message":"Your OTP is 998877"}'
```

---

## 📡 API Reference

### `POST /api/notifications`
Queue a notification.

**Body:**
```json
{
  "type": "email",       // "email" or "sms"
  "recipient": "...",    // email address or E.164 phone (+91...)
  "message": "..."       // notification text
}
```

**Response:**
```json
{
  "success": true,
  "message": "Notification queued successfully",
  "eventId": "uuid",
  "type": "email",
  "status": "PENDING"
}
```

### `GET /api/notifications`
List all notifications. Query params: `?status=SENT&type=email&limit=20`

### `GET /api/notifications/:id`
Get a single notification by ID.

### `GET /health`
Health check.

---

## 📊 Status Flow

```
PENDING → SENT        (success)
PENDING → RETRYING    (attempt 1/2/3)
RETRYING → SENT       (recovered)
RETRYING → DEAD_LETTERED  (max retries exceeded)
```

---

## 🐰 RabbitMQ Dashboard

Open `http://localhost:15672` — login: `guest` / `guest`

---

## ⚡ Scale Workers

```bash
docker compose up --scale worker-service=5 -d
```

---

## 🔧 Useful Commands

```bash
# View logs
docker compose logs -f api-service
docker compose logs -f worker-service

# Stop everything
docker compose down

# Stop and wipe data
docker compose down -v

# Restart a service
docker compose restart worker-service
```

---

## 🔐 Production Checklist

- [ ] Replace `DRY_RUN=false` with real API keys
- [ ] Add JWT authentication middleware
- [ ] Add rate limiting (express-rate-limit)
- [ ] Use Docker secrets or a vault for credentials
- [ ] Set up HTTPS/TLS
- [ ] Add Prometheus + Grafana monitoring
- [ ] Configure RabbitMQ with persistent credentials

---

## 📁 Project Structure

```
notification-engine/
├── api-service/
│   ├── src/
│   │   ├── config/       # RabbitMQ, database
│   │   ├── controllers/  # Request handlers
│   │   ├── routes/       # Express routes
│   │   ├── services/     # Publisher, event storage
│   │   └── utils/        # Logger
│   ├── prisma/           # DB schema
│   ├── Dockerfile
│   ├── package.json
│   └── .env
├── worker-service/
│   ├── src/
│   │   ├── providers/    # SendGrid, Twilio
│   │   └── utils/        # Logger
│   ├── worker.js
│   ├── Dockerfile
│   └── .env
├── dead-letter-service/
│   └── src/dlq.js        # DLQ monitor
├── docker-compose.yml
└── README.md
```
