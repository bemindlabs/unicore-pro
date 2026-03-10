/**
 * Template: Lead Nurture Sequence
 * Automatically nurtures incoming leads through a scoring and email sequence.
 */

import type { WorkflowDefinition } from '../types/index.js';

export const leadNurtureTemplate: WorkflowDefinition = {
  schemaVersion: '1.0.0',
  id: 'tpl_lead_nurture',
  name: 'Lead Nurture Sequence',
  description:
    'Scores incoming leads, segments by score, and sends a personalised email drip. Escalates hot leads to the sales team.',
  tags: ['crm', 'marketing', 'leads', 'email'],
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  entryNodeId: 'trigger_lead_created',
  settings: {
    persistHistory: true,
    maxConcurrentExecutions: 100,
  },
  inputSchema: [
    { name: 'lead', type: 'object', required: true, description: 'Lead record' },
  ],
  nodes: {
    trigger_lead_created: {
      id: 'trigger_lead_created',
      type: 'trigger',
      name: 'Lead Created',
      description: 'Fires when a new lead record is created in the CRM',
      triggerConfig: { triggerType: 'record_created', model: 'Lead' },
      nextNodeId: 'action_score_lead',
    },

    action_score_lead: {
      id: 'action_score_lead',
      type: 'action',
      name: 'Score Lead',
      description: 'Call the AI scoring agent to assign a lead score 0-100',
      actionConfig: {
        actionType: 'run_agent',
        agentId: 'lead-scoring-agent',
        inputMapping: { lead: '$.lead' },
        outputMapping: { leadScore: '$.score', leadSegment: '$.segment' },
        waitForCompletion: true,
      },
      outputVariable: 'scoring',
      nextNodeId: 'condition_score_route',
      retryPolicy: {
        maxAttempts: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
        maxDelayMs: 10000,
      },
    },

    condition_score_route: {
      id: 'condition_score_route',
      type: 'condition',
      name: 'Route by Score',
      conditionConfig: {
        branches: [
          {
            label: 'Hot lead (score >= 75)',
            condition: {
              type: 'leaf',
              field: '$.scoring.leadScore',
              operator: 'gte',
              value: 75,
            },
            nextNodeId: 'action_notify_sales',
          },
          {
            label: 'Warm lead (score >= 40)',
            condition: {
              type: 'leaf',
              field: '$.scoring.leadScore',
              operator: 'gte',
              value: 40,
            },
            nextNodeId: 'action_send_warm_email',
          },
        ],
        defaultNextNodeId: 'action_send_cold_email',
      },
    },

    action_notify_sales: {
      id: 'action_notify_sales',
      type: 'action',
      name: 'Notify Sales Team',
      actionConfig: {
        actionType: 'send_notification',
        channel: 'slack',
        title: 'Hot Lead Alert',
        messageTemplate:
          'New hot lead: {{lead.name}} ({{lead.email}}) — Score: {{scoring.leadScore}}. Take action now!',
        targetUserIds: ['sales_team'],
      },
      nextNodeId: 'action_send_hot_email',
    },

    action_send_hot_email: {
      id: 'action_send_hot_email',
      type: 'action',
      name: 'Send Hot Lead Email',
      actionConfig: {
        actionType: 'send_email',
        to: '{{lead.email}}',
        subject: 'We would love to connect with you, {{lead.firstName}}',
        bodyTemplate:
          'Hi {{lead.firstName}},\n\nThank you for your interest. We have reserved time to speak with you — please book a call at your earliest convenience.\n\nBest,\nThe Team',
      },
      nextNodeId: 'action_update_lead_status',
    },

    action_send_warm_email: {
      id: 'action_send_warm_email',
      type: 'action',
      name: 'Send Warm Email',
      actionConfig: {
        actionType: 'send_email',
        to: '{{lead.email}}',
        subject: 'Here is a resource we think you will love, {{lead.firstName}}',
        bodyTemplate:
          'Hi {{lead.firstName}},\n\nThanks for your interest. We put together some resources that match your needs.\n\nBest,\nThe Team',
      },
      nextNodeId: 'action_wait_3_days',
    },

    action_send_cold_email: {
      id: 'action_send_cold_email',
      type: 'action',
      name: 'Send Cold Welcome Email',
      actionConfig: {
        actionType: 'send_email',
        to: '{{lead.email}}',
        subject: 'Welcome to {{company.name}}',
        bodyTemplate:
          'Hi {{lead.firstName}},\n\nWelcome! We are thrilled to have you. Here is how to get started.\n\nBest,\nThe Team',
      },
      nextNodeId: 'action_wait_3_days',
    },

    action_wait_3_days: {
      id: 'action_wait_3_days',
      type: 'action',
      name: 'Wait 3 Days',
      actionConfig: { actionType: 'wait', durationMs: 259_200_000 },
      nextNodeId: 'action_send_followup',
    },

    action_send_followup: {
      id: 'action_send_followup',
      type: 'action',
      name: 'Send Follow-up Email',
      actionConfig: {
        actionType: 'send_email',
        to: '{{lead.email}}',
        subject: 'Just checking in, {{lead.firstName}}',
        bodyTemplate:
          'Hi {{lead.firstName}},\n\nWanted to follow up and see if you had any questions. We are here to help.\n\nBest,\nThe Team',
      },
      nextNodeId: 'action_update_lead_status',
    },

    action_update_lead_status: {
      id: 'action_update_lead_status',
      type: 'action',
      name: 'Update Lead Status',
      actionConfig: {
        actionType: 'update_record',
        model: 'Lead',
        idField: 'id',
        data: {
          status: 'nurtured',
          score: '{{scoring.leadScore}}',
          segment: '{{scoring.leadSegment}}',
          lastContactedAt: '{{_now}}',
        },
      },
      nextNodeId: 'end_success',
    },

    end_success: {
      id: 'end_success',
      type: 'end',
      name: 'Nurture Complete',
      outcome: 'success',
    },
  },
};
