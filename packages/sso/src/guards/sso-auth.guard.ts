/**
 * SsoAuthGuard — NestJS guard that verifies SSO session state.
 *
 * This guard is applied to routes decorated with @SsoRequired().
 * It reads the session / JWT context to confirm the user was authenticated
 * via SSO and that the session has not expired.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SSO_REQUIRED_KEY } from '../decorators/sso.decorators.js';

export interface SsoSession {
  userId: string;
  email: string;
  organizationId: string;
  nameId: string;
  sessionIndex?: string;
  authProvider: 'saml';
  issuedAt: number;
  expiresAt: number;
}

@Injectable()
export class SsoAuthGuard implements CanActivate {
  private readonly logger = new Logger(SsoAuthGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiresSso = this.reflector.getAllAndOverride<boolean>(SSO_REQUIRED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Route is not decorated with @SsoRequired — allow through
    if (!requiresSso) return true;

    const request = context.switchToHttp().getRequest<
      Request & { session?: Record<string, unknown>; ssoUser?: unknown }
    >();

    const ssoSession = this.extractSsoSession(request);

    if (!ssoSession) {
      throw new UnauthorizedException('SSO session not found. Please log in via SSO.');
    }

    if (Date.now() > ssoSession.expiresAt) {
      throw new UnauthorizedException('SSO session has expired. Please re-authenticate.');
    }

    // Attach user to request for use by @SsoUser() decorator
    (request as Record<string, unknown>)['ssoUser'] = {
      userId: ssoSession.userId,
      email: ssoSession.email,
      organizationId: ssoSession.organizationId,
      nameId: ssoSession.nameId,
      sessionIndex: ssoSession.sessionIndex,
      isNewUser: false,
    };

    (request as Record<string, unknown>)['ssoOrganizationId'] = ssoSession.organizationId;

    return true;
  }

  private extractSsoSession(
    request: Request & { session?: Record<string, unknown> },
  ): SsoSession | null {
    const session = request.session;
    if (!session) return null;

    const ssoData = session['sso'] as SsoSession | undefined;
    if (!ssoData || ssoData.authProvider !== 'saml') return null;

    return ssoData;
  }
}
