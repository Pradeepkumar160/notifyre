require('dotenv').config();
const logger = require('../utils/logger');

const DRY_RUN = process.env.DRY_RUN === 'true';

async function sendSMS(to, message) {
  if (DRY_RUN) {
    logger.info(`[DRY_RUN] 📱 Would send SMS to ${to}: "${message}"`);
    return { dryRun: true };
  }

  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

  await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE,
    to,
  });

  logger.info(`📱 SMS sent to ${to}`);
}

module.exports = sendSMS;
