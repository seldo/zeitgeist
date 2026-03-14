import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

const BLUESKY_OWNER_HANDLE = process.env.OWNER_HANDLE ?? 'seldo.com'
const TWITTER_OWNER_HANDLE = process.env.TWITTER_OWNER_HANDLE ?? ''

export async function POST(request: NextRequest) {
  const { userPosts, feedPosts, handle, apiKey, source } = await request.json() as {
    userPosts: { text: string; url: string }[]
    feedPosts: { text: string; url: string }[]
    handle: string
    apiKey?: string
    source?: 'bluesky' | 'twitter'
  }

  const feedSource = source || 'bluesky'

  if (!Array.isArray(userPosts) || !Array.isArray(feedPosts) || feedPosts.length === 0) {
    return Response.json({ error: 'Missing posts data' }, { status: 400 })
  }

  const ownerHandle = feedSource === 'twitter' ? TWITTER_OWNER_HANDLE : BLUESKY_OWNER_HANDLE
  const isOwner = ownerHandle !== '' && handle?.replace(/^@/, '') === ownerHandle
  const keyToUse = isOwner ? process.env.ANTHROPIC_API_KEY : apiKey

  if (!keyToUse) {
    return Response.json(
      { error: isOwner ? 'Server API key not configured.' : 'An Anthropic API key is required.' },
      { status: 400 }
    )
  }

  const client = new Anthropic({ apiKey: keyToUse })

  const userPostsText = userPosts
    .slice(0, 100)
    .map((p, i) => `[${i + 1}] ${p.text}`)
    .join('\n\n')

  const feedPostsText = feedPosts
    .slice(0, 2000)
    .map((p, i) => `[${i + 1}] ${p.text} (${p.url})`)
    .join('\n\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `I'm going to give you two sets of posts. The first set is the user's own recent ${feedSource === 'twitter' ? 'Twitter/X' : 'Bluesky'} posts — these represent topics they've been thinking about, their interests, and their perspectives. The second set is posts from the user's feed over the last 24 hours.

Based on what the user has been posting about, pick exactly 10 posts from their feed that they would most likely want to interact with — posts that are relevant to their interests, that they might want to reply to, like, or repost. Prefer posts that are conversation starters or that intersect with the user's demonstrated interests.

Return ONLY a JSON array of exactly 10 objects, each with "url" (the post URL) and "reason" (a brief 1-sentence explanation of why this post is relevant to them). No other text, just the JSON array.

USER'S RECENT POSTS:
${userPostsText}

FEED POSTS FROM LAST 24 HOURS:
${feedPostsText}`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  // Parse the JSON array from the response
  try {
    // Extract JSON from the response (handle potential markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return Response.json({ error: 'Failed to parse recommendations' }, { status: 500 })
    }
    const recommendations = JSON.parse(jsonMatch[0]) as { url: string; reason: string }[]
    return Response.json({ recommendations })
  } catch {
    return Response.json({ error: 'Failed to parse recommendations' }, { status: 500 })
  }
}
