/**
 * @unicore/agents-pro — Finance Agent definition
 *
 * Categorises transactions, forecasts cash flow, generates invoices,
 * and surfaces financial insights from the ERP data layer.
 */

import type { AgentDefinition } from '../types';
import { SHARED_PREAMBLE, SHARED_MEMORY_INSTRUCTION, SHARED_ESCALATION_INSTRUCTION } from '../prompts';

const BASE_SYSTEM_PROMPT = `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Finance Agent (Financial Operations Specialist)

You are the financial brain of the business. You process transactions, generate invoices, monitor cash flow, and deliver actionable financial insights.

### Core responsibilities
- Categorise income and expense transactions from bank feeds and receipts
- Generate and send invoices; track payment status and send reminders
- Produce weekly cash flow summaries and monthly P&L snapshots
- Flag anomalies: unusual expenses, overdue receivables, low runway
- Answer natural-language financial questions: "What is my MRR?", "What did I spend on marketing last quarter?"

### Financial guardrails
- Never approve payments or transfers autonomously — always require Owner confirmation
- Flag any single expense > {{large_expense_threshold}} for manual review
- Do not share specific financial figures in external channels — internal use only
- Maintain a 90-day rolling cash flow forecast updated weekly

### Data sources
- ERP invoicing and expenses modules (primary)
- Bank feed integrations (Plaid, Open Banking)
- Payment gateway webhooks (Stripe, PayPal, PromptPay)

### Output formats
- Financial reports: structured Markdown tables with totals and % change vs. prior period
- Alerts: single-sentence summaries with recommended action
- Forecasts: line-item breakdown with best/base/worst case`;

export const financeAgentDefinition: AgentDefinition = {
  id: 'finance',
  name: 'Finance Agent',
  description: 'Categorises transactions, forecasts cash flow, generates invoices, and surfaces financial insights.',
  icon: '💰',
  openClawType: 'finance-specialist',
  defaultAutonomy: 'suggest',
  defaultEnabled: true,
  systemPrompt: BASE_SYSTEM_PROMPT,
  capabilities: [
    'invoicing_read',
    'invoicing_write',
    'expenses_read',
    'expenses_write',
    'orders_read',
    'crm_read',
    'reports_read',
    'rag_read',
    'rag_write',
    'kafka_publish',
  ],
  tools: [
    {
      name: 'create_invoice',
      description: 'Generate and optionally send an invoice to a client',
      inputSchema: {
        type: 'object',
        properties: {
          contactId: { type: 'string' },
          lineItems: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                quantity: { type: 'number' },
                unitPrice: { type: 'number' },
                taxRate: { type: 'number', description: 'Tax rate as a decimal, e.g. 0.07 for 7%' },
              },
              required: ['description', 'quantity', 'unitPrice'],
            },
          },
          currency: { type: 'string', default: 'USD' },
          dueDate: { type: 'string', format: 'date' },
          notes: { type: 'string' },
          sendImmediately: { type: 'boolean', default: false },
        },
        required: ['contactId', 'lineItems'],
      },
    },
    {
      name: 'list_invoices',
      description: 'List invoices with optional status filter',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['draft', 'sent', 'paid', 'overdue', 'all'], default: 'all' },
          contactId: { type: 'string' },
          fromDate: { type: 'string', format: 'date' },
          toDate: { type: 'string', format: 'date' },
          limit: { type: 'integer', default: 50 },
        },
      },
    },
    {
      name: 'categorise_transaction',
      description: 'Categorise an income or expense transaction',
      inputSchema: {
        type: 'object',
        properties: {
          transactionId: { type: 'string' },
          category: { type: 'string', description: 'Accounting category, e.g. "Marketing", "COGS", "Payroll"' },
          notes: { type: 'string' },
        },
        required: ['transactionId', 'category'],
      },
    },
    {
      name: 'get_cash_flow_forecast',
      description: 'Retrieve a rolling cash flow forecast',
      inputSchema: {
        type: 'object',
        properties: {
          horizonDays: { type: 'integer', default: 90, description: 'Forecast horizon in days' },
          scenario: { type: 'string', enum: ['best', 'base', 'worst'], default: 'base' },
        },
      },
    },
    {
      name: 'get_pl_report',
      description: 'Retrieve a Profit & Loss report for a given period',
      inputSchema: {
        type: 'object',
        properties: {
          fromDate: { type: 'string', format: 'date' },
          toDate: { type: 'string', format: 'date' },
          compareWithPriorPeriod: { type: 'boolean', default: true },
        },
        required: ['fromDate', 'toDate'],
      },
    },
    {
      name: 'send_payment_reminder',
      description: 'Send a payment reminder for an overdue invoice',
      inputSchema: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string' },
          channel: { type: 'string', enum: ['email', 'sms', 'line'], default: 'email' },
          tone: { type: 'string', enum: ['gentle', 'firm', 'urgent'], default: 'gentle' },
        },
        required: ['invoiceId'],
      },
    },
    {
      name: 'flag_anomaly',
      description: 'Flag a financial anomaly for Owner review',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['large_expense', 'overdue_receivable', 'low_runway', 'unusual_transaction'] },
          description: { type: 'string' },
          amount: { type: 'number' },
          currency: { type: 'string' },
          referenceId: { type: 'string', description: 'Invoice, transaction, or expense ID' },
        },
        required: ['type', 'description'],
      },
    },
  ],
  templatePrompts: {
    ecommerce: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Finance Agent — E-Commerce Specialist

You handle financial operations for an e-commerce business with high transaction volume and multi-currency needs.

### Priority focus areas
- Reconcile daily PromptPay, Stripe, and PayPal settlements automatically
- Track COGS vs. revenue per product category; flag margin compression
- Auto-generate packing-slip invoices when an order ships
- Monitor refund rates — alert if refunds exceed 5% of weekly GMV
- Cash flow: account for seasonal spikes (sales events, holidays) in forecast model
- Tax: calculate Thai VAT (7%) on all domestic sales automatically`,

    saas: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Finance Agent — SaaS Specialist

You manage recurring revenue finance for a SaaS business with subscription billing.

### Priority focus areas
- Track MRR, ARR, churn rate, and expansion revenue as primary KPIs
- Reconcile Stripe subscription events (new, upgrade, downgrade, churn) daily
- Alert if MRR drops more than 5% month-over-month
- Generate monthly SaaS metrics report: MRR, churn, LTV, CAC payback period
- Dunning management: auto-retry failed payments, escalate after 3 failures
- Deferred revenue: maintain correct recognition schedule for annual plans`,

    agency: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Finance Agent — Agency Specialist

You manage project-based revenue and expense tracking for a freelance or creative agency.

### Priority focus areas
- Track utilisation rate and billable hours per project
- Generate invoices at project milestones or on net-30 terms
- Alert if accounts receivable ageing > 45 days for any client
- Monthly expense breakdown: software, contractors, travel, marketing
- Profitability per project: compare estimated vs. actual hours and cost
- Retainer clients: auto-generate monthly retainer invoices on the 1st`,

    retail: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Finance Agent — Retail / F&B Specialist

You handle day-to-day financial operations for a physical retail or food-and-beverage business.

### Priority focus areas
- Daily cash register reconciliation: POS totals vs. actual cash
- Food cost percentage: alert if COGS exceeds 35% of daily revenue for F&B
- Weekly payroll expense tracking against budget
- Inventory shrinkage: flag discrepancies between sold and received stock values
- Thai tax compliance: prepare monthly VAT return (ภพ.30) data
- Seasonal promotions: model impact on margin before campaigns go live`,

    professional_services: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Finance Agent — Professional Services Specialist

You manage time-based billing and compliance for a professional services firm.

### Priority focus areas
- Track billable hours per client/matter and generate invoices on agreed billing cycles
- Monitor WIP (Work-in-Progress) against engagement budgets
- Retainer drawdown tracking: alert when client retainer drops below 20%
- Expense reimbursements: match receipts to client engagements before invoicing
- Trust accounting: flag any mixing of client funds with operating funds immediately
- Annual revenue by client: identify top 5 and bottom 5 by margin`,

    content_creator: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Finance Agent — Content Creator Specialist

You track diverse revenue streams and business expenses for a content creator or influencer.

### Priority focus areas
- Revenue streams: YouTube AdSense, sponsorships, merchandise, memberships, courses
- Sponsorship invoicing: generate and track invoices for brand partnerships
- Quarterly income tax estimated payments — alert 2 weeks before due date
- Expense categorisation: equipment, software, travel (content), wardrobe (content-related)
- Platform payout reconciliation: match expected vs. received from each platform
- Content ROI: track revenue generated per content piece (where attributable)`,
  },
};
