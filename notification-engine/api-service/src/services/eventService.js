const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

exports.saveEvent = async (event) => {
  const saved = await prisma.notificationEvent.create({ data: event });
  logger.info(`💾 Event saved: ${saved.id}`);
  return saved;
};

exports.updateEventStatus = async (eventId, status, retryCount) => {
  const data = { status };
  if (retryCount !== undefined) data.retryCount = retryCount;
  const updated = await prisma.notificationEvent.update({
    where: { id: eventId },
    data,
  });
  logger.info(`🔄 Event ${eventId} → ${status}`);
  return updated;
};

exports.getEvents = async ({ status, type, limit = 50 } = {}) => {
  const where = {};
  if (status) where.status = status.toUpperCase();
  if (type) where.type = type.toLowerCase();
  return prisma.notificationEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
};

exports.getEventById = async (id) => {
  return prisma.notificationEvent.findUnique({ where: { id } });
};
