const { getChannel } = require('../config/rabbitmq');
const logger = require('../utils/logger');

exports.publishNotification = async (event) => {
  const channel = getChannel();
  const routingKey = event.type === 'email' ? 'email' : 'sms';

  const payload = Buffer.from(JSON.stringify(event));

  channel.publish('notification.exchange', routingKey, payload, {
    persistent: true,
    contentType: 'application/json',
  });

  logger.info(`📤 Event published [${routingKey}] eventId=${event.id}`);
};
