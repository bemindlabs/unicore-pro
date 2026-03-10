// VerificationEventsService — emits domain verification lifecycle events
// TypeScript 5.5+, ES2022, strict mode

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DOMAIN_VERIFICATION_EVENTS,
  DomainVerificationFailedEvent,
  DomainVerifiedEvent,
} from '../types/verification.types.js';

@Injectable()
export class VerificationEventsService {
  private readonly logger = new Logger(VerificationEventsService.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Emit `domain.verified` event.
   * Listeners can subscribe via `@OnEvent('domain.verified')`.
   */
  emitVerified(event: DomainVerifiedEvent): void {
    this.logger.log(
      `Emitting ${DOMAIN_VERIFICATION_EVENTS.VERIFIED} — domain="${event.domain}" domainId=${event.domainId}`,
    );
    this.eventEmitter.emit(DOMAIN_VERIFICATION_EVENTS.VERIFIED, event);
  }

  /**
   * Emit `domain.verification_failed` event.
   * Listeners can subscribe via `@OnEvent('domain.verification_failed')`.
   */
  emitVerificationFailed(event: DomainVerificationFailedEvent): void {
    this.logger.warn(
      `Emitting ${DOMAIN_VERIFICATION_EVENTS.VERIFICATION_FAILED} — domain="${event.domain}" ` +
        `after ${event.attempts} attempts (domainId=${event.domainId})`,
    );
    this.eventEmitter.emit(DOMAIN_VERIFICATION_EVENTS.VERIFICATION_FAILED, event);
  }
}
