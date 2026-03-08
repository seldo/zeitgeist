import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function GET(request: NextRequest) {
  const clientId = process.env.TWITTER_CONSUMER_KEY
  if (!clientId) {
    return NextResponse.json({ error: 'Twitter not configured' }, { status: 500 })
  }

  // Use the origin query param from the client (since Next.js may resolve
  // request.nextUrl.origin to "localhost" even when accessed via 127.0.0.1)
  const origin = request.nextUrl.searchParams.get('origin') || request.nextUrl.origin
  const redirectUri = `${origin}/api/twitter/callback`

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
    scope: 'tweet.read users.read offline.access',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  const authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`

  const response = NextResponse.redirect(authUrl)

  // Store verifier and state in cookies for the callback
  response.cookies.set('twitter_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })
  response.cookies.set('twitter_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  response.cookies.set('twitter_oauth_origin', origin, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return response
}
