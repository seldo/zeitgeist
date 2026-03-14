import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('twitter_access_token')?.value
  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated with Twitter' }, { status: 401 })
  }

  try {
    const meRes = await fetch('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!meRes.ok) {
      return NextResponse.json({ error: 'Failed to get user info' }, { status: meRes.status })
    }

    const meData = await meRes.json()
    const userId = meData.data.id
    const username = meData.data.username

    const posts: { text: string; url: string }[] = []
    let paginationToken: string | undefined

    while (posts.length < 100) {
      const params = new URLSearchParams({
        max_results: '100',
        'tweet.fields': 'created_at',
        exclude: 'retweets,replies',
      })
      if (paginationToken) {
        params.set('pagination_token', paginationToken)
      }

      const tweetsRes = await fetch(
        `https://api.twitter.com/2/users/${userId}/tweets?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      if (!tweetsRes.ok) {
        if (posts.length > 0) break
        return NextResponse.json({ error: 'Failed to fetch user tweets' }, { status: tweetsRes.status })
      }

      const data = await tweetsRes.json()
      if (!data.data || data.data.length === 0) break

      for (const tweet of data.data) {
        posts.push({
          text: tweet.text,
          url: `https://x.com/${username}/status/${tweet.id}`,
        })
        if (posts.length >= 100) break
      }

      paginationToken = data.meta?.next_token
      if (!paginationToken) break
    }

    return NextResponse.json({ posts, username })
  } catch (err) {
    console.error('Twitter user posts error:', err)
    return NextResponse.json({ error: 'Failed to fetch user posts' }, { status: 500 })
  }
}
