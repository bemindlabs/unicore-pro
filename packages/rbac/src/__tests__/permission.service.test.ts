import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionService } from '../permission.service';

// ─── Minimal Prisma mock ───────────────────────────────────────────────────────

function makePrismaMock() {
  const permissions: Map<string, any> = new Map();
  let idCounter = 1;

  return {
    _permissions: permissions,
    permission: {
      async findMany({ where }: any) {
        let all = [...permissions.values()];
        if (where?.isActive !== undefined) {
          all = all.filter((p) => p.isActive === where.isActive);
        }
        if (where?.resource) {
          all = all.filter((p) => p.resource === where.resource);
        }
        if (where?.name?.in) {
          all = all.filter((p) => (where.name.in as string[]).includes(p.name));
        }
        return all;
      },
      async findUnique({ where }: any) {
        if (where.id) return permissions.get(`id:${where.id}`) ?? null;
        if (where.name) {
          return [...permissions.values()].find((p) => p.name === where.name) ?? null;
        }
        return null;
      },
      async create({ data }: any) {
        const id = String(idCounter++);
        const record = {
          id,
          name: data.name,
          resource: data.resource,
          action: data.action,
          description: data.description ?? null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        permissions.set(`id:${id}`, record);
        return record;
      },
      async update({ where, data }: any) {
        const record = permissions.get(`id:${where.id}`);
        if (!record) throw new Error('not found');
        Object.assign(record, data, { updatedAt: new Date() });
        return record;
      },
      async delete({ where }: any) {
        permissions.delete(`id:${where.id}`);
      },
    },
    rolePermission: {
      async findMany({ where, include }: any) {
        return [];
      },
    },
  };
}

describe('PermissionService', () => {
  let service: PermissionService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new PermissionService(prisma);
  });

  it('creates a permission', async () => {
    const perm = await service.create({
      name: 'contacts:read',
      resource: 'contacts',
      action: 'read',
      description: 'View contacts',
    });
    assert.equal(perm.name, 'contacts:read');
    assert.equal(perm.resource, 'contacts');
    assert.equal(perm.action, 'read');
  });

  it('throws ConflictException when creating duplicate permission', async () => {
    await service.create({ name: 'contacts:read', resource: 'contacts', action: 'read' });
    await assert.rejects(
      () => service.create({ name: 'contacts:read', resource: 'contacts', action: 'read' }),
      (err: Error) => {
        assert.match(err.message, /already exists/);
        return true;
      },
    );
  });

  it('finds permission by name', async () => {
    await service.create({ name: 'orders:write', resource: 'orders', action: 'write' });
    const found = await service.findByName('orders:write');
    assert.ok(found);
    assert.equal(found.action, 'write');
  });

  it('returns null for unknown permission name', async () => {
    const found = await service.findByName('unknown:action');
    assert.equal(found, null);
  });

  it('throws NotFoundException for unknown id', async () => {
    await assert.rejects(
      () => service.findById('does-not-exist'),
      (err: Error) => {
        assert.match(err.message, /not found/);
        return true;
      },
    );
  });

  it('updates a permission description', async () => {
    const created = await service.create({ name: 'agents:invoke', resource: 'agents', action: 'invoke' });
    const updated = await service.update(created.id, { description: 'Trigger agent' });
    assert.equal(updated.description, 'Trigger agent');
  });

  it('deletes a permission', async () => {
    const created = await service.create({ name: 'billing:read', resource: 'billing', action: 'read' });
    await service.delete(created.id);
    const found = await service.findByName('billing:read');
    assert.equal(found, null);
  });

  // ─── hasPermission ────────────────────────────────────────────────────────

  it('hasPermission: exact match', () => {
    assert.equal(service.hasPermission(['contacts:read', 'orders:write'], 'contacts:read'), true);
  });

  it('hasPermission: wildcard *:* grants everything', () => {
    assert.equal(service.hasPermission(['*:*'], 'contacts:read'), true);
    assert.equal(service.hasPermission(['*:*'], 'billing:manage'), true);
  });

  it('hasPermission: resource wildcard resource:* grants resource actions', () => {
    assert.equal(service.hasPermission(['contacts:*'], 'contacts:delete'), true);
    assert.equal(service.hasPermission(['contacts:*'], 'orders:delete'), false);
  });

  it('hasPermission: no match', () => {
    assert.equal(service.hasPermission(['contacts:read'], 'contacts:write'), false);
  });

  it('hasPermission: empty grants', () => {
    assert.equal(service.hasPermission([], 'contacts:read'), false);
  });
});
