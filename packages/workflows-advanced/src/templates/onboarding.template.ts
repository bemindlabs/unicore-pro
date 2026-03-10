/**
 * Template: Customer Onboarding
 * Walks a new customer through a structured onboarding journey with
 * personalised emails, milestone tracking, and health scoring.
 */

import type { WorkflowDefinition } from '../types/index.js';

export const onboardingTemplate: WorkflowDefinition = {
  schemaVersion: '1.0.0',
  id: 'tpl_customer_onboarding',
  name: 'Customer Onboarding',
  description:
    'Guided onboarding sequence: welcome, product setup, educational drip, milestone checks, and success team touchpoints.',
  tags: ['onboarding', 'crm', 'customer-success', 'email'],
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  entryNodeId: 'trigger_customer_signed_up',
  settings: {
    persistHistory: true,
    maxConcurrentExecutions: 200,
  },
  inputSchema: [
    { name: 'customer', type: 'object', required: true, description: 'Customer record' },
    { name: 'plan', type: 'string', required: true, description: 'Subscription plan name' },
  ],
  nodes: {
    trigger_customer_signed_up: {
      id: 'trigger_customer_signed_up',
      type: 'trigger',
      name: 'Customer Signed Up',
      triggerConfig: { triggerType: 'event', eventName: 'customer.signed_up' },
      nextNodeId: 'action_send_welcome_email',
    },

    action_send_welcome_email: {
      id: 'action_send_welcome_email',
      type: 'action',
      name: 'Send Welcome Email',
      actionConfig: {
        actionType: 'send_email',
        to: '{{customer.email}}',
        subject: 'Welcome to UniCore, {{customer.firstName}}!',
        bodyTemplate:
          'Hi {{customer.firstName}},\n\nWelcome aboard! Your account is ready. Here is how to get started in 3 steps:\n\n1. Complete your profile\n2. Connect your first integration\n3. Set up your first workflow\n\nWe are here to help every step of the way.\n\nYour success team',
      },
      nextNodeId: 'action_create_onboarding_tasks',
    },

    action_create_onboarding_tasks: {
      id: 'action_create_onboarding_tasks',
      type: 'action',
      name: 'Create Onboarding Task List',
      actionConfig: {
        actionType: 'create_record',
        model: 'OnboardingChecklist',
        data: {
          customerId: '{{customer.id}}',
          plan: '{{plan}}',
          tasks: [
            'complete_profile',
            'connect_integration',
            'create_workflow',
            'invite_team_member',
          ],
          status: 'in_progress',
          startedAt: '{{_now}}',
        },
      },
      nextNodeId: 'loop_onboarding_steps',
    },

    loop_onboarding_steps: {
      id: 'loop_onboarding_steps',
      type: 'loop',
      name: 'Onboarding Step Drip',
      description: 'Send one educational email per day for 5 days',
      loopConfig: {
        loopType: 'count',
        count: 5,
        indexVariable: 'stepIndex',
      },
      bodyNodeId: 'action_send_day_email',
      nextNodeId: 'action_check_activation',
    },

    action_send_day_email: {
      id: 'action_send_day_email',
      type: 'action',
      name: 'Send Day Email',
      actionConfig: {
        actionType: 'send_email',
        to: '{{customer.email}}',
        subject: 'Day {{stepIndex}} — Getting the most out of UniCore',
        bodyTemplate:
          'Hi {{customer.firstName}},\n\nToday is day {{stepIndex}} of your onboarding journey. Here is what we recommend doing today to get more value from UniCore.\n\nTip of the day: [Day {{stepIndex}} tip here]\n\nYour success team',
      },
      nextNodeId: 'action_wait_1_day',
    },

    action_wait_1_day: {
      id: 'action_wait_1_day',
      type: 'action',
      name: 'Wait 1 Day',
      actionConfig: { actionType: 'wait', durationMs: 86_400_000 },
    },

    action_check_activation: {
      id: 'action_check_activation',
      type: 'action',
      name: 'Check Activation Status',
      actionConfig: {
        actionType: 'http_request',
        url: 'https://api.internal/customers/{{customer.id}}/activation-score',
        method: 'GET',
        outputMapping: { activationScore: '$.score', completedSteps: '$.completedSteps' },
      },
      nextNodeId: 'condition_activation_check',
    },

    condition_activation_check: {
      id: 'condition_activation_check',
      type: 'condition',
      name: 'Activated?',
      conditionConfig: {
        branches: [
          {
            label: 'Fully activated',
            condition: {
              type: 'leaf',
              field: '$.activationScore',
              operator: 'gte',
              value: 80,
            },
            nextNodeId: 'action_mark_onboarded',
          },
          {
            label: 'Needs help',
            condition: {
              type: 'leaf',
              field: '$.activationScore',
              operator: 'lt',
              value: 40,
            },
            nextNodeId: 'action_schedule_success_call',
          },
        ],
        defaultNextNodeId: 'action_send_encouragement',
      },
    },

    action_mark_onboarded: {
      id: 'action_mark_onboarded',
      type: 'action',
      name: 'Mark Customer as Onboarded',
      actionConfig: {
        actionType: 'update_record',
        model: 'Customer',
        idField: 'id',
        data: { onboardingStatus: 'completed', onboardedAt: '{{_now}}' },
      },
      nextNodeId: 'end_success',
    },

    action_schedule_success_call: {
      id: 'action_schedule_success_call',
      type: 'action',
      name: 'Schedule Success Call',
      actionConfig: {
        actionType: 'send_email',
        to: '{{customer.email}}',
        subject: 'Let us help you get set up, {{customer.firstName}}',
        bodyTemplate:
          'Hi {{customer.firstName}},\n\nWe noticed you might need a hand with setup. We would love to schedule a quick call to help you get the most out of UniCore.\n\nBook a time that works for you: [calendar link]\n\nYour success team',
      },
      nextNodeId: 'end_needs_support',
    },

    action_send_encouragement: {
      id: 'action_send_encouragement',
      type: 'action',
      name: 'Send Encouragement Email',
      actionConfig: {
        actionType: 'send_email',
        to: '{{customer.email}}',
        subject: 'You are making great progress, {{customer.firstName}}!',
        bodyTemplate:
          'Hi {{customer.firstName}},\n\nYou have completed {{completedSteps}} setup steps. You are almost there — just a few more to unlock the full power of UniCore.\n\nYour success team',
      },
      nextNodeId: 'end_in_progress',
    },

    end_success: {
      id: 'end_success',
      type: 'end',
      name: 'Onboarding Complete',
      outcome: 'success',
    },

    end_needs_support: {
      id: 'end_needs_support',
      type: 'end',
      name: 'Requires Success Team',
      outcome: 'needs_support',
    },

    end_in_progress: {
      id: 'end_in_progress',
      type: 'end',
      name: 'Onboarding In Progress',
      outcome: 'in_progress',
    },
  },
};
