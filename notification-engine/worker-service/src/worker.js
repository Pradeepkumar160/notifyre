require('dotenv').config();
const amqp = require('amqplib');
const sendEmail = require('./providers/sendgridProvider');
const sendSMS = require('./providers/twilioProvider');
const logger = require('./utils/logger');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const MAX_RETRIES = 3;

async function updateStatus(eventId, status, retryCount) {
  try {
    const data = { status };
    if (retryCount !== undefined) data.retryCount = retryCount;
    await prisma.notificationEvent.update({ where: { id: eventId }, data });
    logger.info(`📋 Event ${eventId} → ${status}`);
  } catch (err) {
    logger.error(`Failed to update status for ${eventId}: ${err.message}`);
  }
}

async function connectWithRetry(retries = 10, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const connection = await amqp.connect(process.env.RABBITMQ_URL);
      logger.info('✅ Worker connected to RabbitMQ');
      return connection;
    } catch (err) {
      logger.warn(`RabbitMQ attempt ${i + 1}/${retries} failed: ${err.message}`);
      if (i < retries - 1) await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Worker: Could not connect to RabbitMQ');
}

async function setupChannel(connection) {
  const channel = await connection.createChannel();
  channel.prefetch(5); // Process up to 5 messages at a time

  // Declare exchanges
  await channel.assertExchange('notification.exchange', 'direct', { durable: true });
  await channel.assertExchange('retry.exchange', 'direct', { durable: true });
  await channel.assertExchange('deadletter.exchange', 'direct', { durable: true });

  // Declare queues (must match api-service exactly)
  await channel.assertQueue('email.queue', {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': 'retry.exchange',
      'x-dead-letter-routing-key': 'retry',
    },
  });

  await channel.assertQueue('sms.queue', {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': 'retry.exchange',
      'x-dead-letter-routing-key': 'retry',
    },
  });

  await channel.assertQueue('retry.queue', {
    durable: true,
    arguments: {
      'x-message-ttl': 15000,
      'x-dead-letter-exchange': 'deadletter.exchange',
      'x-dead-letter-routing-key': 'dead',
    },
  });

  await channel.assertQueue('deadletter.queue', { durable: true });

  // Bindings
  await channel.bindQueue('email.queue', 'notification.exchange', 'email');
  await channel.bindQueue('sms.queue', 'notification.exchange', 'sms');
  await channel.bindQueue('retry.queue', 'retry.exchange', 'retry');
  await channel.bindQueue('deadletter.queue', 'deadletter.exchange', 'dead');

  return channel;
}

async function processMessage(channel, msg, sender, type) {
  if (!msg) return;

  let data;
  try {
    data = JSON.parse(msg.content.toString());
  } catch (e) {
    logger.error(`Failed to parse message: ${e.message}`);
    channel.ack(msg); // Discard unparseable messages
    return;
  }

  const retryCount = data.retryCount || 0;
  logger.info(`📨 Processing ${type} for ${data.recipient} | eventId=${data.id} | attempt=${retryCount + 1}`);

  try {
    await sender(data.recipient, data.message);
    await updateStatus(data.id, 'SENT');
    channel.ack(msg);
    logger.info(`✅ ${type} sent to ${data.recipient}`);
  } catch (error) {
    logger.error(`❌ ${type} failed for ${data.id}: ${error.message}`);

    if (retryCount >= MAX_RETRIES) {
      logger.warn(`⚠️ Max retries reached for ${data.id}. Sending to DLQ.`);
      await updateStatus(data.id, 'DEAD_LETTERED', retryCount);
      channel.nack(msg, false, false); // goes to retry.queue DLX → deadletter
    } else {
      data.retryCount = retryCount + 1;
      await updateStatus(data.id, 'RETRYING', data.retryCount);
      // Re-publish with updated retryCount before nacking
      const retryPayload = Buffer.from(JSON.stringify(data));
      channel.publish('retry.exchange', 'retry', retryPayload, { persistent: true });
      channel.ack(msg); // ack original so we don't double-process
      logger.info(`🔁 Retry ${data.retryCount}/${MAX_RETRIES} scheduled for ${data.id}`);
    }
  }
}

async function startWorker() {
  const connection = await connectWithRetry();
  const channel = await setupChannel(connection);

  connection.on('error', (err) => logger.error(`Connection error: ${err.message}`));
  connection.on('close', () => {
    logger.warn('Connection closed. Restarting worker...');
    setTimeout(startWorker, 5000);
  });

  // Consume email queue
  channel.consume('email.queue', (msg) => processMessage(channel, msg, sendEmail, 'EMAIL'), {
    noAck: false,
  });

  // Consume sms queue
  channel.consume('sms.queue', (msg) => processMessage(channel, msg, sendSMS, 'SMS'), {
    noAck: false,
  });

  logger.info('🎯 Notifyre Worker started — listening for email & SMS jobs');
}

startWorker().catch((err) => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
