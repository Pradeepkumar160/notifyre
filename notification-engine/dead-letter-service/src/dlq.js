require('dotenv').config();
const amqp = require('amqplib');
const logger = require('./utils/logger');

async function connectWithRetry(retries = 10, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const connection = await amqp.connect(process.env.RABBITMQ_URL);
      logger.info('✅ DLQ Service connected to RabbitMQ');
      return connection;
    } catch (err) {
      logger.warn(`DLQ RabbitMQ attempt ${i + 1}/${retries} failed: ${err.message}`);
      if (i < retries - 1) await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('DLQ: Could not connect to RabbitMQ');
}

async function startDLQConsumer() {
  const connection = await connectWithRetry();
  const channel = await connection.createChannel();

  await channel.assertExchange('deadletter.exchange', 'direct', { durable: true });
  await channel.assertQueue('deadletter.queue', { durable: true });
  await channel.bindQueue('deadletter.queue', 'deadletter.exchange', 'dead');

  channel.consume(
    'deadletter.queue',
    (msg) => {
      if (!msg) return;
      try {
        const data = JSON.parse(msg.content.toString());
        const headers = msg.properties.headers || {};

        logger.warn(`💀 DEAD LETTER RECEIVED:`);
        logger.warn(`   Event ID  : ${data.id}`);
        logger.warn(`   Type      : ${data.type}`);
        logger.warn(`   Recipient : ${data.recipient}`);
        logger.warn(`   Message   : ${data.message}`);
        logger.warn(`   Retries   : ${data.retryCount || 0}`);
        logger.warn(`   Reason    : ${JSON.stringify(headers['x-death'] ? headers['x-death'][0]?.reason : 'unknown')}`);

        // TODO: In production, send admin alert here (email/Slack/PagerDuty)

        channel.ack(msg);
      } catch (err) {
        logger.error(`Failed to process DLQ message: ${err.message}`);
        channel.ack(msg); // ack anyway to prevent infinite loop
      }
    },
    { noAck: false }
  );

  logger.info('💀 Dead Letter Queue monitor started');

  connection.on('error', (err) => logger.error(`DLQ connection error: ${err.message}`));
  connection.on('close', () => {
    logger.warn('DLQ connection closed. Restarting...');
    setTimeout(startDLQConsumer, 5000);
  });
}

startDLQConsumer().catch((err) => {
  logger.error(`Fatal DLQ error: ${err.message}`);
  process.exit(1);
});
