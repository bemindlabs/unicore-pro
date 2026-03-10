/**
 * Template: Churn Prevention
 * Detects at-risk customers and triggers a retention intervention.
 */

import type { WorkflowDefinition } from '../types/index.js';

export const churnPreventionTemplate: WorkflowDefinition = {
  schemaVersion: '1.0.0',
  id: 'tpl_churn_prevention',
  name: 'Churn Prevention',
  description:
    'Monitors customer health scores, identifies at-risk customers, and triggers personalised retention campaigns or success team interventions.',
  tags: ['retention', 'churn', 'customer-success', 'crm'],
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  entryNodeId: 'trigger_health_score_dropped',
  settings: {
    persistHistory: true,
    maxConcurrentExecutions: 50,
  },
  inputSchema: [
    { name: 'customer', type: 'object', required: true, description: 'Customer record' },
    { name: 'healthScore', type: 'number', required: true, description: 'Current health score (0–100)' },
    { name: 'previousHealthScore', type: 'number', required: false, description: 'Previous health score' },
  ],
  nodes: {
    trigger_health_score_dropped: {
      id: 'trigger_health_score_dropped',
      type: 'trigger',
      name: 'Health Score Dropped',
      triggerConfig: {
        triggerType: 'event',
        eventName: 'customer.health_score_changed',
        filter: {
          type: 'leaf',
          field: '$.healthScore',
          operator: 'lt',
          value: 50,
        },
      },
      nextNodeId: 'action_assess_churn_risk',
    },

    action_assess_churn_risk: {
      id: 'action_assess_churn_risk',
      type: 'action',
      name: 'Assess Churn Risk',
      actionConfig: {
        actionType: 'run_agent',
        agentId: 'churn-risk-agent',
        inputMapping: {
          customerId: '$.customer.id',
          healthScore: '$.healthScore',
          previousScore: '$.previousHealthScore',
          plan: '$.customer.plan',
          daysActive: '$.customer.daysActive',
        },
        outputMapping: {
          churnRisk: '$.risk',
          riskReasons: '$.reasons',
          recommendedIntervention: '$.intervention',
          retentionOffer: '$.offer',
        },
        waitForCompletion: true,
      },
      outputVariable: 'churnAssessment',
      nextNodeId: 'condition_risk_level',
    },

    condition_risk_level: {
      id: 'condition_risk_level',
      type: 'condition',
      name: 'Risk Level',
      conditionConfig: {
        branches: [
          {
            label: 'Critical churn risk',
            condition: {
              type: 'leaf',
              field: '$.churnAssessment.churnRisk',
              operator: 'eq',
              value: 'critical',
            },
            nextNodeId: 'parallel_critical_intervention',
          },
          {
            label: 'High churn risk',
            condition: {
              type: 'leaf',
              field: '$.churnAssessment.churnRisk',
              operator: 'eq',
              value: 'high',
            },
            nextNodeId: 'action_send_retention_email',
          },
        ],
        defaultNextNodeId: 'action_send_re_engagement',
      },
    },

    parallel_critical_intervention: {
      id: 'parallel_critical_intervention',
      type: 'parallel',
      name: 'Critical Intervention',
      parallelConfig: { waitStrategy: 'all' },
      branches: [
        { id: 'branch_alert', name: 'Alert Success Team', entryNodeId: 'action_alert_success_team' },
        { id: 'branch_offer', name: 'Send Retention Offer', entryNodeId: 'action_send_retention_offer' },
      ],
      nextNodeId: 'action_create_intervention_record',
    },

    action_alert_success_team: {
      id: 'action_alert_success_team',
      type: 'action',
      name: 'Alert Success Team',
      actionConfig: {
        actionType: 'send_notification',
        channel: 'slack',
        title: 'CHURN RISK: {{customer.name}} ({{customer.plan}})',
        messageTemplate:
          'Customer {{customer.name}} has a CRITICAL churn risk (health score: {{healthScore}}).\nReasons: {{churnAssessment.riskReasons}}\nRecommended action: {{churnAssessment.recommendedIntervention}}\n\nPlease reach out within 24 hours.',
        targetUserIds: ['customer_success_team'],
      },
    },

    action_send_retention_offer: {
      id: 'action_send_retention_offer',
      type: 'action',
      name: 'Send Retention Offer',
      actionConfig: {
        actionType: 'send_email',
        to: '{{customer.email}}',
        subject: 'We want to make things right, {{customer.firstName}}',
        bodyTemplate:
          'Hi {{customer.firstName}},\n\nWe noticed you have not been getting the value you deserve from UniCore. We want to help.\n\nAs a valued customer, we are offering you: {{churnAssessment.retentionOffer}}\n\nWould you be open to a quick call to discuss how we can better serve you?\n\nYour success team',
      },
    },

    action_send_retention_email: {
      id: 'action_send_retention_email',
      type: 'action',
      name: 'Send Retention Email',
      actionConfig: {
        actionType: 'send_email',
        to: '{{customer.email}}',
        subject: 'We miss you, {{customer.firstName}} — here is how we can help',
        bodyTemplate:
          'Hi {{customer.firstName}},\n\nWe want to make sure UniCore is working great for you. Here are some resources and tips based on your usage.\n\n{{churnAssessment.recommendedIntervention}}\n\nYour success team',
      },
      nextNodeId: 'action_create_intervention_record',
    },

    action_send_re_engagement: {
      id: 'action_send_re_engagement',
      type: 'action',
      name: 'Send Re-engagement Email',
      actionConfig: {
        actionType: 'send_email',
        to: '{{customer.email}}',
        subject: 'New features you might have missed, {{customer.firstName}}',
        bodyTemplate:
          'Hi {{customer.firstName}},\n\nWe have added some great new features since you last logged in. Here is a quick summary of what is new and how it can help your business.',
      },
      nextNodeId: 'action_create_intervention_record',
    },

    action_create_intervention_record: {
      id: 'action_create_intervention_record',
      type: 'action',
      name: 'Record Intervention',
      actionConfig: {
        actionType: 'create_record',
        model: 'ChurnIntervention',
        data: {
          customerId: '{{customer.id}}',
          healthScore: '{{healthScore}}',
          churnRisk: '{{churnAssessment.churnRisk}}',
          riskReasons: '{{churnAssessment.riskReasons}}',
          interventionType: '{{churnAssessment.recommendedIntervention}}',
          createdAt: '{{_now}}',
        },
      },
      nextNodeId: 'end_intervention_complete',
    },

    end_intervention_complete: {
      id: 'end_intervention_complete',
      type: 'end',
      name: 'Intervention Complete',
      outcome: 'success',
    },
  },
};
