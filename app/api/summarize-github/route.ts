import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const githubToken = request.cookies.get('github_token')?.value

  if (!githubToken) {
    return Response.json({ error: 'Not signed in with GitHub' }, { status: 401 })
  }

  const { posts, handle, source } = await request.json() as {
    posts: { text: string; url: string }[]
    handle: string
    source?: 'bluesky' | 'twitter'
  }

  const feedSource = source || 'bluesky'

  if (!Array.isArray(posts) || posts.length === 0) {
    return Response.json({ error: 'No posts provided' }, { status: 400 })
  }

  // Copilot has a 64k token context limit. Reserve ~4k tokens for the prompt
  // template and response, leaving ~60k tokens for posts (~4 chars per token).
  const maxChars = 56000 * 3
  const allFormatted = posts
    .slice(0, 2000)
    .map((p, i) => `[${i + 1}] ${p.text} (${p.url})`)
  let postsText = ''
  for (const entry of allFormatted) {
    if (postsText.length + entry.length + 2 > maxChars) break
    postsText += (postsText ? '\n\n' : '') + entry
  }
  const includedCount = postsText.split('\n\n').length

  const prompt = `Below are ${includedCount} posts from my ${feedSource === 'twitter' ? 'Twitter/X' : 'Bluesky'} social feed over the last 24 hours. Each post includes its URL in parentheses. Please summarize what people are talking about.

Organize your response by theme or topic. For each theme, give it a short bold heading, then 2–4 sentences describing what's being discussed and any notable perspectives or debates. Within your summary text, link a few key words or phrases to a representative post URL using markdown links — for example, "[some topic](${feedSource === 'twitter' ? 'https://x.com/...' : 'https://bsky.app/..'})". Pick just one representative post per topic. Do not use footnotes or reference numbers. End with a brief 1–2 sentence "overall vibe" of the feed.

Posts:
${postsText}`

  try {
    const res = await fetch('https://api.githubcopilot.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${githubToken}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return Response.json(
        { error: `Copilot API error: ${res.status} — ${err}` },
        { status: res.status }
      )
    }

    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        const decoder = new TextDecoder()
        const reader = res.body!.getReader()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              const content = parsed.choices?.[0]?.delta?.content
              if (content) {
                controller.enqueue(encoder.encode(content))
              }
            } catch {
              // skip malformed chunks
            }
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
