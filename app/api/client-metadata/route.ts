import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const origin = request.headers.get('x-forwarded-proto') && request.headers.get('host')
    ? `${request.headers.get('x-forwarded-proto')}://${request.headers.get('host')}`
    : request.nextUrl.origin

  const clientId = `${origin}/api/client-metadata`

  return Response.json({
    client_id: clientId,
    client_name: 'Zeitgeist',
    client_uri: origin,
    redirect_uris: [`${origin}/`],
    scope: 'atproto transition:generic',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    dpop_bound_access_tokens: true,
  })
}
