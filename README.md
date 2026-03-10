# :unicorn: UniCore Pro

**Advanced AI Agents, Full RBAC, 21+ Channels, and Enterprise Features for UniCore**

[![License: BSL 1.1](https://img.shields.io/badge/License-BSL%201.1-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-3178c6.svg)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10+-ea2845.svg)](https://nestjs.com/)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-enabled-green.svg)](https://openclaw.dev/)

This package extends [UniCore Community](https://github.com/bemindlabs/unicore) with Pro-only features. Requires a valid license key (`UC-XXXX-XXXX-XXXX-XXXX`).

## What's Included

| Feature | Description |
|---|---|
| Router + all 7 specialist agents | Full AI team (Community limited to 3) |
| Custom Agent Builder | Create your own OpenClaw agents |
| Team Roles (up to 5) | Owner, Operator, Marketer, Finance, Viewer |
| Advanced Workflow Automation | Complex multi-step event chains |
| Full Autonomy Levels | Full Auto, Approval, Suggest |
| 21+ Communication Channels | LINE, FB, IG, TikTok, WhatsApp, Telegram, Slack, Discord, etc. |
| Unlimited RAG Memory | No 1GB cap on contextual memory |
| White-label / Custom Branding | Remove UniCore branding |
| SSO / SAML | Enterprise single sign-on |
| Audit Logs | Full activity tracking |
| Priority Support | Direct support channel |

## Installation

```bash
npm install @unicore/pro
```

> Requires `unicore` community edition as the base.

## Project Structure (monorepo)

```
packages/
├── agents-pro/          # Extended agent definitions (all 7 specialists)
├── agent-builder/       # Custom agent creation toolkit
├── rbac/                # Full role-based access control
├── workflows-advanced/  # Advanced workflow engine
├── channels/            # 21+ communication channel adapters
├── branding/            # White-label and custom branding
├── sso/                 # SSO/SAML integration
├── audit/               # Audit logging
└── license-client/      # License key validation client
```

## License

BSL 1.1 — Requires valid UniCore license key for production use.
Contact: license@unicore.dev

Built by BeMind Technology
