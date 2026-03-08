import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // Use the stored origin from the auth step (to match the redirect_uri exactly)
  const origin = request.cookies.get('twitter_oauth_origin')?.value || request.nextUrl.origin

  if (error) {
    return NextResponse.redirect(`${origin}/?twitter_error=${encodeURIComponent(error)}`)
  }

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
  }

  // Verify state
  const storedState = request.cookies.get('twitter_oauth_state')?.value
  if (state !== storedState) {
    return NextResponse.json({ error: 'State mismatch' }, { status: 400 })
  }

  const codeVerifier = request.cookies.get('twitter_code_verifier')?.value
  if (!codeVerifier) {
    return NextResponse.json({ error: 'Missing code verifier' }, { status: 400 })
  }

  const clientId = process.env.TWITTER_CONSUMER_KEY!
  const clientSecret = process.env.TWITTER_SECRET_KEY!
  const redirectUri = `${origin}/api/twitter/callback`

  // Exchange code for access token
  const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    console.error('Twitter token exchange failed:', err)
    return NextResponse.redirect(`${origin}/?twitter_error=${encodeURIComponent('Token exchange failed')}`)
  }

  const tokenData = await tokenRes.json()

  // Store access token in an httpOnly cookie
  const response = NextResponse.redirect(`${origin}/?twitter_auth=success`)

  response.cookies.set('twitter_access_token', tokenData.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: tokenData.expires_in || 7200,
    path: '/',
  })

  if (tokenData.refresh_token) {
    response.cookies.set('twitter_refresh_token', tokenData.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    })
  }

  // Clean up OAuth cookies
  response.cookies.delete('twitter_code_verifier')
  response.cookies.delete('twitter_oauth_state')
  response.cookies.delete('twitter_oauth_origin')

  return response
}
