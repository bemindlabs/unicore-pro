/**
 * Email channel adapter.
 * Outbound via SMTP (nodemailer-compatible). Inbound via IMAP polling.
 * Designed to be injected with actual SMTP/IMAP client implementations.
 */

import { BaseChannelAdapter } from '../base-channel.adapter.js';
import type { EmailChannelConfig } from '../../types/channel-config.types.js';
import type { ChannelMessage, OutboundMessage, SendResult } from '../../types/channel-message.types.js';

/**
 * Minimal contract for an SMTP transport — allows injection of nodemailer or any compatible lib.
 */
export interface SmtpTransport {
  sendMail(options: SmtpMailOptions): Promise<{ messageId?: string }>;
  close(): void;
}

export interface SmtpMailOptions {
  from: string;
  to: string | string[];
  subject?: string;
  text?: string;
  html?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; path?: string; content?: Buffer | string }>;
}

/**
 * Minimal contract for an IMAP client.
 */
export interface ImapClient {
  connect(): Promise<void>;
  startListening(mailbox: string, onMessage: (email: ParsedEmail) => void): void;
  stopListening(): void;
  disconnect(): Promise<void>;
}

export interface ParsedEmail {
  messageId: string;
  from: string;
  fromName?: string;
  to: string;
  subject?: string;
  text?: string;
  html?: string;
  date?: Date;
  attachments?: Array<{ filename: string; contentType: string; size: number; content?: Buffer }>;
}

export class EmailAdapter extends BaseChannelAdapter {
  private smtpTransport?: SmtpTransport;
  private imapClient?: ImapClient;
  private pollingTimer?: ReturnType<typeof setInterval>;

  constructor(
    config: EmailChannelConfig,
    private readonly smtpFactory?: (config: EmailChannelConfig) => SmtpTransport,
    private readonly imapFactory?: (config: EmailChannelConfig) => ImapClient,
  ) {
    super(config);
  }

  private get cfg(): EmailChannelConfig {
    return this.config as EmailChannelConfig;
  }

  async connect(): Promise<void> {
    this.status = 'initializing';
    try {
      if (this.smtpFactory) {
        this.smtpTransport = this.smtpFactory(this.cfg);
      }

      if (this.imapFactory && this.cfg.imap) {
        this.imapClient = this.imapFactory(this.cfg);
        await this.imapClient.connect();
        this.imapClient.startListening(
          this.cfg.imap.mailbox ?? 'INBOX',
          (email) => this.emit(this.normalizeEmail(email)),
        );
      }

      this.setConnected();
    } catch (err) {
      this.setError(`Email connect failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.smtpTransport?.close();
    await this.imapClient?.disconnect();
    this.setDisconnected();
    this.messageSubject.complete();
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (!this.smtpTransport) {
      return this.failResult('SMTP transport not configured');
    }

    try {
      const mailOptions: SmtpMailOptions = {
        from: this.cfg.fromName
          ? `"${this.cfg.fromName}" <${this.cfg.from}>`
          : this.cfg.from,
        to: message.recipientId,
        subject: (message.metadata?.['subject'] as string | undefined) ?? '(No Subject)',
        text: message.text,
        html: (message.metadata?.['html'] as string | undefined),
        replyTo: (message.metadata?.['replyTo'] as string | undefined),
        attachments: message.attachments?.map((a) => ({
          filename: a.filename ?? 'attachment',
          path: a.url,
        })),
      };

      const result = await this.smtpTransport.sendMail(mailOptions);
      return this.successResult(result.messageId);
    } catch (err) {
      return this.failResult((err as Error).message);
    }
  }

  /**
   * Manually ingest a parsed email (e.g., from a webhook like SendGrid Inbound Parse).
   */
  ingestEmail(email: ParsedEmail): void {
    this.emit(this.normalizeEmail(email));
  }

  private normalizeEmail(email: ParsedEmail): ChannelMessage {
    return this.buildMessage({
      channel: 'email',
      externalId: email.messageId,
      text: email.text ?? email.html,
      contentType: email.attachments?.length ? 'file' : 'text',
      attachments: email.attachments?.map((a) => ({
        type: 'file' as const,
        filename: a.filename,
        mimeType: a.contentType,
        size: a.size,
      })),
      sender: {
        id: email.from,
        name: email.fromName,
        isBot: false,
      },
      conversation: {
        id: email.from,
        type: 'direct',
      },
      timestamp: email.date?.toISOString() ?? new Date().toISOString(),
      metadata: {
        subject: email.subject,
        to: email.to,
      },
      rawPayload: email as unknown as Record<string, unknown>,
    });
  }
}
