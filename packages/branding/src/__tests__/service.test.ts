import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { BrandingService, MemoryBrandingStorage, FileBrandingStorage } from '../service';
import { getDefaultConfig } from '../presets';
import type { BrandingConfig } from '../types';

const TEST_DIR = join(tmpdir(), 'unicore-branding-test');

function uniqueCachePath(): string {
  return join(TEST_DIR, `branding-${randomUUID()}.json`);
}

describe('MemoryBrandingStorage', () => {
  it('load() returns null when empty', async () => {
    const storage = new MemoryBrandingStorage();
    assert.equal(await storage.load(), null);
  });

  it('save() and load() round-trips data', async () => {
    const storage = new MemoryBrandingStorage();
    const cfg = getDefaultConfig('AcmeCorp');
    await storage.save(cfg);
    const loaded = await storage.load();
    assert.deepEqual(loaded, cfg);
  });

  it('clear() resets to null', async () => {
    const storage = new MemoryBrandingStorage();
    await storage.save(getDefaultConfig());
    await storage.clear();
    assert.equal(await storage.load(), null);
  });
});

describe('FileBrandingStorage', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  it('load() returns null for missing file', async () => {
    const storage = new FileBrandingStorage(uniqueCachePath());
    assert.equal(await storage.load(), null);
  });

  it('save() and load() round-trips JSON to disk', async () => {
    const filePath = uniqueCachePath();
    const storage = new FileBrandingStorage(filePath);
    const cfg = getDefaultConfig('TestCo');
    await storage.save(cfg);
    const loaded = await storage.load();
    assert.deepEqual(loaded, cfg);
  });

  it('clear() removes the file', async () => {
    const filePath = uniqueCachePath();
    const storage = new FileBrandingStorage(filePath);
    await storage.save(getDefaultConfig());
    await storage.clear();
    assert.equal(await storage.load(), null);
  });

  it('clear() on non-existent file does not throw', async () => {
    const storage = new FileBrandingStorage(uniqueCachePath());
    await assert.doesNotReject(() => storage.clear());
  });
});

describe('BrandingService', () => {
  function makeService(opts?: { defaultAppName?: string }): BrandingService {
    return new BrandingService({
      storage: new MemoryBrandingStorage(),
      ...opts,
    });
  }

  it('load() returns default config when nothing is stored', async () => {
    const service = makeService({ defaultAppName: 'MyApp' });
    const config = await service.load();
    assert.equal(config.appName, 'MyApp');
    assert.equal(config.removeUnicoreBranding, false);
    assert.ok(config.colors.primary);
  });

  it('load() caches result on subsequent calls', async () => {
    const storage = new MemoryBrandingStorage();
    let loadCount = 0;
    const originalLoad = storage.load.bind(storage);
    storage.load = async () => {
      loadCount++;
      return originalLoad();
    };
    const service = new BrandingService({ storage });
    await service.load();
    await service.load();
    assert.equal(loadCount, 1);
  });

  it('save() stamps updatedAt', async () => {
    const service = makeService();
    const before = Date.now();
    const cfg = getDefaultConfig('Stamped');
    const saved = await service.save(cfg);
    const after = Date.now();
    assert.ok(saved.updatedAt);
    const ts = new Date(saved.updatedAt!).getTime();
    assert.ok(ts >= before && ts <= after);
  });

  it('patch() merges colors deeply', async () => {
    const service = makeService();
    const original = await service.load();
    const patched = await service.patch({
      colors: { primary: '#ff0000' },
    });
    assert.equal(patched.colors.primary, '#ff0000');
    // Other colors should be preserved
    assert.equal(patched.colors.secondary, original.colors.secondary);
  });

  it('patch() updates top-level fields', async () => {
    const service = makeService();
    const patched = await service.patch({ appName: 'NewName' });
    assert.equal(patched.appName, 'NewName');
  });

  it('reset() restores defaults and preserves appName', async () => {
    const service = makeService({ defaultAppName: 'MyPlatform' });
    // First load to set appName
    await service.load();
    await service.patch({ appName: 'CustomName', colors: { primary: '#abcdef' } });
    const reset = await service.reset();
    // appName preserved from what was stored
    assert.equal(reset.appName, 'CustomName');
    // Colors should be back to defaults
    assert.notEqual(reset.colors.primary, '#abcdef');
    assert.equal(reset.removeUnicoreBranding, false);
  });

  it('applyPreset() applies preset colors but keeps appName and removeUnicoreBranding', async () => {
    const service = makeService();
    await service.patch({ appName: 'MyBrand', removeUnicoreBranding: true });
    const result = await service.applyPreset('midnight-blue');
    assert.equal(result.appName, 'MyBrand');
    assert.equal(result.removeUnicoreBranding, true);
    assert.equal(result.colors.primary, '#3b82f6'); // midnight-blue primary
  });

  it('applyPreset() throws on unknown preset', async () => {
    const service = makeService();
    await assert.rejects(
      () => service.applyPreset('does-not-exist'),
      { message: 'Branding preset "does-not-exist" not found.' },
    );
  });

  it('setRemoveUnicoreBranding() toggles the flag', async () => {
    const service = makeService();
    const enabled = await service.setRemoveUnicoreBranding(true);
    assert.equal(enabled.removeUnicoreBranding, true);
    const disabled = await service.setRemoveUnicoreBranding(false);
    assert.equal(disabled.removeUnicoreBranding, false);
  });

  it('invalidateCache() forces reload from storage on next load()', async () => {
    const storage = new MemoryBrandingStorage();
    let loadCount = 0;
    const originalLoad = storage.load.bind(storage);
    storage.load = async () => {
      loadCount++;
      return originalLoad();
    };
    const service = new BrandingService({ storage });
    await service.load();
    service.invalidateCache();
    await service.load();
    assert.equal(loadCount, 2);
  });

  it('round-trips through FileBrandingStorage', async () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const filePath = uniqueCachePath();
    const storage = new FileBrandingStorage(filePath);
    const service = new BrandingService({ storage, defaultAppName: 'FileTest' });

    const saved = await service.patch({ appName: 'FileTest', colors: { accent: '#123456' } });
    assert.equal(saved.colors.accent, '#123456');

    // New service instance, same file
    const service2 = new BrandingService({ storage, defaultAppName: 'FileTest' });
    const loaded = await service2.load();
    assert.equal(loaded.colors.accent, '#123456');

    rmSync(TEST_DIR, { recursive: true, force: true });
  });
});
