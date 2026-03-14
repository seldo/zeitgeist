import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const origin = request.cookies.get('mastodon_oauth_origin')?.value || request.nextUrl.origin

  if (error) {
    return NextResponse.redirect(`${origin}/?mastodon_error=${encodeURIComponent(error)}`)
  }

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
  }

  const storedState = request.cookies.get('mastodon_oauth_state')?.value
  if (state !== storedState) {
    return NextResponse.json({ error: 'State mismatch' }, { status: 400 })
  }

  const codeVerifier = request.cookies.get('mastodon_code_verifier')?.value
  const instance = request.cookies.get('mastodon_oauth_instance')?.value
  const clientId = request.cookies.get('mastodon_oauth_client_id')?.value
  const clientSecret = request.cookies.get('mastodon_oauth_client_secret')?.value

  if (!codeVerifier || !instance || !clientId || !clientSecret) {
    return NextResponse.json({ error: 'Missing OAuth cookies' }, { status: 400 })
  }

  const redirectUri = `${origin}/api/mastodon/callback`

  const tokenRes = await fetch(`https://${instance}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: codeVerifier,
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    console.error('Mastodon token exchange failed:', err)
    return NextResponse.redirect(`${origin}/?mastodon_error=${encodeURIComponent('Token exchange failed')}`)
  }

  const tokenData = await tokenRes.json()

  const response = NextResponse.redirect(`${origin}/?mastodon_auth=success`)

  const secureCookie = process.env.NODE_ENV === 'production'

  response.cookies.set('mastodon_access_token', tokenData.access_token, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'lax',
    maxAge: 7200,
    path: '/',
  })

  response.cookies.set('mastodon_instance', instance, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'lax',
    maxAge: 7200,
    path: '/',
  })

  // Client-readable cookie so the frontend can detect Mastodon auth
  response.cookies.set('mastodon_authed', '1', {
    httpOnly: false,
    secure: secureCookie,
    sameSite: 'lax',
    maxAge: 7200,
    path: '/',
  })

  // Clean up OAuth flow cookies
  response.cookies.delete('mastodon_code_verifier')
  response.cookies.delete('mastodon_oauth_state')
  response.cookies.delete('mastodon_oauth_origin')
  response.cookies.delete('mastodon_oauth_instance')
  response.cookies.delete('mastodon_oauth_client_id')
  response.cookies.delete('mastodon_oauth_client_secret')

  return response
}
