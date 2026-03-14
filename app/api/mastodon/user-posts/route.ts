import { NextRequest, NextResponse } from 'next/server'
import { stripHtml } from '@/lib/html'

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('mastodon_access_token')?.value
  const instance = request.cookies.get('mastodon_instance')?.value

  if (!accessToken || !instance) {
    return NextResponse.json({ error: 'Not authenticated with Mastodon' }, { status: 401 })
  }

  try {
    const meRes = await fetch(`https://${instance}/api/v1/accounts/verify_credentials`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!meRes.ok) {
      return NextResponse.json({ error: 'Failed to get user info' }, { status: meRes.status })
    }

    const meData = await meRes.json()
    const accountId = meData.id
    const username = `${meData.username}@${instance}`

    const posts: { text: string; url: string }[] = []
    let maxId: string | undefined

    while (posts.length < 100) {
      const params = new URLSearchParams({
        limit: '40',
        exclude_replies: 'true',
        exclude_reblogs: 'true',
      })
      if (maxId) params.set('max_id', maxId)

      const statusesRes = await fetch(
        `https://${instance}/api/v1/accounts/${accountId}/statuses?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      if (!statusesRes.ok) {
        if (posts.length > 0) break
        return NextResponse.json({ error: 'Failed to fetch user posts' }, { status: statusesRes.status })
      }

      const statuses = await statusesRes.json()
      if (!statuses || statuses.length === 0) break

      for (const status of statuses) {
        const text = stripHtml(status.content)
        if (text) {
          posts.push({ text, url: status.url })
        }
        if (posts.length >= 100) break
      }

      maxId = statuses[statuses.length - 1].id
    }

    return NextResponse.json({ posts, username })
  } catch (err) {
    console.error('Mastodon user posts error:', err)
    return NextResponse.json({ error: 'Failed to fetch user posts' }, { status: 500 })
  }
}
