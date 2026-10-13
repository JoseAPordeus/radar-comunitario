import { app } from './app.js';
import { env } from './config/env.js';
import { runEnabledBirthdayAutomations } from './services/birthdayAutomation.js';
import { startMessageQueue, stopMessageQueue } from './queue/messageQueue.js';
import { startAudioProcessor, stopAudioProcessor } from './services/audioTranscription.js';

const BIRTHDAY_INTERVAL_MS = 15 * 60 * 1000;
let birthdayTimer: NodeJS.Timeout | undefined;

const server = app.listen(env.API_PORT, env.API_HOST, () => {
  console.log(JSON.stringify({
    level: 'info',
    message: 'Radar Comunitário API started',
    host: env.API_HOST,
    port: env.API_PORT,
    environment: env.NODE_ENV
  }));
  void startMessageQueue();
  startAudioProcessor();
  void runEnabledBirthdayAutomations().catch(error => console.error(JSON.stringify({ level: 'error', message: 'Initial birthday automation check failed', error: String(error) })));
  birthdayTimer = setInterval(() => {
    void runEnabledBirthdayAutomations().catch(error => console.error(JSON.stringify({ level: 'error', message: 'Scheduled birthday automation check failed', error: String(error) })));
  }, BIRTHDAY_INTERVAL_MS);
});

function shutdown(signal: string) {
  console.log(JSON.stringify({ level: 'info', message: `Received ${signal}; shutting down` }));
  if (birthdayTimer) clearInterval(birthdayTimer);
  void stopMessageQueue();
  stopAudioProcessor();
  server.close(error => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
