import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { backupFile } from './store/backups.js';
import { autoArchiveDrop, startJobs } from './store/jobs.js';
import { consoleLogger as logger, StoreManager } from './store/manager.js';

async function main() {
  const config = await loadConfig();
  const manager = await StoreManager.open({
    dataDir: config.dataDir,
    logger,
    beforeMigrate: (file) =>
      backupFile(file, config.dataDir, 'pre-migration').then(() => undefined),
  });

  const archived = autoArchiveDrop(manager);
  if (archived > 0) logger.info(`Auto-archived ${archived} Drop tasks`);

  const jobs = startJobs(manager, config.dataDir, logger);
  const app = createApp({ config, manager, logger });
  const server = app.listen(config.port, config.host, () => {
    logger.info(
      `v${config.version} listening on http://${config.host}:${config.port} (data: ${config.dataDir})`,
    );
  });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info(`${signal}: flushing and stopping`);
    jobs.stop();
    server.close();
    try {
      await manager.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  logger.error('Failed to start', err);
  process.exit(1);
});
