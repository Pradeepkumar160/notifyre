const amqp = require('amqplib');
const logger = require('../utils/logger');

let channel;
let connection;

async function connectRabbitMQ(retries = 10, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      connection = await amqp.connect(process.env.RABBITMQ_URL);
      channel = await connection.createChannel();

      // Exchanges
      await channel.assertExchange('notification.exchange', 'direct', { durable: true });
      await channel.assertExchange('retry.exchange', 'direct', { durable: true });
      await channel.assertExchange('deadletter.exchange', 'direct', { durable: true });

      // Queues
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

      // Handle connection errors
      connection.on('error', (err) => {
        logger.error(`RabbitMQ connection error: ${err.message}`);
      });
      connection.on('close', () => {
        logger.warn('RabbitMQ connection closed. Reconnecting...');
        setTimeout(() => connectRabbitMQ(), 5000);
      });

      logger.info('✅ RabbitMQ connected and queues configured');
      return;
    } catch (err) {
      logger.warn(`RabbitMQ connection attempt ${i + 1}/${retries} failed: ${err.message}`);
      if (i < retries - 1) {
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
  throw new Error('Could not connect to RabbitMQ after multiple retries');
}

function getChannel() {
  if (!channel) throw new Error('RabbitMQ channel not initialized');
  return channel;
}

module.exports = { connectRabbitMQ, getChannel };
