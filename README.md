# Zeitgeist

A Bluesky feed summarizer powered by Claude. Sign in with your Bluesky account and an Anthropic API key, and Zeitgeist fetches the last 24 hours of your timeline and uses Claude to produce a themed summary of what people are talking about.

Live at [zeitgeist.blue](https://zeitgeist.blue).

## How it works

1. You sign in via Bluesky OAuth (no passwords stored)
2. Zeitgeist fetches up to 2,000 posts from your timeline over the last 24 hours
3. The posts are sent to Claude (Sonnet), which organizes them by theme and summarizes the conversations, with inline links to representative posts
4. The summary streams in live and is cached locally so you can revisit it without re-fetching

## BYOK (Bring Your Own Key)

The site owner's Bluesky handle is configured via environment variables. When the owner signs in, the server-side Anthropic API key is used. Everyone else needs to provide their own Anthropic API key, which is used directly and never stored on the server.

## Setup

```bash
git clone https://github.com/seldo/zeitgeist.git
cd zeitgeist
npm install
cp .env.local.example .env.local
```

Edit `.env.local`:

```
ANTHROPIC_API_KEY=your_api_key_here
OWNER_HANDLE=your-handle.bsky.social
NEXT_PUBLIC_OWNER_HANDLE=your-handle.bsky.social
```

```bash
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) (use `127.0.0.1`, not `localhost` -- the OAuth redirect requires it).

## OAuth

Zeitgeist uses AT Protocol OAuth to authenticate with Bluesky. This avoids needing app passwords and only requests the permissions needed to read your timeline.

- **Production**: The app serves its own OAuth client metadata at `/api/client-metadata`. The Bluesky auth server fetches this to verify the client. Works on any domain automatically.
- **Development**: Localhost can't serve publicly accessible metadata, so the app uses the [CIMD service](https://cimd-service.fly.dev/) to host it during development.

## Tech stack

- [Next.js](https://nextjs.org/) 16
- [AT Protocol](https://atproto.com/) OAuth via `@atproto/oauth-client-browser`
- [Claude API](https://docs.anthropic.com/) via `@anthropic-ai/sdk`
- Plain CSS (design borrowed from [seldo.com](https://seldo.com))

## License

MIT
