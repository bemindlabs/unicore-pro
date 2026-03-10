/**
 * Template: Order Fulfillment
 * Processes a new order end-to-end: payment capture, inventory, fulfilment, and notification.
 */

import type { WorkflowDefinition } from '../types/index.js';

export const orderFulfillmentTemplate: WorkflowDefinition = {
  schemaVersion: '1.0.0',
  id: 'tpl_order_fulfillment',
  name: 'Order Fulfillment',
  description:
    'Full order processing: validates payment, reserves inventory, creates shipment, and notifies the customer at each step.',
  tags: ['ecommerce', 'fulfillment', 'orders', 'logistics'],
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  entryNodeId: 'trigger_order_created',
  settings: {
    persistHistory: true,
    maxConcurrentExecutions: 500,
  },
  inputSchema: [
    { name: 'order', type: 'object', required: true, description: 'Order record' },
  ],
  nodes: {
    trigger_order_created: {
      id: 'trigger_order_created',
      type: 'trigger',
      name: 'Order Created',
      triggerConfig: { triggerType: 'record_created', model: 'Order' },
      nextNodeId: 'parallel_validate',
    },

    parallel_validate: {
      id: 'parallel_validate',
      type: 'parallel',
      name: 'Validate Order',
      description: 'Validate payment and check inventory concurrently',
      parallelConfig: { waitStrategy: 'all' },
      branches: [
        { id: 'branch_payment', name: 'Payment Check', entryNodeId: 'action_verify_payment' },
        { id: 'branch_inventory', name: 'Inventory Check', entryNodeId: 'action_check_inventory' },
      ],
      nextNodeId: 'condition_validation_ok',
    },

    action_verify_payment: {
      id: 'action_verify_payment',
      type: 'action',
      name: 'Verify Payment',
      actionConfig: {
        actionType: 'http_request',
        url: 'https://payments.internal/verify/{{order.paymentIntentId}}',
        method: 'GET',
        outputMapping: { paymentStatus: '$.status', paymentAmount: '$.amount' },
      },
      retryPolicy: { maxAttempts: 3, initialDelayMs: 500, backoffMultiplier: 2, maxDelayMs: 5000 },
    },

    action_check_inventory: {
      id: 'action_check_inventory',
      type: 'action',
      name: 'Check Inventory',
      actionConfig: {
        actionType: 'http_request',
        url: 'https://inventory.internal/check',
        method: 'POST',
        body: '{"items": {{order.items}}}',
        outputMapping: { inventoryAvailable: '$.available', backorderItems: '$.backorder' },
      },
    },

    condition_validation_ok: {
      id: 'condition_validation_ok',
      type: 'condition',
      name: 'Validation Passed?',
      conditionConfig: {
        branches: [
          {
            label: 'Both valid',
            condition: {
              type: 'and',
              conditions: [
                { type: 'leaf', field: '$.paymentStatus', operator: 'eq', value: 'captured' },
                { type: 'leaf', field: '$.inventoryAvailable', operator: 'eq', value: true },
              ],
            },
            nextNodeId: 'action_reserve_inventory',
          },
          {
            label: 'Payment failed',
            condition: {
              type: 'leaf',
              field: '$.paymentStatus',
              operator: 'neq',
              value: 'captured',
            },
            nextNodeId: 'action_notify_payment_failed',
          },
        ],
        defaultNextNodeId: 'action_notify_out_of_stock',
      },
    },

    action_reserve_inventory: {
      id: 'action_reserve_inventory',
      type: 'action',
      name: 'Reserve Inventory',
      actionConfig: {
        actionType: 'http_request',
        url: 'https://inventory.internal/reserve',
        method: 'POST',
        body: '{"orderId": "{{order.id}}", "items": {{order.items}}}',
        outputMapping: { reservationId: '$.reservationId' },
      },
      nextNodeId: 'action_create_shipment',
    },

    action_create_shipment: {
      id: 'action_create_shipment',
      type: 'action',
      name: 'Create Shipment',
      actionConfig: {
        actionType: 'http_request',
        url: 'https://logistics.internal/shipments',
        method: 'POST',
        body: '{"orderId": "{{order.id}}", "address": {{order.shippingAddress}}, "reservationId": "{{reservationId}}"}',
        outputMapping: { trackingNumber: '$.trackingNumber', estimatedDelivery: '$.estimatedDelivery' },
      },
      nextNodeId: 'action_update_order_shipped',
    },

    action_update_order_shipped: {
      id: 'action_update_order_shipped',
      type: 'action',
      name: 'Update Order to Shipped',
      actionConfig: {
        actionType: 'update_record',
        model: 'Order',
        idField: 'id',
        data: {
          status: 'shipped',
          trackingNumber: '{{trackingNumber}}',
          estimatedDelivery: '{{estimatedDelivery}}',
          shippedAt: '{{_now}}',
        },
      },
      nextNodeId: 'action_notify_customer_shipped',
    },

    action_notify_customer_shipped: {
      id: 'action_notify_customer_shipped',
      type: 'action',
      name: 'Notify Customer — Shipped',
      actionConfig: {
        actionType: 'send_email',
        to: '{{order.customer.email}}',
        subject: 'Your order #{{order.number}} has shipped!',
        bodyTemplate:
          'Hi {{order.customer.firstName}},\n\nGreat news — your order is on its way!\n\nTracking: {{trackingNumber}}\nEstimated delivery: {{estimatedDelivery}}\n\nThank you for your purchase!',
      },
      nextNodeId: 'end_fulfilled',
    },

    action_notify_payment_failed: {
      id: 'action_notify_payment_failed',
      type: 'action',
      name: 'Notify Customer — Payment Failed',
      actionConfig: {
        actionType: 'send_email',
        to: '{{order.customer.email}}',
        subject: 'Action required for order #{{order.number}}',
        bodyTemplate:
          'Hi {{order.customer.firstName}},\n\nUnfortunately, your payment could not be processed. Please update your payment method to complete your order.',
      },
      nextNodeId: 'end_payment_failed',
    },

    action_notify_out_of_stock: {
      id: 'action_notify_out_of_stock',
      type: 'action',
      name: 'Notify Customer — Out of Stock',
      actionConfig: {
        actionType: 'send_email',
        to: '{{order.customer.email}}',
        subject: 'Update on your order #{{order.number}}',
        bodyTemplate:
          'Hi {{order.customer.firstName}},\n\nSome items in your order are currently out of stock: {{backorderItems}}. We will update you when they become available.',
      },
      nextNodeId: 'end_backordered',
    },

    end_fulfilled: {
      id: 'end_fulfilled',
      type: 'end',
      name: 'Order Fulfilled',
      outcome: 'success',
    },

    end_payment_failed: {
      id: 'end_payment_failed',
      type: 'end',
      name: 'Payment Failed',
      outcome: 'failure',
    },

    end_backordered: {
      id: 'end_backordered',
      type: 'end',
      name: 'Order Backordered',
      outcome: 'backordered',
    },
  },
};
