import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

const OWNER_HANDLE = process.env.OWNER_HANDLE ?? 'seldo.com'

export async function POST(request: NextRequest) {
  const { posts, handle, apiKey } = await request.json() as {
    posts: { text: string; url: string }[]
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
    .map((p, i) => `[${i + 1}] ${p.text} (${p.url})`)
    .join('\n\n')

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Below are ${posts.length} posts from my Bluesky social feed over the last 24 hours. Each post includes its URL in parentheses. Please summarize what people are talking about.

Organize your response by theme or topic. For each theme, give it a short bold heading, then 2–4 sentences describing what's being discussed and any notable perspectives or debates. Within your summary text, link a few key words or phrases to a representative post URL using markdown links — for example, "[some topic](https://bsky.app/...)". Pick just one representative post per topic. Do not use footnotes or reference numbers. End with a brief 1–2 sentence "overall vibe" of the feed.

Posts:
${postsText}`,
      },
    ],
  })

  const readableStream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          controller.enqueue(encoder.encode(event.delta.text))
        }
      }
      controller.close()
    },
  })

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  })
}
