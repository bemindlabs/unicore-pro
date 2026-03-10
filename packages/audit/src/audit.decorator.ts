import { SetMetadata } from '@nestjs/common';
import { AUDITED_OPTIONS_KEY, AUDIT_RESOURCE_KEY, AuditedOptions } from './types.js';

/**
 * @Audited() — method decorator that opts a controller action into automatic audit logging.
 *
 * Apply to any NestJS controller method that should be tracked.
 * The AuditInterceptor reads this metadata and persists a log entry after
 * every invocation.
 *
 * @example
 * ```ts
 * @Audited({ action: 'update', resource: 'contacts', resourceIdParam: 'id' })
 * @Patch(':id')
 * update(@Param('id') id: string, @Body() dto: UpdateContactDto) { ... }
 * ```
 */
export const Audited = (options: AuditedOptions = {}): MethodDecorator =>
  SetMetadata(AUDITED_OPTIONS_KEY, options);

/**
 * @AuditResource() — class decorator that sets a default resource name for all
 * methods in a controller.  @Audited() on individual methods can override this.
 *
 * @example
 * ```ts
 * @AuditResource('contacts')
 * @Controller('contacts')
 * export class ContactsController { ... }
 * ```
 */
export const AuditResource = (resource: string): ClassDecorator =>
  SetMetadata(AUDIT_RESOURCE_KEY, resource);
