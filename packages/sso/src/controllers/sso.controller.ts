/**
 * SsoController — REST endpoints for SSO flows.
 *
 * Endpoints:
 *   GET  /sso/:orgId/metadata          — SP SAML metadata XML
 *   POST /sso/:orgId/login             — initiate SP-initiated login
 *   POST /sso/:orgId/callback          — ACS (Assertion Consumer Service) callback
 *   POST /sso/:orgId/logout            — initiate SLO
 *   GET  /sso/config/:orgId            — get SSO config
 *   POST /sso/config                   — create SSO config
 *   PATCH /sso/config/:id              — update SSO config
 *   DELETE /sso/config/:id             — delete SSO config
 *   POST /sso/config/:id/metadata      — import IdP metadata XML
 *   POST /sso/config/:id/metadata/refresh — refresh from idpMetadataUrl
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Header,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { SsoService } from '../services/sso.service.js';
import { SsoConfigService } from '../services/sso-config.service.js';
import { generateSpMetadataXml } from '../helpers/metadata.helpers.js';
import {
  CreateSsoConfigDto,
  UpdateSsoConfigDto,
  InitiateSsoLoginDto,
  SamlCallbackDto,
  InitiateSloDto,
  ImportIdpMetadataDto,
} from '../dto/sso.dto.js';

@Controller('sso')
export class SsoController {
  constructor(
    private readonly ssoService: SsoService,
    private readonly ssoConfigService: SsoConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // SAML flow endpoints
  // ---------------------------------------------------------------------------

  /** Returns SP SAML metadata XML for the given organization. */
  @Get(':orgId/metadata')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  async getSpMetadata(@Param('orgId') orgId: string): Promise<string> {
    const config = await this.ssoConfigService.findByOrganization(orgId);
    return generateSpMetadataXml(config);
  }

  /** Initiates SP-initiated SSO login — returns a redirect URL. */
  @Post(':orgId/login')
  @HttpCode(HttpStatus.OK)
  async initiateLogin(
    @Param('orgId') orgId: string,
    @Body() dto: InitiateSsoLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ redirectUrl: string; relayState: string }> {
    const result = await this.ssoService.initiateLogin({
      organizationId: orgId,
      redirectUrl: dto.redirectUrl,
      forceAuthn: dto.forceAuthn,
    });
    // Optionally set a cookie so the relay state can be verified server-side
    res.cookie('sso_relay', result.relayState, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 5 * 60 * 1000, // 5 minutes
    });
    return { redirectUrl: result.redirectUrl, relayState: result.relayState };
  }

  /**
   * ACS (Assertion Consumer Service) — receives the POST-binding SAMLResponse
   * from the IdP after authentication.
   */
  @Post(':orgId/callback')
  @HttpCode(HttpStatus.OK)
  async handleCallback(
    @Param('orgId') orgId: string,
    @Body() dto: SamlCallbackDto,
  ): Promise<{
    userId: string;
    email: string;
    isNewUser: boolean;
    relayState?: string;
  }> {
    const { callbackResult, userId, isNewUser } = await this.ssoService.handleCallback(
      orgId,
      dto.SAMLResponse,
      dto.RelayState,
    );
    return {
      userId,
      email: callbackResult.attributes.email,
      isNewUser,
      relayState: callbackResult.relayState,
    };
  }

  /** Initiates Single Logout (SLO). */
  @Post(':orgId/logout')
  @HttpCode(HttpStatus.OK)
  async initiateSlo(
    @Param('orgId') orgId: string,
    @Body() dto: InitiateSloDto,
  ): Promise<{ redirectUrl: string }> {
    return this.ssoService.initiateSlo({
      organizationId: orgId,
      userId: dto.userId,
      nameId: dto.nameId,
      nameIdFormat: dto.nameIdFormat,
      sessionIndex: dto.sessionIndex,
    });
  }

  // ---------------------------------------------------------------------------
  // Configuration management
  // ---------------------------------------------------------------------------

  @Get('config/:orgId')
  async getConfig(@Param('orgId') orgId: string) {
    return this.ssoConfigService.findByOrganization(orgId);
  }

  @Post('config')
  @HttpCode(HttpStatus.CREATED)
  async createConfig(@Body() dto: CreateSsoConfigDto) {
    return this.ssoConfigService.create({
      ...dto,
      emailAttribute: dto.emailAttribute ?? 'email',
      firstNameAttribute: dto.firstNameAttribute ?? 'firstName',
      lastNameAttribute: dto.lastNameAttribute ?? 'lastName',
      jitEnabled: dto.jitEnabled ?? true,
      jitAllowedDomains: dto.jitAllowedDomains ?? [],
      isEnabled: dto.isEnabled ?? false,
    });
  }

  @Patch('config/:id')
  async updateConfig(
    @Param('id') id: string,
    @Body() dto: UpdateSsoConfigDto,
  ) {
    return this.ssoConfigService.update(id, dto);
  }

  @Delete('config/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConfig(@Param('id') id: string): Promise<void> {
    return this.ssoConfigService.delete(id);
  }

  /** Import raw IdP metadata XML into a config record. */
  @Post('config/:id/metadata')
  async importMetadata(
    @Param('id') id: string,
    @Body() dto: ImportIdpMetadataDto,
  ) {
    if (dto.metadataXml) {
      return this.ssoConfigService.importIdpMetadataXml(id, dto.metadataXml);
    }
    return this.ssoConfigService.refreshIdpMetadata(id);
  }

  /** Refresh IdP metadata from the configured idpMetadataUrl. */
  @Post('config/:id/metadata/refresh')
  async refreshMetadata(@Param('id') id: string) {
    return this.ssoConfigService.refreshIdpMetadata(id);
  }
}
