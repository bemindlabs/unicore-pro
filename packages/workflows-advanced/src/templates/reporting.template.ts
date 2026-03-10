/**
 * Template: Automated Reporting
 * Generates and distributes business reports on a schedule.
 */

import type { WorkflowDefinition } from '../types/index.js';

export const reportingTemplate: WorkflowDefinition = {
  schemaVersion: '1.0.0',
  id: 'tpl_automated_reporting',
  name: 'Automated Reporting',
  description:
    'Scheduled workflow that collects KPIs from multiple sources in parallel, generates an AI-summarised report, and distributes it to stakeholders.',
  tags: ['reporting', 'analytics', 'scheduled', 'business-intelligence'],
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  entryNodeId: 'trigger_weekly_schedule',
  settings: {
    persistHistory: true,
    timeoutMs: 3_600_000, // 1 hour
  },
  inputSchema: [
    {
      name: 'reportPeriod',
      type: 'string',
      defaultValue: 'last_7_days',
      description: 'Reporting period: last_7_days | last_30_days | last_quarter',
    },
    {
      name: 'recipients',
      type: 'array',
      description: 'Email addresses to send the report to',
    },
  ],
  nodes: {
    trigger_weekly_schedule: {
      id: 'trigger_weekly_schedule',
      type: 'trigger',
      name: 'Weekly Schedule',
      triggerConfig: {
        triggerType: 'schedule',
        cron: '0 8 * * MON', // Every Monday at 8 AM
        timezone: 'UTC',
      },
      nextNodeId: 'parallel_collect_data',
    },

    parallel_collect_data: {
      id: 'parallel_collect_data',
      type: 'parallel',
      name: 'Collect KPI Data',
      description: 'Fetch data from all sources concurrently',
      parallelConfig: { waitStrategy: 'all', maxConcurrency: 5 },
      branches: [
        { id: 'branch_revenue', name: 'Revenue', entryNodeId: 'action_fetch_revenue' },
        { id: 'branch_leads', name: 'Leads', entryNodeId: 'action_fetch_leads' },
        { id: 'branch_support', name: 'Support', entryNodeId: 'action_fetch_support' },
        { id: 'branch_ops', name: 'Operations', entryNodeId: 'action_fetch_ops' },
      ],
      nextNodeId: 'action_generate_report',
    },

    action_fetch_revenue: {
      id: 'action_fetch_revenue',
      type: 'action',
      name: 'Fetch Revenue Data',
      actionConfig: {
        actionType: 'http_request',
        url: 'https://api.internal/analytics/revenue?period={{reportPeriod}}',
        method: 'GET',
        outputMapping: {
          revenue_total: '$.total',
          revenue_growth: '$.growthPct',
          revenue_byProduct: '$.byProduct',
        },
      },
      retryPolicy: { maxAttempts: 3, initialDelayMs: 2000, backoffMultiplier: 2, maxDelayMs: 20000 },
    },

    action_fetch_leads: {
      id: 'action_fetch_leads',
      type: 'action',
      name: 'Fetch Lead & Sales Data',
      actionConfig: {
        actionType: 'http_request',
        url: 'https://api.internal/analytics/leads?period={{reportPeriod}}',
        method: 'GET',
        outputMapping: {
          leads_total: '$.total',
          leads_converted: '$.converted',
          leads_conversionRate: '$.conversionRate',
          leads_pipeline: '$.pipelineValue',
        },
      },
      retryPolicy: { maxAttempts: 3, initialDelayMs: 2000, backoffMultiplier: 2, maxDelayMs: 20000 },
    },

    action_fetch_support: {
      id: 'action_fetch_support',
      type: 'action',
      name: 'Fetch Support Metrics',
      actionConfig: {
        actionType: 'http_request',
        url: 'https://api.internal/analytics/support?period={{reportPeriod}}',
        method: 'GET',
        outputMapping: {
          support_ticketsTotal: '$.totalTickets',
          support_resolved: '$.resolved',
          support_avgResolutionHrs: '$.avgResolutionHours',
          support_csat: '$.csatScore',
        },
      },
    },

    action_fetch_ops: {
      id: 'action_fetch_ops',
      type: 'action',
      name: 'Fetch Operations Data',
      actionConfig: {
        actionType: 'http_request',
        url: 'https://api.internal/analytics/operations?period={{reportPeriod}}',
        method: 'GET',
        outputMapping: {
          ops_workflowsRun: '$.workflowsRun',
          ops_agentTasks: '$.agentTasksCompleted',
          ops_errorRate: '$.errorRate',
          ops_automationSavings: '$.hoursSaved',
        },
      },
    },

    action_generate_report: {
      id: 'action_generate_report',
      type: 'action',
      name: 'Generate AI Report Summary',
      actionConfig: {
        actionType: 'run_agent',
        agentId: 'report-writer-agent',
        inputMapping: {
          period: '$.reportPeriod',
          revenue: '$.revenue_total',
          revenueGrowth: '$.revenue_growth',
          leadsTotal: '$.leads_total',
          conversionRate: '$.leads_conversionRate',
          csatScore: '$.support_csat',
          hoursSaved: '$.ops_automationSavings',
        },
        outputMapping: { reportHtml: '$.html', reportSummary: '$.summary', reportInsights: '$.insights' },
        waitForCompletion: true,
      },
      outputVariable: 'report',
      nextNodeId: 'action_store_report',
    },

    action_store_report: {
      id: 'action_store_report',
      type: 'action',
      name: 'Store Report',
      actionConfig: {
        actionType: 'create_record',
        model: 'BusinessReport',
        data: {
          period: '{{reportPeriod}}',
          generatedAt: '{{_now}}',
          htmlContent: '{{report.reportHtml}}',
          summary: '{{report.reportSummary}}',
          insights: '{{report.reportInsights}}',
          kpis: {
            revenue: '{{revenue_total}}',
            revenueGrowth: '{{revenue_growth}}',
            leads: '{{leads_total}}',
            conversionRate: '{{leads_conversionRate}}',
            csat: '{{support_csat}}',
            hoursSaved: '{{ops_automationSavings}}',
          },
        },
      },
      nextNodeId: 'loop_distribute_report',
    },

    loop_distribute_report: {
      id: 'loop_distribute_report',
      type: 'loop',
      name: 'Distribute to Recipients',
      loopConfig: {
        loopType: 'for_each',
        collection: '$.recipients',
        itemVariable: 'recipient',
        concurrency: 5,
      },
      bodyNodeId: 'action_email_report',
      nextNodeId: 'end_success',
    },

    action_email_report: {
      id: 'action_email_report',
      type: 'action',
      name: 'Email Report to Recipient',
      actionConfig: {
        actionType: 'send_email',
        to: '{{recipient}}',
        subject: 'Weekly Business Report — {{reportPeriod}}',
        bodyTemplate: '{{report.reportHtml}}',
      },
    },

    end_success: {
      id: 'end_success',
      type: 'end',
      name: 'Report Distributed',
      outcome: 'success',
    },
  },
};
