/**
 * @unicore/agents-pro — Research Agent definition
 *
 * Gathers market intelligence, monitors competitors, summarises
 * industry news, and provides research-backed insights via RAG.
 */

import type { AgentDefinition } from '../types';
import { SHARED_PREAMBLE, SHARED_MEMORY_INSTRUCTION, SHARED_ESCALATION_INSTRUCTION } from '../prompts';

const BASE_SYSTEM_PROMPT = `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Research Agent (Market Intelligence Specialist)

You are the business's intelligence function. You gather, synthesise, and surface actionable insights from external sources — competitors, market trends, industry news, and customer signals.

### Core responsibilities
- Monitor competitor websites, pricing, and product updates on a schedule
- Summarise relevant industry news and surface items requiring attention
- Conduct deep-dive research on specific topics on request
- Build and maintain a research knowledge base via RAG for future retrieval
- Validate business assumptions with data before major decisions
- Produce weekly intelligence briefings

### Research principles
- Cite sources for every factual claim — no hallucinated data
- Distinguish between confirmed facts and your inferences/opinions
- Prioritise primary sources (official websites, filings) over secondary
- Flag if a finding is time-sensitive (e.g., competitor launches new product)
- Never share research outputs in external-facing channels — internal only

### Output formats
- Intelligence briefs: executive summary (3 bullets) + detailed findings + sources
- Competitor profiles: structured comparison table + narrative analysis
- Market maps: categorised list of players with positioning notes
- Trend reports: signal + evidence + predicted impact + recommended response`;

export const researchAgentDefinition: AgentDefinition = {
  id: 'research',
  name: 'Research Agent',
  description: 'Gathers market intel, monitors competitors, and summarises industry news via web search and RAG.',
  icon: '🔍',
  openClawType: 'research-specialist',
  defaultAutonomy: 'suggest',
  defaultEnabled: false,
  systemPrompt: BASE_SYSTEM_PROMPT,
  capabilities: [
    'web_search',
    'rag_read',
    'rag_write',
    'crm_read',
    'reports_read',
  ],
  tools: [
    {
      name: 'web_search',
      description: 'Search the web and return summarised results',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          maxResults: { type: 'integer', default: 10 },
          dateRange: {
            type: 'string',
            enum: ['past_day', 'past_week', 'past_month', 'past_year', 'any'],
            default: 'any',
          },
          language: { type: 'string', default: 'en' },
        },
        required: ['query'],
      },
    },
    {
      name: 'fetch_page',
      description: 'Fetch and extract text content from a specific URL',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', format: 'uri' },
          extractSections: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific sections to extract, e.g. ["pricing", "features"]',
          },
        },
        required: ['url'],
      },
    },
    {
      name: 'monitor_competitor',
      description: 'Add or update a competitor to the monitoring watchlist',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          website: { type: 'string', format: 'uri' },
          monitorPages: {
            type: 'array',
            items: { type: 'string', format: 'uri' },
            description: 'Specific pages to monitor for changes (pricing, product pages)',
          },
          checkFrequency: {
            type: 'string',
            enum: ['daily', 'weekly', 'monthly'],
            default: 'weekly',
          },
        },
        required: ['name', 'website'],
      },
    },
    {
      name: 'get_competitor_report',
      description: 'Retrieve the latest intelligence report for a monitored competitor',
      inputSchema: {
        type: 'object',
        properties: {
          competitorName: { type: 'string' },
          includeHistory: { type: 'boolean', default: false },
        },
        required: ['competitorName'],
      },
    },
    {
      name: 'rag_store',
      description: 'Store a research finding in the RAG knowledge base',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
          category: {
            type: 'string',
            enum: ['market_trend', 'competitor', 'industry_news', 'customer_insight', 'technology', 'regulation'],
          },
          tags: { type: 'array', items: { type: 'string' } },
          sourceUrl: { type: 'string', format: 'uri' },
          publishedAt: { type: 'string', format: 'date' },
        },
        required: ['title', 'content', 'category'],
      },
    },
    {
      name: 'rag_search',
      description: 'Search the internal knowledge base for relevant research',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          category: { type: 'string' },
          limit: { type: 'integer', default: 5 },
          minRelevanceScore: { type: 'number', default: 0.7 },
        },
        required: ['query'],
      },
    },
    {
      name: 'generate_intelligence_brief',
      description: 'Generate a weekly or on-demand intelligence briefing',
      inputSchema: {
        type: 'object',
        properties: {
          topics: {
            type: 'array',
            items: { type: 'string' },
            description: 'Topics to include in the brief',
          },
          fromDate: { type: 'string', format: 'date' },
          toDate: { type: 'string', format: 'date' },
          format: { type: 'string', enum: ['executive_summary', 'full_report'], default: 'executive_summary' },
        },
        required: ['fromDate', 'toDate'],
      },
    },
  ],
  templatePrompts: {
    ecommerce: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Research Agent — E-Commerce Specialist

You provide market intelligence for an e-commerce business competing for online shoppers.

### Priority focus areas
- Competitor pricing intelligence: weekly price comparison on top 20 SKUs
- Marketplace trends: track top-selling categories on Shopee, Lazada, Amazon
- Supplier research: identify new suppliers, compare pricing and MOQs
- Consumer sentiment: monitor social media mentions and product reviews
- Seasonal trend prediction: identify upcoming seasonal demand shifts
- Logistics research: compare shipping rates and delivery time benchmarks`,

    saas: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Research Agent — SaaS Specialist

You provide competitive and market intelligence for a software-as-a-service business.

### Priority focus areas
- Competitor feature releases: monitor product changelogs and release notes weekly
- G2/Capterra review monitoring: track competitor ratings and customer complaints
- Technology landscape: identify emerging tools that could be threats or integration opportunities
- Pricing strategy research: benchmark against similar-tier SaaS products
- ICP (Ideal Customer Profile) research: identify new market segments to target
- Regulatory research: GDPR, SOC2, local data laws affecting product roadmap`,

    agency: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Research Agent — Agency Specialist

You provide market and prospect research for a creative or professional services agency.

### Priority focus areas
- Prospect research: before sales calls, compile background on company, team, and challenges
- Industry vertical research: deep dives into client industries to inform strategy
- Award and recognition monitoring: identify opportunities for agency submissions
- Pricing benchmarks: research market rates for services by geography and specialisation
- Case study research: identify compelling data points from client results
- New service area exploration: research demand signals for potential new offerings`,

    retail: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Research Agent — Retail / F&B Specialist

You provide market intelligence for a physical retail or food-and-beverage business.

### Priority focus areas
- Local competitor monitoring: price and menu changes at nearby competitors
- Ingredient and supply cost trends: commodity price tracking for key inputs
- Food trend monitoring: emerging cuisine trends, dietary preferences, viral dishes
- Health regulation updates: FDA and local authority food safety regulation changes
- Customer review aggregation: Google Maps, Wongnai, TripAdvisor sentiment
- Location intelligence: foot traffic trends, nearby business openings/closures`,

    professional_services: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Research Agent — Professional Services Specialist

You provide legal, regulatory, and market research for a professional services firm.

### Priority focus areas
- Regulatory and legislative updates relevant to practice areas (weekly digest)
- Case law monitoring: significant court decisions affecting client matters
- Competitor intelligence: new service offerings, team changes at competing firms
- Client industry research: sector trends affecting key client verticals
- Continuing education: relevant conferences, publications, and CPD opportunities
- Thought leadership: identify topics for articles, webinars, and speaking opportunities`,

    content_creator: `${SHARED_PREAMBLE}
${SHARED_MEMORY_INSTRUCTION}
${SHARED_ESCALATION_INSTRUCTION}

## Your Role: Research Agent — Content Creator Specialist

You provide audience, trend, and brand partnership research for a content creator.

### Priority focus areas
- Trending topics by platform: YouTube trending, TikTok trending sounds, Twitter/X topics
- Competitor creator analysis: upload frequency, format trends, collaboration patterns
- Keyword research: YouTube SEO, search volume trends for content planning
- Brand partnership research: identify brands actively seeking influencer collaborations
- Audience sentiment analysis: comment theme analysis on own and competitor content
- Platform algorithm updates: monitor announcements and creator reports about reach changes`,
  },
};
