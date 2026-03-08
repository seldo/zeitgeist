import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin
  const response = NextResponse.json({ ok: true })
  response.cookies.delete('twitter_access_token')
  response.cookies.delete('twitter_refresh_token')
  return response
}
