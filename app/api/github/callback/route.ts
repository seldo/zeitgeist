import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const storedState = request.cookies.get('github_oauth_state')?.value
  const origin = request.cookies.get('github_oauth_origin')?.value || request.nextUrl.origin

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(`${origin}/?github_error=invalid_state`)
  }

  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/?github_error=not_configured`)
  }

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    })

    const tokenData = await tokenRes.json()

    if (tokenData.error) {
      return NextResponse.redirect(`${origin}/?github_error=${tokenData.error}`)
    }

    const accessToken = tokenData.access_token

    // Fetch GitHub username
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const userData = await userRes.json()

    const response = NextResponse.redirect(`${origin}/?github_auth=success`)

    response.cookies.set('github_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60, // 8 hours
      path: '/',
    })
    response.cookies.set('github_username', userData.login || '', {
      httpOnly: false, // readable by client
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60,
      path: '/',
    })

    // Clean up OAuth cookies
    response.cookies.delete('github_oauth_state')
    response.cookies.delete('github_oauth_origin')

    return response
  } catch {
    return NextResponse.redirect(`${origin}/?github_error=token_exchange_failed`)
  }
}
