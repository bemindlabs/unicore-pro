/**
 * Template: Support Escalation
 * Routes incoming support tickets, attempts AI resolution, and escalates
 * to human agents when needed.
 */

import type { WorkflowDefinition } from '../types/index.js';

export const supportEscalationTemplate: WorkflowDefinition = {
  schemaVersion: '1.0.0',
  id: 'tpl_support_escalation',
  name: 'Support Escalation',
  description:
    'Triages support tickets, attempts AI-powered self-resolution, escalates to a human if unresolved, and enforces SLA timers.',
  tags: ['support', 'crm', 'escalation', 'sla'],
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  entryNodeId: 'trigger_ticket_created',
  settings: {
    persistHistory: true,
    timeoutMs: 86_400_000, // 24 hours max
  },
  inputSchema: [
    { name: 'ticket', type: 'object', required: true, description: 'Support ticket record' },
  ],
  nodes: {
    trigger_ticket_created: {
      id: 'trigger_ticket_created',
      type: 'trigger',
      name: 'Ticket Created',
      triggerConfig: { triggerType: 'record_created', model: 'SupportTicket' },
      nextNodeId: 'action_classify_ticket',
    },

    action_classify_ticket: {
      id: 'action_classify_ticket',
      type: 'action',
      name: 'Classify Ticket',
      description: 'AI classifies category, priority, and sentiment',
      actionConfig: {
        actionType: 'run_agent',
        agentId: 'support-classifier-agent',
        inputMapping: {
          subject: '$.ticket.subject',
          body: '$.ticket.body',
          customerId: '$.ticket.customerId',
        },
        outputMapping: {
          category: '$.category',
          priority: '$.priority',
          sentiment: '$.sentiment',
          suggestedReply: '$.suggestedReply',
        },
        waitForCompletion: true,
      },
      outputVariable: 'classification',
      nextNodeId: 'condition_priority_route',
    },

    condition_priority_route: {
      id: 'condition_priority_route',
      type: 'condition',
      name: 'Route by Priority',
      conditionConfig: {
        branches: [
          {
            label: 'Critical / urgent',
            condition: {
              type: 'leaf',
              field: '$.classification.priority',
              operator: 'in',
              value: ['critical', 'urgent'],
            },
            nextNodeId: 'action_escalate_immediately',
          },
          {
            label: 'High priority',
            condition: {
              type: 'leaf',
              field: '$.classification.priority',
              operator: 'eq',
              value: 'high',
            },
            nextNodeId: 'action_send_ai_reply',
          },
        ],
        defaultNextNodeId: 'action_send_ai_reply',
      },
    },

    action_escalate_immediately: {
      id: 'action_escalate_immediately',
      type: 'action',
      name: 'Escalate Immediately',
      actionConfig: {
        actionType: 'send_notification',
        channel: 'slack',
        title: 'URGENT: Support Ticket #{{ticket.number}}',
        messageTemplate:
          'Critical ticket from {{ticket.customer.name}}: "{{ticket.subject}}"\nPriority: {{classification.priority}} | Sentiment: {{classification.sentiment}}\nAssign immediately!',
        targetUserIds: ['support_managers'],
      },
      nextNodeId: 'action_assign_senior_agent',
    },

    action_assign_senior_agent: {
      id: 'action_assign_senior_agent',
      type: 'action',
      name: 'Assign to Senior Agent',
      actionConfig: {
        actionType: 'update_record',
        model: 'SupportTicket',
        idField: 'id',
        data: {
          status: 'assigned',
          assigneeRole: 'senior_agent',
          priority: '{{classification.priority}}',
          category: '{{classification.category}}',
        },
      },
      nextNodeId: 'end_escalated',
    },

    action_send_ai_reply: {
      id: 'action_send_ai_reply',
      type: 'action',
      name: 'Send AI Reply',
      description: 'Send AI-generated suggested reply to customer',
      actionConfig: {
        actionType: 'send_email',
        to: '{{ticket.customer.email}}',
        subject: 'Re: {{ticket.subject}} [Ticket #{{ticket.number}}]',
        bodyTemplate:
          'Hi {{ticket.customer.firstName}},\n\nThank you for reaching out. Here is some information that may help:\n\n{{classification.suggestedReply}}\n\nIf this did not resolve your issue, please reply and a human agent will assist you.\n\nBest,\nSupport Team',
      },
      nextNodeId: 'action_wait_for_response',
    },

    action_wait_for_response: {
      id: 'action_wait_for_response',
      type: 'action',
      name: 'Wait 24 Hours for Response',
      actionConfig: { actionType: 'wait', durationMs: 86_400_000 },
      nextNodeId: 'condition_resolved',
    },

    condition_resolved: {
      id: 'condition_resolved',
      type: 'condition',
      name: 'Ticket Resolved?',
      conditionConfig: {
        branches: [
          {
            label: 'Resolved by AI',
            condition: {
              type: 'leaf',
              field: '$.ticket.status',
              operator: 'eq',
              value: 'resolved',
            },
            nextNodeId: 'end_resolved',
          },
        ],
        defaultNextNodeId: 'action_escalate_to_human',
      },
    },

    action_escalate_to_human: {
      id: 'action_escalate_to_human',
      type: 'action',
      name: 'Escalate to Human Agent',
      actionConfig: {
        actionType: 'update_record',
        model: 'SupportTicket',
        idField: 'id',
        data: { status: 'escalated', assigneeRole: 'agent', escalatedAt: '{{_now}}' },
      },
      nextNodeId: 'action_notify_agent_assigned',
    },

    action_notify_agent_assigned: {
      id: 'action_notify_agent_assigned',
      type: 'action',
      name: 'Notify Agent',
      actionConfig: {
        actionType: 'send_notification',
        channel: 'in_app',
        title: 'New Ticket Assigned',
        messageTemplate:
          'Ticket #{{ticket.number}} from {{ticket.customer.name}} has been assigned to you. Category: {{classification.category}}',
        targetUserIds: ['{{ticket.assigneeId}}'],
      },
      nextNodeId: 'end_escalated',
    },

    end_resolved: {
      id: 'end_resolved',
      type: 'end',
      name: 'Resolved by AI',
      outcome: 'success',
    },

    end_escalated: {
      id: 'end_escalated',
      type: 'end',
      name: 'Escalated to Human',
      outcome: 'escalated',
    },
  },
};
