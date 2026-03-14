import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete('github_token')
  response.cookies.delete('github_username')
  return response
}
