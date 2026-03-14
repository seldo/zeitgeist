import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.searchParams.get('origin') || request.nextUrl.origin
  const instanceParam = request.nextUrl.searchParams.get('instance')

  if (!instanceParam) {
    return NextResponse.json({ error: 'Missing instance parameter' }, { status: 400 })
  }

  // Normalize instance: strip protocol, trailing slashes
  const instance = instanceParam
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')

  const redirectUri = `${origin}/api/mastodon/callback`
  const scopes = 'read:statuses read:accounts'

  // Register OAuth app on the instance
  const appRes = await fetch(`https://${instance}/api/v1/apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Zeitgeist',
      redirect_uris: redirectUri,
      scopes,
      website: origin,
    }),
  })

  if (!appRes.ok) {
    const err = await appRes.text()
    console.error('Mastodon app registration failed:', err)
    return NextResponse.redirect(
      `${origin}/?mastodon_error=${encodeURIComponent('Failed to register with instance. Is this a valid Mastodon server?')}`
    )
  }

  const appData = await appRes.json()
  const clientId = appData.client_id
  const clientSecret = appData.client_secret

  // Generate PKCE code verifier and challenge
  const codeVerifier = crypto.randomBytes(32).toString('base64url')
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')

  const state = crypto.randomBytes(16).toString('hex')

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  const authUrl = `https://${instance}/oauth/authorize?${params.toString()}`
  const response = NextResponse.redirect(authUrl)

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 600, // 10 minutes
    path: '/',
  }

  response.cookies.set('mastodon_code_verifier', codeVerifier, cookieOptions)
  response.cookies.set('mastodon_oauth_state', state, cookieOptions)
  response.cookies.set('mastodon_oauth_origin', origin, cookieOptions)
  response.cookies.set('mastodon_oauth_instance', instance, cookieOptions)
  response.cookies.set('mastodon_oauth_client_id', clientId, cookieOptions)
  response.cookies.set('mastodon_oauth_client_secret', clientSecret, cookieOptions)

  return response
}
