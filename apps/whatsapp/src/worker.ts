import { config } from './config.js';
import { AgentApi } from './agentApi.js';
import { WhatsAppClient, WhatsAppSendTimeoutError } from './client/whatsappClient.js';

export class MessageWorker {
  private running = false;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly agentApi: AgentApi,
    private readonly whatsapp: WhatsAppClient
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    void this.tick();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNext() {
    if (this.running) this.timer = setTimeout(() => void this.tick(), config.WHATSAPP_POLL_INTERVAL_MS);
  }

  private async tick() {
    if (!this.running) return;
    const current = this.whatsapp.getState();

    try {
      const disconnectRequested = await this.agentApi.heartbeat(current.state as 'INICIALIZANDO' | 'AGUARDANDO_AUTENTICACAO' | 'CONECTADO' | 'DESCONECTADO' | 'ERRO');
      if (disconnectRequested) {
        await this.whatsapp.logout();
        return;
      }
      if (!current.ready) {
        return;
      }

      const claimed = await this.agentApi.claimJob();
      if (!claimed.job || !claimed.leaseId) {
        return;
      }

      let sent: Awaited<ReturnType<WhatsAppClient['sendMessage']>>;
      try {
        sent = await this.whatsapp.sendMessage(claimed.job.phone, claimed.job.content, {
          mediaUrl: claimed.job.mediaUrl,
          mediaMimeType: claimed.job.mediaMimeType,
          mediaFilename: claimed.job.mediaFilename,
          mediaCaption: claimed.job.mediaCaption
        });
      } catch (error) {
        try {
          if (error instanceof WhatsAppSendTimeoutError) {
            await this.agentApi.uncertain(claimed.job.id, claimed.leaseId, error.message);
          } else {
            await this.agentApi.failure(claimed.job.id, claimed.leaseId, error);
          }
        } catch (confirmationError) {
          console.error(JSON.stringify({ level: 'error', message: 'Unable to report WhatsApp failure', detail: confirmationError instanceof Error ? confirmationError.message : String(confirmationError) }));
        }
        return;
      }

      try {
        const externalMessageId = this.getExternalMessageId(sent);
        await this.agentApi.success(claimed.job.id, claimed.leaseId, externalMessageId ?? undefined);
      } catch (confirmationError) {
        // A successful WhatsApp send followed by an API timeout is not safe to retry.
        // Keep the job auditable as uncertain so an operator can reconcile it manually.
        try {
          await this.agentApi.uncertain(
            claimed.job.id,
            claimed.leaseId,
            confirmationError instanceof Error ? confirmationError.message : 'A mensagem foi enviada, mas a confirmação não foi recebida.'
          );
        } catch (uncertainError) {
          console.error(JSON.stringify({
            level: 'error',
            message: 'Unable to report uncertain WhatsApp result',
            jobId: claimed.job.id,
            detail: uncertainError instanceof Error ? uncertainError.message : String(uncertainError)
          }));
        }
      }

      await new Promise(resolve => setTimeout(resolve, config.WHATSAPP_SEND_DELAY_MS));
    } catch (error) {
      console.error(JSON.stringify({ level: 'warn', message: 'Agent polling failed', detail: error instanceof Error ? error.message : String(error) }));
    } finally {
      this.scheduleNext();
    }
  }

  private getExternalMessageId(result: unknown): string | null {
    if (typeof result === 'string' && result.trim()) return result.trim();
    if (!result || typeof result !== 'object') return null;
    const value = result as { id?: string | { id?: string; _serialized?: string } | null; _serialized?: string };
    if (typeof value._serialized === 'string' && value._serialized.trim()) return value._serialized.trim();
    if (typeof value.id === 'string' && value.id.trim()) return value.id.trim();
    if (value.id && typeof value.id === 'object') {
      if (typeof value.id._serialized === 'string' && value.id._serialized.trim()) return value.id._serialized.trim();
      if (typeof value.id.id === 'string' && value.id.id.trim()) return value.id.id.trim();
    }
    return null;
  }
}
