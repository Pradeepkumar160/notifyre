require('dotenv').config();
const express = require('express');
const notificationRoutes = require('./routes/notificationRoutes');
const healthRoutes = require('./routes/healthRoutes');
const { connectRabbitMQ } = require('./config/rabbitmq');
const { runMigrations } = require('./config/database');
const logger = require('./utils/logger');

const app = express();

app.use(express.json());

// Routes
app.use('/api/notifications', notificationRoutes);
app.use('/health', healthRoutes);

// Root welcome
app.get('/', (req, res) => {
  res.json({
    name: 'Notifyre 🔔',
    description: 'Event-Driven Notification Engine',
    version: '1.0.0',
    docs: 'POST /api/notifications to send a notification',
    health: 'GET /health',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

async function startApiService() {
  try {
    logger.info('Running database migrations...');
    await runMigrations();

    logger.info('Connecting to RabbitMQ...');
    await connectRabbitMQ();

    app.listen(PORT, () => {
      logger.info(`🚀 Notifyre API running on port ${PORT}`);
    });
  } catch (error) {
    logger.error(`Failed to start API Service: ${error.message}`);
    process.exit(1);
  }
}

startApiService();
