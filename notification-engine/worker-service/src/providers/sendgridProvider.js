require('dotenv').config();
const sgMail = require('@sendgrid/mail');
const logger = require('../utils/logger');

const DRY_RUN = process.env.DRY_RUN === 'true';

if (!DRY_RUN) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

async function sendEmail(to, message) {
  if (DRY_RUN) {
    logger.info(`[DRY_RUN] 📧 Would send email to ${to}: "${message}"`);
    return { dryRun: true };
  }

  const msg = {
    to,
    from: process.env.EMAIL_FROM,
    subject: '🔔 Notifyre Notification',
    text: message,
    html: `<p>${message}</p>`,
  };

  await sgMail.send(msg);
  logger.info(`📧 Email sent to ${to}`);
}

module.exports = sendEmail;
