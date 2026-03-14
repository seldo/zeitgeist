# Zeitgeist

Social feed summarizer: Bluesky + Twitter + Mastodon. Next.js 16 app with plain CSS (no Tailwind).

## Quick start

```bash
cp .env.local.example .env.local  # add ANTHROPIC_API_KEY + owner handles
npm run dev
# Open http://127.0.0.1:3000 (not localhost — Bluesky OAuth redirect requires 127.0.0.1)
```

## Architecture

Single-page client component ([app/page.tsx](app/page.tsx)) handles all three platforms:
- OAuth login, session restore, feed fetch, summary display, and post recommendations
- Platform state tracked via `activePlatform` with tab switching

### API routes

- `app/api/summarize/route.ts` — Streams Claude summary of feed posts
- `app/api/recommend/route.ts` — Claude picks 10 posts the user might want to interact with
- `app/api/oembed/route.ts` — Proxies oEmbed requests (avoids CORS issues)
- `app/api/client-metadata/route.ts` — AT Protocol OAuth client metadata
- `app/api/twitter/` — Twitter OAuth 1.0a + timeline + user-posts
- `app/api/mastodon/` — Mastodon OAuth 2.0 (dynamic per-instance) + timeline + user-posts
- `app/api/github/` — GitHub OAuth for Copilot LLM provider

### Key patterns

- **BYOK**: Owner handles use server-side API key; other users must provide their own
- **CIMD**: Development uses `https://cimd-service.fly.dev/` for Bluesky OAuth client metadata (loopback can't serve it publicly)
- **Dynamic imports**: `@atproto/oauth-client-browser` and `@atproto/api` are dynamically imported to avoid SSR issues
- **Mastodon federation**: App registers OAuth client per-instance via `POST /api/v1/apps`, stores credentials in cookies
- **Caching**: Summaries and recommendations cached in localStorage with 24h TTL, keyed by platform

### Shared utilities

- `lib/html.ts` — `stripHtml()` for cleaning Mastodon HTML content

## Environment variables

See `.env.local.example` for the full list. Key ones:
- `ANTHROPIC_API_KEY` — server-side Claude API key
- `OWNER_HANDLE` / `NEXT_PUBLIC_OWNER_HANDLE` — Bluesky owner handle
- `TWITTER_OWNER_HANDLE` — Twitter owner handle
- `MASTODON_OWNER_HANDLE` / `NEXT_PUBLIC_MASTODON_OWNER_HANDLE` — Mastodon owner (format: `user@instance`)
- `TWITTER_CONSUMER_KEY` / `TWITTER_SECRET_KEY` — Twitter OAuth credentials
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub OAuth (optional, for Copilot)

## Style

- Plain CSS in [app/globals.css](app/globals.css) using seldo.com design tokens (Lora + DM Mono fonts)
- No Tailwind (deps in package.json but unused)
- Claude model: `claude-sonnet-4-6`
