import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) {
    return Response.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  const isTwitter = url.includes('x.com/') || url.includes('twitter.com/')
  const oembedEndpoint = isTwitter
    ? `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`
    : `https://embed.bsky.app/oembed?url=${encodeURIComponent(url)}&format=json`

  const res = await fetch(oembedEndpoint)

  if (!res.ok) {
    return Response.json({ error: 'Failed to fetch embed' }, { status: res.status })
  }

  const data = await res.json()
  return Response.json(data)
}
