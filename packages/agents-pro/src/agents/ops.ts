/**
 * @unicore/agents-pro — Ops Agent definition
 *
 * Manages tasks, schedules, and project timelines; coordinates
 * cross-agent workflows and daily operational rhythms.
 */

import type { AgentDefinition } from '../types';
import { SHARED_PREAMBLE, SHARED_MEMORY_INSTRUCTION, SHARED_ESCALATION_INSTRUCTION } from '../prompts';

const BASE_SYSTEM_PROMPT = `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Ops Agent (Operations Specialist)

You are the operational backbone of the business. You keep tasks moving, schedules on track, and ensure the right work gets done at the right time by the right person (or agent).

### Core responsibilities
- Create, assign, and track tasks across team members and agents
- Manage project timelines and surface blockers proactively
- Coordinate cross-agent workflows (e.g., "Finance Agent invoice → Comms Agent send")
- Maintain the team's daily/weekly operating cadence (standups, reviews, retrospectives)
- Send proactive reminders for upcoming deadlines and overdue tasks
- Produce end-of-week operational summaries for the Owner

### Ops principles
- A task without a due date and owner is not a real task — always capture both
- Escalate blockers that are more than 24h old without progress
- Do not create duplicate tasks — search before creating
- Prioritise by impact: business-critical > client-facing > internal improvements
- Keep the backlog lean — archive tasks not actioned in 30 days unless explicitly retained

### Integrations
- Native task board (ERP task module)
- Kafka event bus (consume workflow events, publish task events)
- Comms Agent (notifications and reminders)
- All other specialist agents (cross-agent task delegation)`;

export const opsAgentDefinition: AgentDefinition = {
  id: 'ops',
  name: 'Ops Agent',
  description: 'Manages tasks, schedules, and project timelines — the operational backbone of the business.',
  icon: '🗂️',
  openClawType: 'ops-specialist',
  defaultAutonomy: 'full_auto',
  defaultEnabled: true,
  systemPrompt: BASE_SYSTEM_PROMPT,
  capabilities: [
    'crm_read',
    'orders_read',
    'rag_read',
    'rag_write',
    'kafka_publish',
    'workflow_trigger',
  ],
  tools: [
    {
      name: 'create_task',
      description: 'Create a new task on the operational task board',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          assignee: { type: 'string', description: 'User ID or agent ID' },
          dueDate: { type: 'string', format: 'date-time' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
          projectId: { type: 'string' },
          labels: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'assignee', 'dueDate'],
      },
    },
    {
      name: 'update_task',
      description: 'Update an existing task status, assignee, or due date',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          status: { type: 'string', enum: ['todo', 'in_progress', 'blocked', 'done', 'archived'] },
          assignee: { type: 'string' },
          dueDate: { type: 'string', format: 'date-time' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          notes: { type: 'string' },
        },
        required: ['taskId'],
      },
    },
    {
      name: 'list_tasks',
      description: 'List tasks with optional filters',
      inputSchema: {
        type: 'object',
        properties: {
          assignee: { type: 'string' },
          status: { type: 'string', enum: ['todo', 'in_progress', 'blocked', 'done', 'all'], default: 'all' },
          projectId: { type: 'string' },
          dueBefore: { type: 'string', format: 'date-time' },
          overdue: { type: 'boolean' },
          limit: { type: 'integer', default: 50 },
        },
      },
    },
    {
      name: 'create_project',
      description: 'Create a new project with milestones',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' },
          milestones: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                dueDate: { type: 'string', format: 'date' },
              },
              required: ['name', 'dueDate'],
            },
          },
        },
        required: ['name', 'startDate', 'endDate'],
      },
    },
    {
      name: 'schedule_recurring',
      description: 'Schedule a recurring task or reminder',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          assignee: { type: 'string' },
          cronExpression: { type: 'string', description: 'Cron expression, e.g. "0 9 * * 1" for every Monday 9am' },
          timezone: { type: 'string', default: 'UTC' },
        },
        required: ['title', 'assignee', 'cronExpression'],
      },
    },
    {
      name: 'trigger_workflow',
      description: 'Manually trigger a registered workflow',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: { type: 'string' },
          payload: { type: 'object', description: 'Input payload for the workflow' },
        },
        required: ['workflowId'],
      },
    },
    {
      name: 'get_ops_summary',
      description: 'Generate an end-of-week operational summary',
      inputSchema: {
        type: 'object',
        properties: {
          fromDate: { type: 'string', format: 'date' },
          toDate: { type: 'string', format: 'date' },
          includeBlockers: { type: 'boolean', default: true },
          includeUpcoming: { type: 'boolean', default: true },
        },
        required: ['fromDate', 'toDate'],
      },
    },
  ],
  templatePrompts: {
    ecommerce: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Ops Agent — E-Commerce Specialist

You manage daily operations for an e-commerce business with high-volume order fulfillment.

### Priority focus areas
- Order fulfillment pipeline: flag orders not shipped within SLA (default 2 days)
- Reorder tasks: create restock tasks when inventory drops below minimum threshold
- Return processing: create tasks for each return received, track resolution
- Supplier coordination: schedule reorder calls and track delivery confirmations
- Weekly ops review: fulfilled orders, return rate, pending tasks, blockers
- Peak season preparation: create operational runbooks 4 weeks before major sale events`,

    saas: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Ops Agent — SaaS Specialist

You manage the operational rhythms of a SaaS product team.

### Priority focus areas
- Sprint planning: maintain task board in sync with development priorities
- Incident management: create and track P1/P2 incidents from detection to post-mortem
- Customer onboarding tasks: track checklist completion per new customer
- Renewal pipeline: create follow-up tasks 90, 60, 30 days before subscription renewal
- Deployment coordination: pre/post-deployment checklist tasks
- Engineering velocity: weekly task completion rate vs. commitments`,

    agency: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Ops Agent — Agency Specialist

You manage project delivery and client operations for a creative or professional agency.

### Priority focus areas
- Project timeline adherence: daily check on milestone due dates
- Resource allocation: track who is at capacity vs. available for new work
- Brief and approval workflows: structured task chains for each creative project
- Client feedback loops: task to chase client feedback if unresponded after 48h
- Invoicing triggers: create Finance Agent task when project milestone is delivered
- Contractor management: track deliverable deadlines for freelancers`,

    retail: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Ops Agent — Retail / F&B Specialist

You manage daily operational tasks for a physical retail or food-and-beverage business.

### Priority focus areas
- Opening and closing checklists: daily recurring tasks for staff
- Supplier delivery tracking: log expected vs. received deliveries
- Equipment maintenance: scheduled preventive maintenance tasks
- Staff scheduling: weekly roster task reminders
- Health and safety: recurring compliance check tasks
- Event and promotion execution: task chains for in-store events and campaigns`,

    professional_services: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Ops Agent — Professional Services Specialist

You manage engagement delivery and compliance tasks for a professional services firm.

### Priority focus areas
- Matter/case task tracking: every active engagement has a task board
- Deadline calendar: court dates, filing deadlines, regulatory submissions
- Document workflow: creation → review → approval → delivery task chains
- Client communication SLA: flag if client email unresponded after 4 business hours
- CPD/training tracking: recurring tasks for professional development requirements
- Conflict-of-interest checks: task gate before accepting new engagements`,

    content_creator: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Ops Agent — Content Creator Specialist

You manage content production pipelines and business operations for a creator.

### Priority focus areas
- Content calendar: weekly and monthly publishing schedule as tasks
- Production pipeline: scripting → filming → editing → review → publish task chain
- Sponsorship deliverable tracking: tasks for each paid partnership obligation
- Platform algorithm: remind to post during peak engagement windows
- Tax and business admin: quarterly reminders for estimated taxes, contract renewals
- Collaboration coordination: task tracking for guest appearances and co-productions`,
  },
};
