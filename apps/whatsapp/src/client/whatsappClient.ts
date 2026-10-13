import whatsappWeb from 'whatsapp-web.js';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Message } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import { config } from '../config.js';

const { Client, LocalAuth } = whatsappWeb;

export type WhatsAppState =
  | 'INICIALIZANDO'
  | 'AGUARDANDO_AUTENTICACAO'
  | 'CONECTADO'
  | 'DESCONECTADO'
  | 'ERRO';

type HistoryMessage = {
  id: { id: string; fromMe?: boolean };
  fromMe?: boolean;
  to: unknown;
  from: unknown;
  type: string;
  body?: string;
  timestamp: number;
  t?: number;
};

type WhatsAppContactProfile = {
  pushname?: string | null;
  name?: string | null;
  shortName?: string | null;
  number?: string | null;
  id?: { user?: string | null };
  getProfilePicUrl: () => Promise<string>;
};

type WhatsAppChatTarget = {
  serializedId: string;
  contact?: WhatsAppContactProfile;
  fullName?: string | null;
};

type WhatsAppMediaInfo = {
  mimetype: string;
  data: string;
  filename?: string | null;
};

export class WhatsAppSendTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`O WhatsApp Web não confirmou o envio dentro de ${Math.ceil(timeoutMs / 1000)} segundos.`);
    this.name = 'WhatsAppSendTimeoutError';
  }
}

export class WhatsAppClient {
  private client: InstanceType<typeof Client> | null = null;
  private state: WhatsAppState = 'INICIALIZANDO';
  private ready = false;
  private syncInProgress = false;
  private syncTimer: NodeJS.Timeout | undefined;
  private reconnecting = false;
  private manualLogout = false;
  private chatIndexFallbackLogged = false;
  private readonly chatPhoneById = new Map<string, string>();

  constructor(
    private readonly publishStatus?: (state: WhatsAppState, qrCode?: string | null, phoneNumber?: string | null) => Promise<void>,
    private readonly publishIncomingMessage?: (payload: { messageId: string; phone: string; whatsappChatId?: string | null; direction: 'INBOUND' | 'OUTBOUND'; messageType: string; content: string; mediaUrl?: string | null; mediaStoragePath?: string | null; mediaMimeType?: string | null; quotedMessageId?: string | null; quotedContent?: string | null; senderDisplayName?: string | null; contactName?: string | null; contactAvatarUrl?: string | null; createdAt: string }) => Promise<void>,
    private readonly uploadIncomingMedia?: (payload: { phone: string; mimeType: string; fileName: string; body: Buffer }) => Promise<{ url: string; storagePath: string; mimeType: string }>,
    private readonly listContactPhones?: () => Promise<string[]>,
    private readonly updateContactProfile?: (payload: { phone: string; whatsappChatId?: string | null; fullName?: string | null; avatarUrl?: string | null }) => Promise<void>
  ) {
    this.client = this.createClient();
  }

  private createClient() {
    const client = new Client({
        authStrategy: new LocalAuth({ dataPath: config.WHATSAPP_SESSION_PATH, clientId: config.WHATSAPP_CLIENT_ID }),
      puppeteer: {
        headless: config.headless,
        executablePath: config.CHROMIUM_PATH,
        protocolTimeout: 180_000,
        args: [
          '--headless=new',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      }
    });

    client.on('qr', (qr: string) => {
      this.ready = false;
      this.state = 'AGUARDANDO_AUTENTICACAO';
      console.log('Escaneie o QR Code abaixo no WhatsApp do celular:');
      qrcode.generate(qr, { small: true });
      void QRCode.toDataURL(qr, { margin: 1, width: 360 })
        .then(dataUrl => this.publishStatus?.('AGUARDANDO_AUTENTICACAO', dataUrl, null))
        .catch(error => console.error(JSON.stringify({ level: 'warn', message: 'Unable to publish WhatsApp QR Code', detail: error instanceof Error ? error.message : String(error) })));
    });

    client.on('authenticated', () => {
      this.state = 'INICIALIZANDO';
      console.log(JSON.stringify({ level: 'info', message: 'WhatsApp authenticated' }));
      void this.waitForConnectedState();
    });

    client.on('change_state', (state: string) => {
      console.log(JSON.stringify({ level: 'info', message: 'WhatsApp state changed', state }));
      if (state === 'CONNECTED') void this.markConnected();
    });

    client.on('loading_screen', (percent: number, message: string) => {
      console.log(JSON.stringify({ level: 'info', message: 'WhatsApp Web loading', percent, detail: message }));
    });

    client.on('ready', () => {
      void this.markConnected();
    });

    client.on('auth_failure', message => {
      this.ready = false;
      this.state = 'ERRO';
      console.error(JSON.stringify({ level: 'error', message: 'WhatsApp authentication failed', detail: message }));
    });

    client.on('disconnected', (reason: string) => {
      this.ready = false;
      this.state = 'DESCONECTADO';
      console.warn(JSON.stringify({ level: 'warn', message: 'WhatsApp disconnected', reason }));
      void this.publishStatus?.('DESCONECTADO', null, null)
        .catch(error => console.error(JSON.stringify({ level: 'warn', message: 'Unable to publish WhatsApp disconnected status', detail: error instanceof Error ? error.message : String(error) })));
      if (!this.manualLogout) void this.reconnectAfterDisconnect();
    });

    // `message_create` inclui mensagens enviadas pelo próprio número conectado.
    // Assim, entradas e saídas passam por um único fluxo de persistência e não
    // são duplicadas pelo callback de sucesso da fila.
    client.on('message_create', (message: Message) => {
      const remoteId = message.fromMe ? message.to : message.from;
      if (!remoteId?.endsWith('@c.us') && !remoteId?.endsWith('@lid')) {
        console.log(JSON.stringify({ level: 'info', message: 'Ignoring non-contact WhatsApp event', from: message.from, to: message.to }));
        return;
      }
      void (async () => {
        let contactName: string | null = null;
        let contactAvatarUrl: string | null = null;
        let messagePhone = remoteId.replace(/\D/g, '');
        let contactPhone: string | null = null;
        try {
          const contact = await message.getContact();
          contactName = contact.pushname || contact.name || contact.shortName || null;
          contactPhone = this.normalizeContactPhone(contact.number ?? contact.id?.user);
          contactAvatarUrl = await contact.getProfilePicUrl().catch(() => null);
        } catch (error) {
          console.warn(JSON.stringify({ level: 'warn', message: 'Unable to read WhatsApp contact profile', detail: error instanceof Error ? error.message : String(error) }));
        }
        if (remoteId.endsWith('@lid') || !this.normalizeContactPhone(messagePhone)) {
          // O WhatsApp Web pode entregar mensagens usando LID em vez do
          // telefone. O índice criado a partir dos contatos do CRM é mais
          // rápido e confiável que esperar a API interna de resolução.
          messagePhone = contactPhone
            ?? this.chatPhoneById.get(remoteId)
            ?? await this.resolveContactPhone(remoteId)
            ?? this.normalizeContactPhone(messagePhone)
            ?? '';
        }
        const normalizedMessagePhone = this.normalizeContactPhone(messagePhone);
        if (!normalizedMessagePhone) {
          console.warn(JSON.stringify({ level: 'warn', message: 'WhatsApp event received without resolved phone; using chat identity lookup', remoteId }));
        } else {
          messagePhone = normalizedMessagePhone;
        }
        let quotedMessageId: string | null = null;
        let quotedContent: string | null = null;
        let mediaUrl: string | null = null;
        let mediaStoragePath: string | null = null;
        let mediaMimeType: string | null = null;
        try {
          if (message.hasQuotedMsg) {
            const quoted = await message.getQuotedMessage();
            quotedMessageId = quoted.id?.id ?? null;
            quotedContent = quoted.body ?? null;
          }
        } catch (error) {
          console.warn(JSON.stringify({ level: 'warn', message: 'Unable to read quoted WhatsApp message', detail: error instanceof Error ? error.message : String(error) }));
        }
        if (message.hasMedia && this.uploadIncomingMedia && normalizedMessagePhone) {
          try {
            const media = await message.downloadMedia();
            if (media?.data && media.mimetype) {
              const stored = await this.uploadIncomingMedia({
                phone: messagePhone,
                mimeType: media.mimetype,
                fileName: media.filename || `whatsapp-${message.id.id}`,
                body: Buffer.from(media.data, 'base64')
              });
              mediaUrl = stored.url;
              mediaStoragePath = stored.storagePath;
              mediaMimeType = stored.mimeType;
            }
          } catch (error) {
            console.warn(JSON.stringify({ level: 'warn', message: 'Unable to store incoming WhatsApp media', detail: error instanceof Error ? error.message : String(error) }));
          }
        }
        await this.publishIncomingMessage?.({
          messageId: message.id.id,
          phone: messagePhone,
          whatsappChatId: remoteId,
          direction: message.fromMe ? 'OUTBOUND' : 'INBOUND',
          messageType: message.type,
          content: message.body ?? '',
          mediaUrl,
          mediaStoragePath,
          mediaMimeType,
          quotedMessageId,
          quotedContent,
          senderDisplayName: message.fromMe ? null : contactName ?? message.author ?? message.from,
          contactName,
          contactAvatarUrl,
          createdAt: new Date(message.timestamp * 1000).toISOString()
        });
      })().catch(error => console.error(JSON.stringify({ level: 'warn', message: 'Unable to persist incoming WhatsApp message', detail: error instanceof Error ? error.message : String(error) })));
    });

    return client;
  }

  private async syncExistingChats() {
    if (!this.client || !this.publishIncomingMessage || !this.listContactPhones) return;
    let phoneNumbers: string[] = [];
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        phoneNumbers = await this.listContactPhones();
        break;
      } catch (error) {
        console.warn(JSON.stringify({ level: 'warn', message: 'Radar contact list not ready; retrying', attempt, detail: error instanceof Error ? error.message : String(error) }));
        if (attempt === 3) throw error;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    const connectedPhone = this.client.info?.wid?.user?.replace(/\D/g, '') || null;
    const chatTargets = await this.buildChatTargets(phoneNumbers);
    const syncPhoneNumbers = phoneNumbers
      .filter(phone => !this.samePhone(phone, connectedPhone))
      .filter((phone, index, values) => values.findIndex(item => this.phoneIdentity(item) === this.phoneIdentity(phone)) === index)
      .slice(0, 500);
    let synced = 0;
    for (const phone of syncPhoneNumbers) {
      let contactName: string | null = null;
      let contactAvatarUrl: string | null = null;
      const chatTarget = chatTargets.get(phone);
      const chatId = chatTarget?.serializedId ?? `${phone}@c.us`;
      try {
        const contact = chatTarget?.contact ?? await this.client.getContactById(`${phone}@c.us`) as unknown as WhatsAppContactProfile;
        contactName = contact.pushname || contact.name || contact.shortName || chatTarget?.fullName || null;
        contactAvatarUrl = await contact.getProfilePicUrl().catch(() => null);
        await this.updateContactProfile?.({ phone, whatsappChatId: chatId, fullName: contactName, avatarUrl: contactAvatarUrl });
      } catch (error) {
        contactName = chatTarget?.fullName ?? null;
        console.warn(JSON.stringify({ level: 'warn', message: 'Unable to sync WhatsApp contact profile', phone, detail: error instanceof Error ? error.message : String(error) }));
      }

      try {
        const messages = await this.fetchChatMessages(chatId, 30);
        for (const message of messages) {
          const fromMe = Boolean(message.fromMe ?? message.id.fromMe);
          const remoteId = this.serializeWhatsAppId(fromMe ? message.to : message.from);
          // Chats identificados como @lid não expõem o telefone no modelo da
          // mensagem; o chat já foi associado ao telefone do CRM acima.
          const messagePhone = remoteId?.endsWith('@c.us') ? remoteId.replace(/\D/g, '') : phone;
          const timestamp = Number(message.timestamp ?? message.t);
          if (!Number.isFinite(timestamp) || timestamp <= 0) continue;
          const media = await this.downloadHistoricalMedia(message, messagePhone);
          await this.publishIncomingMessage({
            messageId: message.id.id,
            phone: messagePhone,
            whatsappChatId: chatId,
            direction: fromMe ? 'OUTBOUND' : 'INBOUND',
            messageType: message.type,
            content: media ? '' : this.normalizeMessageContent(message.type, message.body),
            mediaUrl: media?.url ?? null,
            mediaStoragePath: media?.storagePath ?? null,
            mediaMimeType: media?.mimeType ?? null,
            senderDisplayName: fromMe ? null : contactName,
            contactName,
            contactAvatarUrl,
            createdAt: new Date(timestamp * 1000).toISOString()
          });
          synced += 1;
        }
      } catch (error) {
        console.warn(JSON.stringify({ level: 'warn', message: 'Unable to sync WhatsApp contact chat', phone, detail: error instanceof Error ? error.message : String(error) }));
      }
    }
    console.log(JSON.stringify({ level: 'info', message: 'WhatsApp CRM chat sync completed', contacts: syncPhoneNumbers.length, skippedConnectedNumber: connectedPhone ? 1 : 0, messages: synced }));
  }

  private startChatSyncTimer() {
    if (this.syncTimer) return;
    this.syncTimer = setInterval(() => {
      if (!this.ready || this.syncInProgress) return;
      this.syncInProgress = true;
      void this.syncExistingChats()
        .catch(error => console.error(JSON.stringify({ level: 'warn', message: 'Unable to refresh WhatsApp chats', detail: error instanceof Error ? error.message : String(error) })))
        .finally(() => { this.syncInProgress = false; });
    }, 120_000);
    this.syncTimer.unref?.();
  }

  private normalizeContactPhone(value: unknown) {
    const digits = String(value ?? '').replace(/\D/g, '');
    return /^55[1-9][0-9]{9,10}$/.test(digits) ? digits : null;
  }

  private phoneIdentity(value: unknown) {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (!/^55[1-9][0-9]{9,10}$/.test(digits)) return digits;
    const local = digits.slice(4);
    return local.length === 9 && local.startsWith('9')
      ? `${digits.slice(0, 4)}${local.slice(1)}`
      : digits;
  }

  private samePhone(left: unknown, right: unknown) {
    return Boolean(left && right && this.phoneIdentity(left) === this.phoneIdentity(right));
  }

  private async resolveContactPhone(serializedId: string) {
    const resolver = (this.client as unknown as {
      getContactLidAndPhone?: (userIds: string[]) => Promise<Array<{ pn?: string | null }>>;
    } | null)?.getContactLidAndPhone;
    if (!resolver) return null;
    try {
      const [mapping] = await resolver([serializedId]);
      return this.normalizeContactPhone(mapping?.pn);
    } catch {
      return null;
    }
  }

  private async sendToLoadedChat(chatId: string, content: string, media?: WhatsAppMediaInfo, caption?: string) {
    const page = (this.client as unknown as {
      pupPage?: { evaluate: (fn: unknown, ...args: unknown[]) => Promise<unknown> };
    } | null)?.pupPage;
    if (!page) throw new Error('A página do WhatsApp Web ainda não está disponível.');
    const sent = await page.evaluate(async (id: string, body: string, mediaInfo: WhatsAppMediaInfo | null, mediaCaption: string) => {
      const whatsAppWindow = window as typeof window & { WWebJS: { getChat: (chatId: string, options: { getAsModel: boolean }) => Promise<any>; sendMessage: (chat: unknown, content: string, options: Record<string, unknown>) => Promise<any> }; require: (name: string) => any };
      const chat = await whatsAppWindow.WWebJS.getChat(id, { getAsModel: false });
      if (!chat) return null;
      const options: Record<string, unknown> = { linkPreview: true, waitUntilMsgSent: true };
      if (mediaInfo) {
        options.media = mediaInfo;
        options.caption = mediaCaption;
        if (mediaInfo.mimetype.startsWith('audio/')) options.sendAudioAsVoice = mediaInfo.mimetype === 'audio/ogg';
        body = '';
      }
      // O helper WWebJS espera um modelo completo e algumas versões do WhatsApp
      // Web rejeitam modelos obtidos pelo indice com "Data passed to getter".
      // O proprio modelo Chat possui o mesmo envio e preserva o id interno.
      const message = await whatsAppWindow.WWebJS.sendMessage(chat, body, options);
      return message?.id?._serialized ?? message?.id?.id ?? null;
    }, chatId, content, media ?? null, caption ?? content) as string | null;
    if (!sent) throw new Error('O WhatsApp Web não confirmou o envio para a conversa carregada.');
    return { id: { id: sent } };
  }

  private async buildChatTargets(expectedPhones: string[] = []) {
    const targets = new Map<string, WhatsAppChatTarget>();
    if (!this.client) return targets;
    try {
      const chats = await this.client.getChats();
      this.chatIndexFallbackLogged = false;
      for (const chat of chats) {
        const serializedId = chat.id?._serialized;
        if (!serializedId || chat.isGroup || (!serializedId.endsWith('@c.us') && !serializedId.endsWith('@lid'))) continue;
        try {
          const contact = await chat.getContact() as unknown as WhatsAppContactProfile;
          const candidates = [contact.number, contact.id?.user, chat.id?.user]
            .map(value => this.normalizeContactPhone(value))
            .filter((value): value is string => Boolean(value));
          for (const phone of candidates) {
            targets.set(phone, { serializedId, contact });
            this.chatPhoneById.set(serializedId, phone);
            const local = phone.slice(4);
            if (local.length === 9 && local.startsWith('9')) targets.set(`${phone.slice(0, 4)}${local.slice(1)}`, { serializedId, contact });
            if (local.length === 8) targets.set(`${phone.slice(0, 4)}9${local}`, { serializedId, contact });
          }
        } catch (error) {
          console.warn(JSON.stringify({ level: 'warn', message: 'Unable to map WhatsApp chat to a CRM phone', chatId: serializedId, detail: error instanceof Error ? error.message : String(error) }));
        }
      }
    } catch (error) {
      if (!this.chatIndexFallbackLogged) {
        this.chatIndexFallbackLogged = true;
        console.warn(JSON.stringify({ level: 'warn', message: 'WhatsApp chat model list failed; using a safe raw chat index', detail: error instanceof Error ? error.message : String(error) }));
      }
      const page = (this.client as unknown as { pupPage?: { evaluate: (fn: unknown, ...args: unknown[]) => Promise<unknown> } } | null)?.pupPage;
      if (!page) return targets;
      try {
        const rawTargets = await (page.evaluate(() => {
          const collections = (window as typeof window & { require: (name: string) => any }).require('WAWebCollections');
          return collections.Chat.getModelsArray().flatMap((chat: any) => {
            const serializedId = chat?.id?._serialized;
            if (!serializedId || chat.isGroup || (!serializedId.endsWith('@c.us') && !serializedId.endsWith('@lid'))) return [];
            let contact: any = null;
            try { contact = collections.Contact?.get(chat.id) ?? collections.Contact?.get(serializedId); } catch { contact = null; }
            const serialized = contact?.serialize?.() ?? {};
            return [{
              serializedId,
              phone: contact?.phoneNumber ?? serialized.phoneNumber ?? serialized.number ?? null,
              fullName: contact?.pushname || contact?.name || contact?.shortName || serialized.pushname || serialized.name || serialized.shortName || chat.formattedTitle || null
            }];
          });
        }) as Promise<Array<{ serializedId?: string; phone?: string | null; fullName?: string | null }>>);
        const resolveLidPhones = (this.client as unknown as {
          getContactLidAndPhone?: (userIds: string[]) => Promise<Array<{ lid?: string | null; pn?: string | null }>>;
        }).getContactLidAndPhone;
        const userIds = [
          ...rawTargets.map(target => target.serializedId),
          ...expectedPhones.map(phone => `${phone}@c.us`)
        ].filter((value): value is string => Boolean(value));
        const lidMappings = resolveLidPhones
          ? await resolveLidPhones([...new Set(userIds)]).catch(() => [])
          : [];
        const mappingByLid = new Map(lidMappings.map(mapping => [mapping.lid, mapping.pn]));
        for (const mapping of lidMappings) {
          const phone = this.normalizeContactPhone(mapping.pn);
          if (phone && mapping.lid) {
            targets.set(phone, { serializedId: mapping.lid, fullName: null });
            this.chatPhoneById.set(mapping.lid, phone);
            const local = phone.slice(4);
            if (local.length === 9 && local.startsWith('9')) targets.set(`${phone.slice(0, 4)}${local.slice(1)}`, { serializedId: mapping.lid, fullName: null });
            if (local.length === 8) targets.set(`${phone.slice(0, 4)}9${local}`, { serializedId: mapping.lid, fullName: null });
          }
        }
        for (const target of rawTargets) {
          const phone = this.normalizeContactPhone(target.phone ?? mappingByLid.get(target.serializedId));
          if (phone && target.serializedId) {
            targets.set(phone, { serializedId: target.serializedId, fullName: target.fullName ?? null });
            this.chatPhoneById.set(target.serializedId, phone);
            const local = phone.slice(4);
            if (local.length === 9 && local.startsWith('9')) targets.set(`${phone.slice(0, 4)}${local.slice(1)}`, { serializedId: target.serializedId, fullName: target.fullName ?? null });
            if (local.length === 8) targets.set(`${phone.slice(0, 4)}9${local}`, { serializedId: target.serializedId, fullName: target.fullName ?? null });
          }
        }
      } catch (fallbackError) {
        console.warn(JSON.stringify({ level: 'warn', message: 'Unable to build raw WhatsApp chat index', detail: fallbackError instanceof Error ? fallbackError.message : String(fallbackError) }));
      }
    }
    return targets;
  }

  private normalizeMessageContent(messageType: string, body?: string) {
    const value = body ?? '';
    const mediaType = /^(image|video|audio|ptt|document|sticker|album)$/i.test(messageType);
    // Alguns modelos internos do WhatsApp Web colocam o binário/base64 no body.
    // Nunca persistimos esse conteúdo como texto da conversa.
    if (mediaType && value.length > 1000) return '';
    if (/^data:[^;]+;base64,/i.test(value)) return '';
    return value;
  }

  private async downloadHistoricalMedia(message: HistoryMessage, phone: string) {
    if (!this.uploadIncomingMedia) return null;
    const hydrated = await this.client?.getMessageById(message.id.id).catch(() => null);
    if (hydrated?.hasMedia) {
      try {
        const media = await hydrated.downloadMedia();
        if (media?.data && media.mimetype) {
          return await this.uploadIncomingMedia({
            phone,
            mimeType: media.mimetype,
            fileName: media.filename || `whatsapp-${message.id.id}`,
            body: Buffer.from(media.data, 'base64')
          });
        }
      } catch (error) {
        console.warn(JSON.stringify({ level: 'warn', message: 'Unable to store historical WhatsApp media', messageId: message.id.id, detail: error instanceof Error ? error.message : String(error) }));
      }
    }

    // Fallback para modelos históricos que já entregam a imagem como base64.
    const mimeByType: Record<string, string> = { image: 'image/jpeg', sticker: 'image/webp', ptt: 'audio/ogg', audio: 'audio/ogg' };
    const mimeType = mimeByType[message.type.toLowerCase()];
    const rawBody = message.body ?? '';
    if (!mimeType || rawBody.length <= 1000 || /^data:/i.test(rawBody)) return null;
    try {
      const body = Buffer.from(rawBody, 'base64');
      if (body.length === 0) return null;
      const extension = mimeType === 'image/webp' ? 'webp' : mimeType === 'audio/ogg' ? 'ogg' : 'jpg';
      return await this.uploadIncomingMedia({ phone, mimeType, fileName: `whatsapp-${message.id.id}.${extension}`, body });
    } catch (error) {
      console.warn(JSON.stringify({ level: 'warn', message: 'Unable to decode historical WhatsApp media', messageId: message.id.id, detail: error instanceof Error ? error.message : String(error) }));
      return null;
    }
  }

  private async fetchChatMessages(chatId: string, limit: number) {
    const page = (this.client as unknown as { pupPage?: { evaluate: (fn: unknown, ...args: unknown[]) => Promise<unknown> } } | null)?.pupPage;
    if (!page) return [] as HistoryMessage[];
    return await page.evaluate(async (id: string, messageLimit: number) => {
      const whatsAppWindow = window as typeof window & { WWebJS: { getChat: (chatId: string, options: { getAsModel: boolean }) => Promise<any>; getMessageModel: (message: unknown) => unknown }; require: (name: string) => any };
      const collections = whatsAppWindow.require('WAWebCollections');
      // Em modo de endereçamento LID, findOrCreateLatestChat pode lançar
      // "No LID for user" mesmo quando o chat já está carregado. Use o
      // modelo presente na coleção antes de tentar a API pública.
      const chat = collections.Chat.getModelsArray().find((model: any) => model?.id?._serialized === id)
        ?? (id.endsWith('@lid') ? null : await whatsAppWindow.WWebJS.getChat(id, { getAsModel: false }));
      if (!chat || chat.isGroup || !chat.msgs?.getModelsArray) return [];
      const filter = (message: { isNotification?: boolean; id: { fromMe: boolean } }) => !message.isNotification;
      let messages = chat.msgs.getModelsArray().filter(filter);
      while (messages.length < messageLimit) {
        const loaded = await whatsAppWindow.require('WAWebChatLoadMessages').loadEarlierMsgs({ chat });
        if (!loaded?.length) break;
        messages = [...loaded.filter(filter), ...messages];
      }
      if (messages.length > messageLimit) {
        messages.sort((left: { t: number }, right: { t: number }) => left.t - right.t);
        messages = messages.slice(-messageLimit);
      }
      return messages.map((message: unknown) => whatsAppWindow.WWebJS.getMessageModel(message));
    }, chatId, limit) as Promise<HistoryMessage[]>;
  }

  private serializeWhatsAppId(value: unknown) {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && '_serialized' in value) {
      const serialized = (value as { _serialized?: unknown })._serialized;
      return typeof serialized === 'string' ? serialized : null;
    }
    return null;
  }

  async initialize() {
    if (!this.client) this.client = this.createClient();
    this.state = 'INICIALIZANDO';
    // Remove somente locks órfãos do Chromium; cookies e demais dados da sessão são preservados.
    const profilePath = join(config.WHATSAPP_SESSION_PATH, `session-${config.WHATSAPP_CLIENT_ID}`);
    await Promise.all(['SingletonLock', 'SingletonCookie', 'SingletonSocket'].map(file => rm(join(profilePath, file), { force: true }).catch(() => undefined)));
    await Promise.all(['Cache', 'Code Cache', 'GPUCache'].map(directory => rm(join(profilePath, directory), { force: true, recursive: true }).catch(() => undefined)));
    await this.client.initialize();
  }

  getState() {
    return { state: this.state, ready: this.ready };
  }

  private async markConnected() {
    if (this.ready) return;
    this.ready = true;
    this.state = 'CONECTADO';
    await this.publishConnectedStatus()
      .catch(error => console.error(JSON.stringify({ level: 'warn', message: 'Unable to publish WhatsApp connected status', detail: error instanceof Error ? error.message : String(error) })));
    if (!this.syncInProgress) {
      this.syncInProgress = true;
      void this.syncExistingChats()
        .catch(error => console.error(JSON.stringify({ level: 'warn', message: 'Unable to sync existing WhatsApp chats', detail: error instanceof Error ? error.message : String(error) })))
        .finally(() => { this.syncInProgress = false; });
    }
    this.startChatSyncTimer();
  }

  private async waitForConnectedState() {
    for (let attempt = 0; attempt < 30 && !this.ready; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        const state = await this.client?.getState();
        if (state === 'CONNECTED') {
          await this.markConnected();
          return;
        }
      } catch {
        // The WhatsApp page can reject getState while it is still loading.
      }
    }
  }

  private async reconnectAfterDisconnect() {
    if (this.reconnecting || this.manualLogout) return;
    this.reconnecting = true;
    try {
      await this.publishStatus?.('INICIALIZANDO', null, null);
      await new Promise(resolve => setTimeout(resolve, config.WHATSAPP_RECONNECT_DELAY_MS));
      const currentClient = this.client;
      await currentClient?.destroy().catch(() => undefined);
      if (this.manualLogout) return;
      this.client = this.createClient();
      await this.initialize();
    } catch (error) {
      this.state = 'ERRO';
      await this.publishStatus?.('ERRO', null, null).catch(() => undefined);
      console.error(JSON.stringify({ level: 'error', message: 'WhatsApp automatic reconnect failed', detail: error instanceof Error ? error.message : String(error) }));
    } finally {
      this.reconnecting = false;
    }
  }

  private async publishConnectedStatus() {
    // O whatsapp-web.js pode disparar `ready` antes de preencher `client.info.wid`.
    // Aguarda alguns ciclos para persistir o telefone real da conta conectada.
    let phoneNumber: string | null = null;
    for (let attempt = 0; attempt < 10 && !phoneNumber; attempt += 1) {
      const user = this.client?.info?.wid?.user;
      if (user) phoneNumber = user.replace(/\D/g, '') || null;
      if (!phoneNumber) await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(JSON.stringify({ level: 'info', message: 'WhatsApp client ready', phoneNumber }));
    await this.publishStatus?.('CONECTADO', null, phoneNumber);
  }

  async sendMessage(phone: string, content: string, media?: {
    mediaUrl?: string | null;
    mediaMimeType?: string | null;
    mediaFilename?: string | null;
    mediaCaption?: string | null;
  }) {
    if (!this.ready) throw new Error('WhatsApp ainda não está conectado.');
    const digits = phone.replace(/\D/g, '');
    if (!/^55[1-9][0-9]{9,10}$/.test(digits)) {
      throw new Error('Telefone inválido: esperado 55 + DDD + número sem máscara.');
    }
    if (!this.client) throw new Error('WhatsApp ainda nÃ£o estÃ¡ conectado.');
    const sendOperation = (async () => {
      let numberId: { _serialized: string } | null = null;
      let registered: boolean | null = null;
      try {
        registered = await this.client!.isRegisteredUser(digits);
      } catch (error) {
        console.warn(JSON.stringify({ level: 'warn', message: 'Nao foi possivel confirmar o cadastro do numero no WhatsApp; tentando a conversa existente.', phone: digits, detail: error instanceof Error ? error.message : String(error) }));
      }
      if (registered === false) {
        const loadedTargets = await this.buildChatTargets([digits]);
        const loadedTarget = [...loadedTargets.entries()].find(([phone]) => this.samePhone(phone, digits))?.[1];
        if (!loadedTarget) throw new Error('Número sem WhatsApp registrado.');
      }
      try {
        numberId = await this.client!.getNumberId(digits) as { _serialized: string } | null;
      } catch (error) {
        console.warn(JSON.stringify({ level: 'warn', message: 'WhatsApp Web não resolveu o telefone pelo método padrão; tentando a conversa carregada.', phone: digits, detail: error instanceof Error ? error.message : String(error) }));
      }
      let chatId = numberId?._serialized ?? null;
      if (!chatId) {
        const targets = await this.buildChatTargets([digits]);
        chatId = [...targets.entries()].find(([phone]) => this.samePhone(phone, digits))?.[1].serializedId ?? null;
      }
      if (!chatId) throw new Error('O número não possui uma conversa WhatsApp disponível nesta sessão.');
      // O WhatsApp Web pode emitir `message_create` usando o identificador LID
      // (`...@lid`) em vez do telefone. Registre o vínculo antes de disparar a
      // mensagem para que o evento de saída consiga localizar o contato no CRM
      // e persistir a mensagem no histórico sem depender de uma resolução
      // assíncrona posterior.
      this.chatPhoneById.set(chatId, digits);
      if (numberId?._serialized) this.chatPhoneById.set(numberId._serialized, digits);
      try {
        const loadedChat = await this.client!.getChatById(chatId);
        const loadedChatId = loadedChat.id?._serialized;
        if (loadedChatId) this.chatPhoneById.set(loadedChatId, digits);
        const loadedContact = await loadedChat.getContact().catch(() => null);
        const loadedContactId = loadedContact?.id?._serialized;
        if (loadedContactId) this.chatPhoneById.set(loadedContactId, digits);
      } catch (error) {
        // Alguns chats LID não aceitam leitura pelo modelo público. O vínculo
        // com o chatId original já foi salvo e continua sendo usado como
        // fallback pelo evento `message_create`.
        console.warn(JSON.stringify({ level: 'info', message: 'WhatsApp chat identity could not be expanded before sending', chatId, detail: error instanceof Error ? error.message : String(error) }));
      }
      if (!media?.mediaUrl) return numberId ? this.client!.sendMessage(chatId, content) : this.sendToLoadedChat(chatId, content);

      const mediaFile = await whatsappWeb.MessageMedia.fromUrl(media.mediaUrl, {
        unsafeMime: true,
        filename: media.mediaFilename ?? undefined,
        reqOptions: { size: config.WHATSAPP_MEDIA_MAX_BYTES }
      });
      const allowedMime = /^(image\/(jpeg|png|webp|gif)|application\/(pdf|msword|vnd\.ms-(excel|powerpoint)|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))|text\/(plain|csv)|audio\/(ogg|mpeg|wav|mp4|webm))$/i;
      if (!allowedMime.test(mediaFile.mimetype)) {
        throw new Error(`Tipo de arquivo não permitido para envio: ${mediaFile.mimetype}`);
      }
      const mediaOptions = { caption: media.mediaCaption ?? content, ...(mediaFile.mimetype.startsWith('audio/') ? { sendAudioAsVoice: mediaFile.mimetype === 'audio/ogg' } : {}) };
      if (numberId) return this.client!.sendMessage(chatId, mediaFile, mediaOptions);
      const mediaPhoneCandidates = new Set([digits]);
      const localPhone = digits.slice(4);
      if (localPhone.length === 8) mediaPhoneCandidates.add(`${digits.slice(0, 4)}9${localPhone}`);
      if (localPhone.length === 9 && localPhone.startsWith('9')) mediaPhoneCandidates.add(`${digits.slice(0, 4)}${localPhone.slice(1)}`);
      let lastMediaError: unknown = null;
      for (const candidate of mediaPhoneCandidates) {
        try {
          return await this.client!.sendMessage(`${candidate}@c.us`, mediaFile, mediaOptions);
        } catch (error) {
          lastMediaError = error;
        }
      }
      if (lastMediaError instanceof Error && !lastMediaError.message.includes('Data passed to getter')) throw lastMediaError;
      return this.client!.sendMessage(chatId, mediaFile, mediaOptions);
    })();
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        sendOperation,
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new WhatsAppSendTimeoutError(config.WHATSAPP_SEND_TIMEOUT_MS)), config.WHATSAPP_SEND_TIMEOUT_MS); })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async logout() {
    this.manualLogout = true;
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = undefined;
    const currentClient = this.client;
    try {
      if (currentClient) await currentClient.logout();
    } catch (error) {
      console.warn(JSON.stringify({ level: 'warn', message: 'WhatsApp logout reported an error; restarting authentication', detail: error instanceof Error ? error.message : String(error) }));
      await currentClient?.destroy().catch(() => undefined);
    }
    this.ready = false;
    this.state = 'DESCONECTADO';
    await this.publishStatus?.('DESCONECTADO', null, null);
    // logout() pode destruir a instÃ¢ncia do Puppeteer. Recriar o cliente
    // garante que o whatsapp-web.js emita um novo QR Code.
    this.client = this.createClient();
    try {
      await this.initialize();
    } finally {
      this.manualLogout = false;
    }
  }

  async destroy() {
    this.manualLogout = true;
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = undefined;
    this.ready = false;
    const currentClient = this.client;
    this.client = null;
    await currentClient?.destroy();
  }
}
