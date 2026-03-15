# KeyLore Discoverability Plan

This plan turns the current research report into a staged execution backlog. The goal is not generic “content marketing”; it is to make KeyLore discoverable for the specific problems it solves:

- secure AI agent credentials
- MCP security and setup
- why `.env` is the wrong default for agentic tools
- Codex, Gemini CLI, and Claude CLI credential brokering

## Completed in this pass

- Expanded the public site from one page into multiple indexable sections:
  - `/`
  - `/docs/`
  - `/integrations/`
  - `/integrations/codex.html`
  - `/integrations/gemini.html`
  - `/integrations/claude.html`
  - `/security/`
  - `/kb/`
- Added FAQ structured data to the KB page.
- Updated sitemap coverage for the expanded URL set.
- Refocused the homepage around problem-led messaging instead of only product narrative.

## Phase 1: Immediate discoverability fixes

Target: next 7 days

- Completed:
  - Added GitHub repository description, homepage URL, and topics aligned to:
  - `mcp`
  - `model-context-protocol`
  - `ai-agents`
  - `secrets-management`
  - `oauth`
  - `agent-security`
  - `credential-broker`
  - `codex`
  - `gemini-cli`
  - `claude`
  - Expanded the site architecture into stable crawlable sections under `/docs/`, `/integrations/`, `/security/`, and `/kb/`.
  - Added internal linking between homepage, docs, integrations, security, and KB pages.
  - Mirrored the strongest high-intent docs content onto the public domain with on-site pages for:
    - install
    - UI workflow
    - MCP behavior
    - `.env` migration
    - `.env` security rationale
    - MCP risk framing

Phase 1 is now complete. The next work starts at Phase 2.

## Phase 2: Highest-ROI content pages

Target: next 30 days

- Publish two stronger recipe pages:
  - Codex MCP setup
  - Gemini CLI MCP setup
- Publish a security anchor page:
  - MCP risks
  - prompt injection
  - tool poisoning
  - why brokered credentials are safer
- Publish a dedicated “Why not `.env` for AI agents?” page.
- Expand KB into query-shaped pages based on recurring setup mistakes.

## Phase 3: Utility pages that earn links

Target: next 30–60 days

- Build an in-browser MCP config lint tool.
- Build a token metadata generator for:
  - human context
  - LLM context
  - common warnings
- Build a policy template builder for common HTTP access patterns.

These are higher leverage than generic blog posts because they are directly useful in setup and troubleshooting threads.

## Phase 4: Content cadence

Target: next 6 months

- Publish 2 items per week:
  - 1 evergreen guide or recipe
  - 1 troubleshooting / FAQ / KB item
- Publish 1 deeper anchor piece per month:
  - security
  - OAuth
  - governance
- Publish 1 utility page or template asset per month.

## Measurement

- Search Console:
  - impressions
  - clicks
  - query coverage by section
- Activation signals:
  - npm package clicks
  - GitHub clicks
  - docs clicks
- Trust signals:
  - backlinks to security and tool pages
  - GitHub stars and forks

## Content standards

- Problem-led, not slogan-led.
- Technical, not fluffy.
- Clear threat model framing.
- One search intent per page.
- Every page ends with one next action:
  - install
  - integrate
  - secure
  - troubleshoot
