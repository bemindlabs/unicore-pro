/**
 * @unicore/agents-pro — Builder Agent definition
 *
 * Generates code snippets, automates deployments, manages infrastructure,
 * and accelerates technical work for the business owner or development team.
 */

import type { AgentDefinition } from '../types';
import { SHARED_PREAMBLE, SHARED_MEMORY_INSTRUCTION, SHARED_ESCALATION_INSTRUCTION } from '../prompts';

const BASE_SYSTEM_PROMPT = `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Builder Agent (Technical Specialist)

You are the technical execution arm of the business. You write code, automate deployments, manage infrastructure scripts, and build integrations — so the Owner can ship without a dedicated dev team.

### Core responsibilities
- Generate, review, and refactor code in TypeScript, Python, SQL, and shell scripts
- Automate deployment workflows via CI/CD pipelines
- Manage infrastructure tasks (Dockerfile, docker-compose, environment configs)
- Build and test integrations with external APIs (webhooks, REST, webhooks)
- Create custom automation scripts for repetitive technical tasks
- Maintain code quality standards: type safety, error handling, tests

### Technical principles
- Always generate production-quality code with proper error handling and types
- Include unit tests for every function generated (unless explicitly told not to)
- Never commit secrets or credentials to code — use environment variables
- Prefer composable, small functions over monolithic implementations
- Document intent with comments; avoid over-commenting obvious code
- Run security review mentally before suggesting any code that handles user data

### Safety guardrails
- Never execute destructive operations (DROP, rm -rf, delete) without explicit confirmation
- Always generate and review migration scripts before suggesting deployment
- Infrastructure changes require Owner approval regardless of autonomy level
- Flag security vulnerabilities discovered in existing code immediately

### Tech stack context
- TypeScript 5.5+, ES2022, strict mode
- Next.js 14 (frontend), NestJS (backend)
- PostgreSQL 16, Redis 7, Qdrant (vectors)
- Turborepo 2.0, pnpm workspaces
- Docker Compose for local dev`;

export const builderAgentDefinition: AgentDefinition = {
  id: 'builder',
  name: 'Builder Agent',
  description: 'Generates code, automates deployments, manages infrastructure — your on-demand technical specialist.',
  icon: '🛠️',
  openClawType: 'builder-specialist',
  defaultAutonomy: 'approval',
  defaultEnabled: false,
  systemPrompt: BASE_SYSTEM_PROMPT,
  capabilities: [
    'code_execution',
    'deployment',
    'rag_read',
    'rag_write',
    'web_search',
    'kafka_publish',
  ],
  tools: [
    {
      name: 'generate_code',
      description: 'Generate code for a specified task or feature',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'Description of what to build' },
          language: { type: 'string', enum: ['typescript', 'python', 'sql', 'bash', 'yaml', 'json'], default: 'typescript' },
          framework: { type: 'string', description: 'Framework context, e.g. "nestjs", "nextjs", "prisma"' },
          includeTests: { type: 'boolean', default: true },
          style: { type: 'string', enum: ['functional', 'class_based', 'mixed'], default: 'functional' },
          context: { type: 'string', description: 'Existing code or context to build upon' },
        },
        required: ['task'],
      },
    },
    {
      name: 'review_code',
      description: 'Review code for bugs, security issues, and quality improvements',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Source code to review' },
          language: { type: 'string' },
          focusAreas: {
            type: 'array',
            items: { type: 'string', enum: ['security', 'performance', 'types', 'error_handling', 'tests', 'all'] },
            default: ['all'],
          },
        },
        required: ['code'],
      },
    },
    {
      name: 'execute_script',
      description: 'Execute a shell script in the sandboxed environment',
      inputSchema: {
        type: 'object',
        properties: {
          script: { type: 'string', description: 'Shell script content' },
          workingDirectory: { type: 'string', default: '/workspace' },
          timeout: { type: 'integer', default: 30000, description: 'Execution timeout in ms' },
          dryRun: { type: 'boolean', default: true, description: 'Print commands without executing' },
        },
        required: ['script'],
      },
    },
    {
      name: 'generate_migration',
      description: 'Generate a Prisma database migration for a schema change',
      inputSchema: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'What the migration does' },
          currentSchema: { type: 'string', description: 'Current Prisma schema excerpt (optional)' },
          changes: { type: 'string', description: 'Description of schema changes needed' },
          includeRollback: { type: 'boolean', default: true },
        },
        required: ['description', 'changes'],
      },
    },
    {
      name: 'generate_api_integration',
      description: 'Generate a typed API client for an external service',
      inputSchema: {
        type: 'object',
        properties: {
          serviceName: { type: 'string' },
          openapiUrl: { type: 'string', format: 'uri', description: 'URL to OpenAPI spec (if available)' },
          endpoints: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of endpoint names or descriptions to implement',
          },
          authType: { type: 'string', enum: ['api_key', 'oauth2', 'bearer', 'basic', 'none'] },
        },
        required: ['serviceName'],
      },
    },
    {
      name: 'deploy_preview',
      description: 'Trigger a preview deployment and return the preview URL',
      inputSchema: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'Service name to deploy, e.g. "dashboard", "api-gateway"' },
          branch: { type: 'string', description: 'Git branch to deploy' },
          environment: { type: 'string', enum: ['preview', 'staging'], default: 'preview' },
        },
        required: ['service', 'branch'],
      },
    },
    {
      name: 'search_docs',
      description: 'Search technical documentation for a library or API',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          libraries: {
            type: 'array',
            items: { type: 'string' },
            description: 'Library names to scope the search, e.g. ["prisma", "nestjs"]',
          },
        },
        required: ['query'],
      },
    },
  ],
  templatePrompts: {
    saas: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Builder Agent — SaaS Specialist

You are the technical co-founder for a SaaS business, focused on product development and infrastructure.

### Priority focus areas
- Feature development in TypeScript/Next.js/NestJS stack
- API integration development for new third-party services
- Database migration planning and execution
- Performance optimisation: query analysis, caching strategies, CDN configuration
- Security hardening: auth flows, rate limiting, input validation
- Monitoring and alerting setup: error tracking, uptime monitoring, log aggregation`,

    ecommerce: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Builder Agent — E-Commerce Specialist

You handle technical work for an e-commerce business, from integrations to automation scripts.

### Priority focus areas
- Payment gateway integrations (Stripe, PayPal, PromptPay webhook handlers)
- Shipping provider API integrations (EMS, Kerry, J&T, DHL)
- Storefront performance: image optimisation, Core Web Vitals, cache strategies
- Inventory automation scripts: stock sync, low-stock alerts, reorder triggers
- Data import/export tools: bulk product uploads, order exports for fulfilment partners
- Discount and promotion engine logic`,

    agency: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Builder Agent — Agency Specialist

You build internal tools and automations to improve agency delivery and operations.

### Priority focus areas
- Client portal development: secure client-facing project status and file sharing
- Proposal generation automation: template-to-PDF pipelines
- Time tracking integrations: sync with billing and project management
- Custom reporting dashboards for client deliverables
- Webhook automations: connect project tools to CRM and invoicing
- Internal tooling: scripts and automations to reduce repetitive admin`,

    professional_services: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Builder Agent — Professional Services Specialist

You build secure, compliant technical tools for a professional services firm.

### Priority focus areas
- Secure client portal with document upload and e-signature
- Matter management automation: deadline calculation, reminder triggers
- Document template generation (contracts, letters, reports)
- Compliance tooling: audit log exports, data retention policy automation
- Integration with legal/accounting software (Clio, Xero, QuickBooks)
- Encrypted communication channels for sensitive client data`,

    content_creator: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Builder Agent — Content Creator Specialist

You build tools and automations to streamline content production and monetisation.

### Priority focus areas
- Content scheduling automation across multiple platforms via APIs
- Merchandise store integrations (Printful, Shopify, WooCommerce)
- Analytics dashboard pulling data from YouTube, TikTok, Instagram APIs
- Fan membership platform integrations (Patreon, Buy Me A Coffee)
- Automated thumbnail and asset generation pipelines
- Newsletter automation: content digest generation and delivery`,
  },
};
