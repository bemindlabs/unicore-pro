/**
 * Custom NestJS decorators for SSO-aware route handling.
 */

import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

// ---------------------------------------------------------------------------
// Metadata keys
// ---------------------------------------------------------------------------

export const SSO_REQUIRED_KEY = 'sso:required';
export const SSO_ORG_ID_KEY = 'sso:organizationId';

// ---------------------------------------------------------------------------
// @SsoRequired() — marks a route as requiring SSO authentication
// ---------------------------------------------------------------------------

/**
 * Marks a route as requiring SSO-based authentication.
 * Pair with SsoAuthGuard to enforce this requirement.
 */
export const SsoRequired = () => SetMetadata(SSO_REQUIRED_KEY, true);

// ---------------------------------------------------------------------------
// @SsoOrganization() — extracts the organizationId from the request
// ---------------------------------------------------------------------------

/**
 * Parameter decorator that extracts the organizationId from the JWT/session
 * context attached by the SsoAuthGuard.  Falls back to the 'orgId' route param.
 *
 * @example
 * \@Get('profile')
 * \@SsoRequired()
 * async getProfile(\@SsoOrganization() orgId: string) { ... }
 */
export const SsoOrganization = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<Request & { ssoOrganizationId?: string }>();
    return request.ssoOrganizationId ?? (request.params as Record<string, string>)?.['orgId'];
  },
);

// ---------------------------------------------------------------------------
// @SsoUser() — extracts the authenticated user info attached by SsoAuthGuard
// ---------------------------------------------------------------------------

export interface SsoRequestUser {
  userId: string;
  email: string;
  organizationId: string;
  nameId: string;
  sessionIndex?: string;
  isNewUser: boolean;
}

/**
 * Parameter decorator that returns the SSO-authenticated user attached to the
 * request by SsoAuthGuard after a successful SAML callback.
 */
export const SsoUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SsoRequestUser | undefined => {
    const request = ctx.switchToHttp().getRequest<Request & { ssoUser?: SsoRequestUser }>();
    return request.ssoUser;
  },
);
