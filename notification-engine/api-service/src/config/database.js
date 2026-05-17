const { execSync } = require('child_process');
const logger = require('../utils/logger');

async function runMigrations() {
  try {
    execSync('npx prisma migrate deploy', {
      env: { ...process.env },
      stdio: 'pipe',
    });
    logger.info('✅ Database migrations applied');
  } catch (err) {
    const output = err.stdout ? err.stdout.toString() : err.message;
    logger.warn(`Migration note: ${output}`);
  }
}

module.exports = { runMigrations };
