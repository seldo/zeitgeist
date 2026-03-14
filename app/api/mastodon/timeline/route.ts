import { NextRequest, NextResponse } from 'next/server'

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p><p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('mastodon_access_token')?.value
  const instance = request.cookies.get('mastodon_instance')?.value

  if (!accessToken || !instance) {
    return NextResponse.json({ error: 'Not authenticated with Mastodon' }, { status: 401 })
  }

  try {
    // Get the authenticated user's info
    const meRes = await fetch(`https://${instance}/api/v1/accounts/verify_credentials`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!meRes.ok) {
      const err = await meRes.text()
      console.error('Mastodon verify_credentials failed:', err)
      return NextResponse.json({ error: 'Failed to get user info' }, { status: meRes.status })
    }

    const meData = await meRes.json()
    const username = meData.acct || meData.username

    // Fetch home timeline
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    const posts: { text: string; url: string }[] = []
    let maxId: string | undefined

    while (posts.length < 2000) {
      const params = new URLSearchParams({ limit: '40' })
      if (maxId) params.set('max_id', maxId)

      const timelineRes = await fetch(
        `https://${instance}/api/v1/timelines/home?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      if (!timelineRes.ok) {
        if (posts.length > 0) break
        const err = await timelineRes.text()
        console.error('Mastodon timeline failed:', err)
        return NextResponse.json({ error: 'Failed to fetch timeline' }, { status: timelineRes.status })
      }

      const statuses = await timelineRes.json()
      if (!statuses || statuses.length === 0) break

      let hitOldPost = false
      for (const status of statuses) {
        const ts = new Date(status.created_at).getTime()
        if (ts < cutoff) {
          hitOldPost = true
          break
        }
        const text = stripHtml(status.content)
        if (text) {
          posts.push({ text, url: status.url })
        }
      }

      if (hitOldPost) break
      maxId = statuses[statuses.length - 1].id
    }

    return NextResponse.json({ posts, username })
  } catch (err) {
    console.error('Mastodon timeline error:', err)
    return NextResponse.json({ error: 'Failed to fetch timeline' }, { status: 500 })
  }
}
