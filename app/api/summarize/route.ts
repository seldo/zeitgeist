import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

const OWNER_HANDLE = process.env.OWNER_HANDLE ?? 'seldo.com'

export async function POST(request: NextRequest) {
  const { posts, handle, apiKey } = await request.json() as {
    posts: string[]
    handle: string
    apiKey?: string
  }

  if (!Array.isArray(posts) || posts.length === 0) {
    return Response.json({ error: 'No posts provided' }, { status: 400 })
  }

  const isOwner = handle?.replace(/^@/, '') === OWNER_HANDLE
  const keyToUse = isOwner ? process.env.ANTHROPIC_API_KEY : apiKey

  if (!keyToUse) {
    return Response.json(
      { error: isOwner ? 'Server API key not configured.' : 'An Anthropic API key is required.' },
      { status: 400 }
    )
  }

  const client = new Anthropic({ apiKey: keyToUse })

  const postsText = posts
    .slice(0, 2000)
    .map((p, i) => `[${i + 1}] ${p}`)
    .join('\n\n')

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Below are ${posts.length} posts from my Bluesky social feed over the last 24 hours. Please summarize what people are talking about.

Organize your response by theme or topic. For each theme, give it a short bold heading, then 2–4 sentences describing what's being discussed and any notable perspectives or debates. End with a brief 1–2 sentence "overall vibe" of the feed.

Posts:
${postsText}`,
      },
    ],
  })

  const summary =
    message.content[0].type === 'text' ? message.content[0].text : ''

  return Response.json({ summary })
}
