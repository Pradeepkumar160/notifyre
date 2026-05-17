const { publishNotification } = require('../services/publisher');
const { saveEvent, getEvents, getEventById } = require('../services/eventService');
const logger = require('../utils/logger');

exports.sendNotification = async (req, res) => {
  try {
    const { type, recipient, message } = req.body;

    // Validation
    if (!type || !recipient || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: type, recipient, message',
      });
    }

    const validTypes = ['email', 'sms'];
    if (!validTypes.includes(type.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    // Email format check
    if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address for recipient',
      });
    }

    // Phone format check for SMS
    if (type === 'sms' && !/^\+[1-9]\d{6,14}$/.test(recipient)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number. Must be E.164 format e.g. +919876543210',
      });
    }

    const event = {
      type: type.toLowerCase(),
      recipient,
      message,
      status: 'PENDING',
    };

    const savedEvent = await saveEvent(event);
    await publishNotification(savedEvent);

    logger.info(`Notification queued: ${savedEvent.id} [${type}] -> ${recipient}`);

    return res.status(202).json({
      success: true,
      message: 'Notification queued successfully',
      eventId: savedEvent.id,
      type: savedEvent.type,
      recipient: savedEvent.recipient,
      status: savedEvent.status,
    });
  } catch (error) {
    logger.error(`Error in sendNotification: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const { status, type, limit = 50 } = req.query;
    const events = await getEvents({ status, type, limit: parseInt(limit) });
    return res.status(200).json({ success: true, count: events.length, data: events });
  } catch (error) {
    logger.error(`Error in getNotifications: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.getNotificationById = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await getEventById(id);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    return res.status(200).json({ success: true, data: event });
  } catch (error) {
    logger.error(`Error in getNotificationById: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
};
