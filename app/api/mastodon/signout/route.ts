import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete('mastodon_access_token')
  response.cookies.delete('mastodon_instance')
  response.cookies.delete('mastodon_authed')
  return response
}
