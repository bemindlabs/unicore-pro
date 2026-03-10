// DnsLookupService — resolves TXT records using Node.js dns.promises
// TypeScript 5.5+, ES2022, strict mode

import { Injectable, Logger } from '@nestjs/common';
import { promises as dnsPromises } from 'node:dns';
import type { VerificationResult } from '../types/verification.types.js';

@Injectable()
export class DnsLookupService {
  private readonly logger = new Logger(DnsLookupService.name);

  /**
   * Resolve all TXT records for a domain.
   *
   * Returns an empty array when the domain has no TXT records or does not exist.
   * Propagates unexpected errors (non "no-record" DNS errors).
   *
   * @param domain - Domain to query, e.g. "example.com" or "_unicore-verify.example.com"
   */
  async resolveTxt(domain: string): Promise<string[]> {
    try {
      // dnsPromises.resolveTxt returns string[][] — each TXT record may be split into
      // multiple strings (RFC 4408 §3.1.3); we join each record's chunks.
      const raw = await dnsPromises.resolveTxt(domain);
      return raw.map((chunks) => chunks.join(''));
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code ?? 'UNKNOWN';
      // ENOTFOUND / ENODATA / ESERVFAIL all mean "no TXT record found" — return [].
      if (['ENOTFOUND', 'ENODATA', 'ESERVFAIL', 'ETIMEOUT', 'NXDOMAIN'].includes(code)) {
        return [];
      }
      this.logger.warn(
        `Unexpected DNS error for "${domain}" (${code}): ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * Check whether a specific TXT record value is present on the domain.
   *
   * Never throws — all errors are captured in the returned VerificationResult.
   *
   * @param domain          - Domain to query
   * @param expectedRecord  - Exact TXT value to match, e.g. "unicore-verify=<uuid>"
   */
  async checkVerificationRecord(
    domain: string,
    expectedRecord: string,
  ): Promise<VerificationResult> {
    const checkedAt = new Date();

    try {
      const txtRecordsFound = await this.resolveTxt(domain);
      const matched = txtRecordsFound.some((rec) => rec === expectedRecord);

      return {
        found: txtRecordsFound.length > 0,
        txtRecordsFound,
        expectedRecord,
        matched,
        checkedAt,
      };
    } catch (err: unknown) {
      const message = (err as Error).message ?? String(err);
      this.logger.error(`DNS check error for "${domain}": ${message}`);

      return {
        found: false,
        txtRecordsFound: [],
        expectedRecord,
        matched: false,
        checkedAt,
        error: message,
      };
    }
  }
}
