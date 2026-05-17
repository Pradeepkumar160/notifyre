const express = require('express');
const router = express.Router();
const {
  sendNotification,
  getNotifications,
  getNotificationById,
} = require('../controllers/notificationController');

router.post('/', sendNotification);
router.get('/', getNotifications);
router.get('/:id', getNotificationById);

module.exports = router;
