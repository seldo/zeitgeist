import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('twitter_access_token')?.value
  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated with Twitter' }, { status: 401 })
  }

  try {
    // First get the authenticated user's ID
    const meRes = await fetch('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!meRes.ok) {
      const err = await meRes.text()
      console.error('Twitter /users/me failed:', err)
      return NextResponse.json({ error: 'Failed to get user info' }, { status: meRes.status })
    }

    const meData = await meRes.json()
    const userId = meData.data.id
    const username = meData.data.username

    // Fetch reverse-chronological home timeline
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const posts: { text: string; url: string }[] = []
    let paginationToken: string | undefined

    while (posts.length < 2000) {
      const params = new URLSearchParams({
        max_results: '100',
        'tweet.fields': 'created_at,author_id',
        expansions: 'author_id',
        'user.fields': 'username',
        start_time: cutoff,
      })
      if (paginationToken) {
        params.set('pagination_token', paginationToken)
      }

      const timelineRes = await fetch(
        `https://api.twitter.com/2/users/${userId}/timelines/reverse_chronological?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      if (!timelineRes.ok) {
        const err = await timelineRes.text()
        console.error('Twitter timeline failed:', err)
        // If we already have some posts, return what we have
        if (posts.length > 0) break
        return NextResponse.json({ error: 'Failed to fetch timeline' }, { status: timelineRes.status })
      }

      const data = await timelineRes.json()

      if (!data.data || data.data.length === 0) break

      // Build a map of user IDs to usernames from the includes
      const userMap: Record<string, string> = {}
      if (data.includes?.users) {
        for (const user of data.includes.users) {
          userMap[user.id] = user.username
        }
      }

      for (const tweet of data.data) {
        const authorUsername = userMap[tweet.author_id] || 'unknown'
        const url = `https://x.com/${authorUsername}/status/${tweet.id}`
        posts.push({ text: tweet.text, url })
      }

      paginationToken = data.meta?.next_token
      if (!paginationToken) break
    }

    return NextResponse.json({ posts, username })
  } catch (err) {
    console.error('Twitter timeline error:', err)
    return NextResponse.json({ error: 'Failed to fetch timeline' }, { status: 500 })
  }
}
