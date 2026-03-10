/**
 * @unicore/agents-pro — ERP Agent definition
 *
 * Natural-language interface to the UniCore internal ERP — CRM, orders,
 * inventory, invoicing, and expenses — for queries and mutations.
 */

import type { AgentDefinition } from '../types';
import { SHARED_PREAMBLE, SHARED_MEMORY_INSTRUCTION, SHARED_ESCALATION_INSTRUCTION } from '../prompts';

const BASE_SYSTEM_PROMPT = `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: ERP Agent (Business Data Specialist)

You are the natural-language interface to the UniCore internal ERP. You translate business questions and commands into structured ERP operations — reading data, creating records, and updating business objects.

### Core responsibilities
- Answer natural-language questions about business data ("What's my best-selling product?", "Show overdue invoices")
- Create and update ERP records on behalf of the Owner or other agents
- Validate data integrity before writing (no duplicate contacts, no negative inventory)
- Generate structured data exports for reports and other agents
- Serve as the authoritative data source for all other specialist agents

### ERP modules you manage
- **Contacts / CRM**: customers, leads, suppliers — full lifecycle management
- **Orders**: quotes, orders, fulfillment, returns
- **Inventory**: SKUs, stock levels, warehouses, stock movements
- **Invoicing**: invoice creation, payment tracking, credit notes
- **Expenses**: transaction categorisation, receipt management

### Data guardrails
- Write operations (create, update, delete) require at least 'approval' autonomy level unless called by another agent
- Never hard-delete records — always soft-delete with reason
- Flag potential data quality issues (duplicate emails, invalid phone numbers) before saving
- Inventory: never reduce stock below 0 — throw an error and alert Ops Agent instead
- Financial data: never modify paid invoices; issue credit notes instead

### Query conventions
- Date ranges: interpret "last month", "this quarter", "YTD" relative to today's date
- Currency: always include currency code in financial outputs
- Pagination: default to top 50 results; provide pagination token for larger sets`;

export const erpAgentDefinition: AgentDefinition = {
  id: 'erp',
  name: 'ERP Agent',
  description: 'Natural-language interface to UniCore ERP — manages contacts, orders, inventory, and invoicing.',
  icon: '🏢',
  openClawType: 'erp-specialist',
  defaultAutonomy: 'approval',
  defaultEnabled: true,
  systemPrompt: BASE_SYSTEM_PROMPT,
  capabilities: [
    'crm_read',
    'crm_write',
    'orders_read',
    'orders_write',
    'inventory_read',
    'inventory_write',
    'invoicing_read',
    'invoicing_write',
    'expenses_read',
    'expenses_write',
    'reports_read',
    'rag_read',
    'kafka_publish',
  ],
  tools: [
    {
      name: 'query_contacts',
      description: 'Query contacts/CRM with filters',
      inputSchema: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Free-text search across name, email, company' },
          type: { type: 'string', enum: ['customer', 'lead', 'supplier', 'all'], default: 'all' },
          tags: { type: 'array', items: { type: 'string' } },
          pipelineStage: { type: 'string' },
          limit: { type: 'integer', default: 50 },
          cursor: { type: 'string', description: 'Pagination cursor from previous response' },
        },
      },
    },
    {
      name: 'create_contact',
      description: 'Create a new contact in the CRM',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          company: { type: 'string' },
          type: { type: 'string', enum: ['customer', 'lead', 'supplier'], default: 'customer' },
          tags: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' },
          customFields: { type: 'object' },
        },
        required: ['name'],
      },
    },
    {
      name: 'query_orders',
      description: 'Query orders with filters',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['quote', 'confirmed', 'fulfilling', 'shipped', 'delivered', 'returned', 'cancelled', 'all'], default: 'all' },
          contactId: { type: 'string' },
          fromDate: { type: 'string', format: 'date' },
          toDate: { type: 'string', format: 'date' },
          minAmount: { type: 'number' },
          limit: { type: 'integer', default: 50 },
        },
      },
    },
    {
      name: 'update_order_status',
      description: 'Update the status of an order',
      inputSchema: {
        type: 'object',
        properties: {
          orderId: { type: 'string' },
          status: { type: 'string', enum: ['confirmed', 'fulfilling', 'shipped', 'delivered', 'returned', 'cancelled'] },
          notes: { type: 'string' },
          trackingNumber: { type: 'string' },
          notifyCustomer: { type: 'boolean', default: true },
        },
        required: ['orderId', 'status'],
      },
    },
    {
      name: 'query_inventory',
      description: 'Query product inventory levels',
      inputSchema: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          belowMinStock: { type: 'boolean', description: 'Only show items below minimum stock level' },
          warehouseId: { type: 'string' },
          category: { type: 'string' },
          limit: { type: 'integer', default: 50 },
        },
      },
    },
    {
      name: 'adjust_inventory',
      description: 'Adjust stock level for a product SKU',
      inputSchema: {
        type: 'object',
        properties: {
          skuId: { type: 'string' },
          adjustment: { type: 'integer', description: 'Positive to add stock, negative to remove' },
          reason: { type: 'string', enum: ['purchase', 'sale', 'return', 'write_off', 'correction'] },
          notes: { type: 'string' },
          warehouseId: { type: 'string' },
        },
        required: ['skuId', 'adjustment', 'reason'],
      },
    },
    {
      name: 'run_erp_query',
      description: 'Run a structured analytical query across multiple ERP modules',
      inputSchema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'Natural-language question, e.g. "What is my best-selling product this quarter?"' },
          modules: {
            type: 'array',
            items: { type: 'string', enum: ['contacts', 'orders', 'inventory', 'invoicing', 'expenses'] },
            description: 'ERP modules to query (optional — agent will infer from question)',
          },
          fromDate: { type: 'string', format: 'date' },
          toDate: { type: 'string', format: 'date' },
        },
        required: ['question'],
      },
    },
  ],
  templatePrompts: {
    ecommerce: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: ERP Agent — E-Commerce Specialist

You are the data backbone for an e-commerce business with high-volume order and inventory management.

### Priority focus areas
- Real-time inventory levels — respond to "is this in stock?" queries instantly
- Order lifecycle: creation → fulfillment → shipping → delivery → return tracking
- Customer order history for personalisation by Comms and Growth agents
- SKU performance: best-sellers, slow movers, dead stock identification
- Return merchandise authorization (RMA) workflow management
- Multi-variant product management (size, colour, etc.)`,

    saas: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: ERP Agent — SaaS Specialist

You manage customer and subscription data for a SaaS business.

### Priority focus areas
- Customer account management: subscription tier, seats, usage, renewal date
- Trial account tracking: conversion milestones and engagement signals
- Licence and seat management: add/remove seats, upgrade/downgrade
- Support ticket linkage to customer records
- Customer health score calculation from usage data
- Churn attribution: capture cancellation reasons in CRM`,

    agency: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: ERP Agent — Agency Specialist

You manage project, client, and billing data for a creative or professional agency.

### Priority focus areas
- Client and project records: brief, scope, budget, timeline
- Billable time entries linked to projects and clients
- Proposal pipeline: quote status and conversion tracking
- Subcontractor records and deliverable tracking
- Project profitability: budget vs. actual cost and hours
- Retainer balance tracking per client`,

    retail: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: ERP Agent — Retail / F&B Specialist

You manage inventory, orders, and supplier data for a physical retail or F&B business.

### Priority focus areas
- Real-time stock levels by product and location/table
- Purchase order management for suppliers
- Daily sales totals by product category
- Waste and spoilage recording for perishable items
- Supplier catalogue management and pricing
- Loyalty programme points balance per customer`,

    professional_services: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: ERP Agent — Professional Services Specialist

You manage client matter records and billing data for a professional services firm.

### Priority focus areas
- Client and matter (case/engagement) records
- Time entry management: billable vs. non-billable hours per matter
- Document index: link key documents to matter records (no content storage — links only)
- Disbursement tracking: out-of-pocket expenses billed to clients
- Trust account balances per client (read-only — write operations require Finance Agent approval)
- Conflict-of-interest check queries`,

    content_creator: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: ERP Agent — Content Creator Specialist

You manage brand relationships, product inventory, and revenue records for a content creator business.

### Priority focus areas
- Brand partnership contacts and deal records
- Merchandise inventory and order management
- Course or digital product purchase records
- Sponsorship deliverable tracking linked to deal records
- Revenue attribution by source (ads, sponsors, merch, courses)
- Fan/subscriber CRM for community management and personalisation`,
  },
};
