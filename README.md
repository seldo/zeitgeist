# Zeitgeist

A social feed summarizer powered by Claude. Sign in with your Bluesky, Twitter, or Mastodon account and an Anthropic API key, and Zeitgeist fetches the last 24 hours of your timeline and uses Claude to produce a themed summary of what people are talking about -- plus personalized post recommendations based on your recent activity.

Live at [zeitgeist.blue](https://zeitgeist.blue).

## How it works

1. You sign in via OAuth (Bluesky, Twitter, or Mastodon -- no passwords stored)
2. Zeitgeist fetches up to 2,000 posts from your timeline over the last 24 hours
3. The posts are sent to Claude (Sonnet), which organizes them by theme and summarizes the conversations, with inline links to representative posts
4. Your last 100 posts are analyzed to understand your interests, and 10 posts from your feed are recommended as ones you might want to interact with
5. Summaries and recommendations are cached locally so you can revisit without re-fetching

## BYOK (Bring Your Own Key)

The site owner's handles are configured via environment variables. When the owner signs in, the server-side Anthropic API key is used. Everyone else needs to provide their own Anthropic API key, which is used directly and never stored on the server.

An optional GitHub Copilot integration is also available as an alternative LLM provider.

## Setup

```bash
git clone https://github.com/seldo/zeitgeist.git
cd zeitgeist
npm install
cp .env.local.example .env.local
```

Edit `.env.local` with your API keys and owner handles (see `.env.local.example` for all options):

```
ANTHROPIC_API_KEY=your_api_key_here
OWNER_HANDLE=your-handle.bsky.social
NEXT_PUBLIC_OWNER_HANDLE=your-handle.bsky.social
```

```bash
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) (use `127.0.0.1`, not `localhost` -- the Bluesky OAuth redirect requires it).

## Platforms

### Bluesky

Uses AT Protocol OAuth via `@atproto/oauth-client-browser`. In development, the [CIMD service](https://cimd-service.fly.dev/) hosts client metadata since localhost can't serve it publicly. In production, the app serves its own metadata at `/api/client-metadata`.

### Twitter

Uses OAuth 1.0a. Requires `TWITTER_CONSUMER_KEY` and `TWITTER_SECRET_KEY` from a Twitter developer app.

### Mastodon

Uses OAuth 2.0 with dynamic per-instance app registration. Users enter their full handle (`@user@instance`) and the app registers itself with that instance's API automatically. No pre-registration needed.

## Tech stack

- [Next.js](https://nextjs.org/) 16
- [AT Protocol](https://atproto.com/) OAuth via `@atproto/oauth-client-browser`
- [Claude API](https://docs.anthropic.com/) via `@anthropic-ai/sdk`
- Plain CSS (design borrowed from [seldo.com](https://seldo.com))

## License

MIT
