import type { RoleSlug, PermissionString } from './types';

// ─── Default Role Hierarchy ───────────────────────────────────────────────────
// Lower index = less privilege; higher index = more privilege.
// A role inherits ALL permissions of every role below it in this list.

export const DEFAULT_ROLE_HIERARCHY: RoleSlug[] = [
  'viewer',
  'member',
  'manager',
  'admin',
  'super_admin',
];

// ─── Default 5 Roles ─────────────────────────────────────────────────────────

export interface SeedRole {
  name: RoleSlug;
  displayName: string;
  description: string;
  isSystem: true;
  sortOrder: number;
}

export const DEFAULT_ROLES: SeedRole[] = [
  {
    name: 'super_admin',
    displayName: 'Super Admin',
    description: 'Full system access — billing, settings, all modules, all agents.',
    isSystem: true,
    sortOrder: 100,
  },
  {
    name: 'admin',
    displayName: 'Admin',
    description: 'Manage users, roles, integrations and all operational modules.',
    isSystem: true,
    sortOrder: 80,
  },
  {
    name: 'manager',
    displayName: 'Manager',
    description: 'Manage contacts, orders, workflows and team operations.',
    isSystem: true,
    sortOrder: 60,
  },
  {
    name: 'member',
    displayName: 'Member',
    description: 'Day-to-day operations: CRM, orders, ERP modules, agent invocation.',
    isSystem: true,
    sortOrder: 40,
  },
  {
    name: 'viewer',
    displayName: 'Viewer',
    description: 'Read-only dashboard access. Suitable for advisors and stakeholders.',
    isSystem: true,
    sortOrder: 20,
  },
];

// ─── Default Permissions Matrix ───────────────────────────────────────────────

export interface SeedPermission {
  name: PermissionString | '*:*';
  resource: string;
  action: string;
  description: string;
}

export const DEFAULT_PERMISSIONS: SeedPermission[] = [
  // contacts
  { name: 'contacts:read',   resource: 'contacts',  action: 'read',   description: 'View contacts and CRM data' },
  { name: 'contacts:write',  resource: 'contacts',  action: 'write',  description: 'Create and edit contacts' },
  { name: 'contacts:delete', resource: 'contacts',  action: 'delete', description: 'Delete contacts' },
  // orders
  { name: 'orders:read',     resource: 'orders',    action: 'read',   description: 'View orders' },
  { name: 'orders:write',    resource: 'orders',    action: 'write',  description: 'Create and edit orders' },
  { name: 'orders:delete',   resource: 'orders',    action: 'delete', description: 'Cancel and delete orders' },
  // inventory
  { name: 'inventory:read',  resource: 'inventory', action: 'read',   description: 'View inventory' },
  { name: 'inventory:write', resource: 'inventory', action: 'write',  description: 'Manage stock levels and SKUs' },
  { name: 'inventory:delete',resource: 'inventory', action: 'delete', description: 'Remove inventory items' },
  // invoicing
  { name: 'invoicing:read',  resource: 'invoicing', action: 'read',   description: 'View invoices' },
  { name: 'invoicing:write', resource: 'invoicing', action: 'write',  description: 'Create and send invoices' },
  { name: 'invoicing:delete',resource: 'invoicing', action: 'delete', description: 'Void and delete invoices' },
  // expenses
  { name: 'expenses:read',   resource: 'expenses',  action: 'read',   description: 'View expenses' },
  { name: 'expenses:write',  resource: 'expenses',  action: 'write',  description: 'Record expenses' },
  { name: 'expenses:delete', resource: 'expenses',  action: 'delete', description: 'Delete expense records' },
  // reports
  { name: 'reports:read',    resource: 'reports',   action: 'read',   description: 'View reports and analytics' },
  // agents
  { name: 'agents:read',     resource: 'agents',    action: 'read',   description: 'View agent configurations' },
  { name: 'agents:write',    resource: 'agents',    action: 'write',  description: 'Configure agents' },
  { name: 'agents:invoke',   resource: 'agents',    action: 'invoke', description: 'Trigger agent actions' },
  { name: 'agents:manage',   resource: 'agents',    action: 'manage', description: 'Deploy and manage agent lifecycle' },
  // workflows
  { name: 'workflows:read',  resource: 'workflows', action: 'read',   description: 'View workflows' },
  { name: 'workflows:write', resource: 'workflows', action: 'write',  description: 'Create and edit workflows' },
  { name: 'workflows:delete',resource: 'workflows', action: 'delete', description: 'Delete workflows' },
  { name: 'workflows:invoke',resource: 'workflows', action: 'invoke', description: 'Trigger workflow runs' },
  // channels
  { name: 'channels:read',   resource: 'channels',  action: 'read',   description: 'View channel configurations' },
  { name: 'channels:write',  resource: 'channels',  action: 'write',  description: 'Configure communication channels' },
  { name: 'channels:manage', resource: 'channels',  action: 'manage', description: 'Add and remove channels' },
  // users
  { name: 'users:read',      resource: 'users',     action: 'read',   description: 'View user list' },
  { name: 'users:write',     resource: 'users',     action: 'write',  description: 'Invite and edit users' },
  { name: 'users:delete',    resource: 'users',     action: 'delete', description: 'Remove users' },
  { name: 'users:manage',    resource: 'users',     action: 'manage', description: 'Manage user roles and permissions' },
  // roles
  { name: 'roles:read',      resource: 'roles',     action: 'read',   description: 'View roles and permissions' },
  { name: 'roles:write',     resource: 'roles',     action: 'write',  description: 'Create and edit custom roles' },
  { name: 'roles:delete',    resource: 'roles',     action: 'delete', description: 'Delete custom roles' },
  { name: 'roles:manage',    resource: 'roles',     action: 'manage', description: 'Assign and revoke roles' },
  // settings
  { name: 'settings:read',   resource: 'settings',  action: 'read',   description: 'View system settings' },
  { name: 'settings:write',  resource: 'settings',  action: 'write',  description: 'Update system settings' },
  { name: 'settings:manage', resource: 'settings',  action: 'manage', description: 'Full settings administration' },
  // audit
  { name: 'audit:read',      resource: 'audit',     action: 'read',   description: 'View audit logs' },
  // billing
  { name: 'billing:read',    resource: 'billing',   action: 'read',   description: 'View billing and subscription info' },
  { name: 'billing:manage',  resource: 'billing',   action: 'manage', description: 'Manage subscription and payments' },
  // wildcard (super_admin)
  { name: '*:*',              resource: '*',         action: '*',      description: 'Unrestricted access to all resources' },
];

// ─── Default Permission Matrix per Role ───────────────────────────────────────
// Maps role name → list of permission names granted directly.
// Note: role hierarchy is applied additively on top of this.

type PermName = PermissionString | string;

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleSlug, PermName[]> = {
  super_admin: ['*:*'],

  admin: [
    'contacts:read', 'contacts:write', 'contacts:delete',
    'orders:read', 'orders:write', 'orders:delete',
    'inventory:read', 'inventory:write', 'inventory:delete',
    'invoicing:read', 'invoicing:write', 'invoicing:delete',
    'expenses:read', 'expenses:write', 'expenses:delete',
    'reports:read',
    'agents:read', 'agents:write', 'agents:invoke', 'agents:manage',
    'workflows:read', 'workflows:write', 'workflows:delete', 'workflows:invoke',
    'channels:read', 'channels:write', 'channels:manage',
    'users:read', 'users:write', 'users:delete', 'users:manage',
    'roles:read', 'roles:write', 'roles:manage',
    'settings:read', 'settings:write',
    'audit:read',
    'billing:read',
  ],

  manager: [
    'contacts:read', 'contacts:write', 'contacts:delete',
    'orders:read', 'orders:write', 'orders:delete',
    'inventory:read', 'inventory:write',
    'invoicing:read', 'invoicing:write',
    'expenses:read', 'expenses:write',
    'reports:read',
    'agents:read', 'agents:invoke',
    'workflows:read', 'workflows:write', 'workflows:invoke',
    'channels:read',
    'users:read',
    'roles:read',
    'settings:read',
  ],

  member: [
    'contacts:read', 'contacts:write',
    'orders:read', 'orders:write',
    'inventory:read',
    'invoicing:read',
    'expenses:read', 'expenses:write',
    'reports:read',
    'agents:read', 'agents:invoke',
    'workflows:read', 'workflows:invoke',
    'channels:read',
    'users:read',
  ],

  viewer: [
    'contacts:read',
    'orders:read',
    'inventory:read',
    'invoicing:read',
    'expenses:read',
    'reports:read',
    'agents:read',
    'workflows:read',
    'channels:read',
    'users:read',
  ],
};
