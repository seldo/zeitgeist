'use client'

import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'

type AppState =
  | { status: 'initializing' }
  | { status: 'login' }
  | { status: 'loading'; message: string }
  | { status: 'done'; summary: string; postCount: number; handle: string }
  | { status: 'error'; message: string }

export default function Home() {
  const [state, setState] = useState<AppState>({ status: 'initializing' })
  const [handle, setHandle] = useState('')
  const [apiKey, setApiKey] = useState('')
  const clientRef = useRef<import('@atproto/oauth-client-browser').BrowserOAuthClient | null>(null)
  const agentRef = useRef<import('@atproto/api').Agent | null>(null)

  const ownerHandle = process.env.NEXT_PUBLIC_OWNER_HANDLE ?? 'seldo.com'
  const isOwner = handle.trim().replace(/^@/, '') === ownerHandle

  useEffect(() => {
    initOAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function initOAuth() {
    try {
      const { BrowserOAuthClient } = await import('@atproto/oauth-client-browser')

      const origin = window.location.origin
      const redirectUri = `${origin}/`
      const isLocalhost = window.location.hostname === 'localhost'
        || window.location.hostname === '127.0.0.1'

      let clientId: string

      if (isLocalhost) {
        // In dev, use CIMD service to get a publicly accessible client_id
        // (loopback clients can't request transition:generic scope)
        const cimdRes = await fetch('https://cimd-service.fly.dev/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: 'Zeitgeist',
            client_uri: origin,
            redirect_uris: [redirectUri],
            scope: 'atproto transition:generic',
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
            application_type: 'web',
            dpop_bound_access_tokens: true,
          }),
        })
        if (!cimdRes.ok) throw new Error('Failed to register OAuth client with CIMD service')
        const cimdData = await cimdRes.json()
        clientId = cimdData.client_id
      } else {
        // In production, self-hosted client metadata at /api/client-metadata
        clientId = `${origin}/api/client-metadata`
      }

      const client = new BrowserOAuthClient({
        clientMetadata: {
          client_id: clientId,
          client_name: 'Zeitgeist',
          client_uri: origin,
          redirect_uris: [redirectUri],
          scope: 'atproto transition:generic',
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
          application_type: 'web',
          dpop_bound_access_tokens: true,
        },
        handleResolver: 'https://bsky.social',
      })

      clientRef.current = client

      // init() handles both session restore and OAuth callback processing
      const result = await client.init()

      if (result?.session) {
        const { Agent } = await import('@atproto/api')
        const agent = new Agent(result.session)
        agentRef.current = agent

        // Get handle from the authenticated session
        const profile = await agent.getProfile({ actor: result.session.did })
        const resolvedHandle = profile.data.handle

        // Restore API key from sessionStorage (stored before OAuth redirect)
        const storedKey = sessionStorage.getItem('zeitgeist_api_key')
        const isOwnerSession = resolvedHandle === ownerHandle

        if (!isOwnerSession && !storedKey) {
          // Non-owner without API key — show form to enter it
          setState({ status: 'login' })
          setHandle(resolvedHandle)
          return
        }

        await fetchAndSummarize(agent, resolvedHandle, storedKey || undefined)
      } else {
        setState({ status: 'login' })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setState({ status: 'error', message: msg })
    }
  }

  async function fetchAndSummarize(
    agent: import('@atproto/api').Agent,
    userHandle: string,
    key?: string
  ) {
    try {
      setState({ status: 'loading', message: 'Fetching your feed...' })
      const posts = await fetchLast24Hours(agent)

      if (posts.length === 0) {
        setState({ status: 'error', message: 'No posts found in the last 24 hours.' })
        return
      }

      setState({ status: 'loading', message: `Summarizing ${posts.length} posts...` })

      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posts, handle: userHandle, apiKey: key }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error ?? 'Summarization failed')
      }

      const { summary } = await res.json()
      setState({ status: 'done', summary, postCount: posts.length, handle: userHandle })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setState({ status: 'error', message: msg })
    }
  }

  async function signIn() {
    const trimmedHandle = handle.trim().replace(/^@/, '')
    if (!trimmedHandle) return

    // If we already have an OAuth session (handle was pre-filled after callback),
    // we just need the API key — proceed directly
    if (agentRef.current) {
      if (!isOwner && !apiKey.trim()) return
      if (apiKey.trim()) {
        sessionStorage.setItem('zeitgeist_api_key', apiKey.trim())
      }
      await fetchAndSummarize(agentRef.current, trimmedHandle, apiKey.trim() || undefined)
      return
    }

    // No session yet — start OAuth flow
    if (!isOwner && !apiKey.trim()) return

    // Store API key before redirect so we can retrieve it after
    if (apiKey.trim()) {
      sessionStorage.setItem('zeitgeist_api_key', apiKey.trim())
    }

    try {
      setState({ status: 'loading', message: 'Redirecting to Bluesky...' })
      await clientRef.current!.signIn(trimmedHandle, {
        scope: 'atproto transition:generic',
      })
      // Browser will redirect — nothing runs after this
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setState({ status: 'error', message: msg })
    }
  }

  async function refresh() {
    if (!agentRef.current || state.status !== 'done') return
    const storedKey = sessionStorage.getItem('zeitgeist_api_key')
    await fetchAndSummarize(agentRef.current, state.handle, storedKey || undefined)
  }

  function signOut() {
    sessionStorage.removeItem('zeitgeist_api_key')
    agentRef.current = null
    clientRef.current = null
    setState({ status: 'login' })
    setHandle('')
    setApiKey('')
  }

  return (
    <main className="page">
      <div className="inner">
        <h1 className="siteTitle">Zeitgeist</h1>
        <p className="siteSubtitle">24-hour Bluesky feed summary, powered by Claude</p>

        {state.status === 'initializing' && (
          <div className="loadingWrap">
            <div className="spinner" />
            <p className="loadingMsg">Connecting...</p>
          </div>
        )}

        {state.status === 'login' && (
          <div className="card">
            <h2 className="cardTitle">Sign in with Bluesky</h2>
            <div className="formGroup">
              <label className="label" htmlFor="handle">Handle</label>
              <input
                id="handle"
                className="input"
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && signIn()}
                placeholder="you.bsky.social or your-domain.com"
                disabled={!!agentRef.current}
              />
            </div>
            {!isOwner && (
              <div className="formGroup">
                <label className="label" htmlFor="apiKey">
                  Anthropic API key
                </label>
                <input
                  id="apiKey"
                  className="input"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && signIn()}
                  placeholder="sk-ant-..."
                />
                <p className="hint" style={{ marginTop: '0.5rem' }}>
                  Get your API key from {' '}
                  <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener noreferrer">
                    Anthropic's console
                  </a>
                  . You&apos;ll need an Anthropic account with API credits.
                </p>
              </div>
            )}
            <button
              className="btn"
              onClick={signIn}
              disabled={!handle.trim() || (!isOwner && !apiKey.trim())}
            >
              {agentRef.current ? 'Summarize my feed' : 'Sign in with Bluesky'}
            </button>
            <p className="hint">
              You&apos;ll be redirected to Bluesky to authorize access to your feed.
            </p>
          </div>
        )}

        {state.status === 'loading' && (
          <div className="loadingWrap">
            <div className="spinner" />
            <p className="loadingMsg">{state.message}</p>
          </div>
        )}

        {state.status === 'done' && (
          <>
            <div className="resultsMeta">
              <span className="postCount">{state.postCount} posts · last 24 hours</span>
              <button className="textBtn" onClick={signOut}>Sign out</button>
            </div>
            <div className="summaryCard">
              <h2 className="summaryTitle">What&apos;s happening on your feed</h2>
              <div className="prose">
                <ReactMarkdown>{state.summary}</ReactMarkdown>
              </div>
            </div>
            <button className="refreshBtn" onClick={refresh}>Refresh summary</button>
          </>
        )}

        {state.status === 'error' && (
          <div className="errorCard">
            <p className="errorMsg">{state.message}</p>
            <button className="textBtn" onClick={signOut}>Try again</button>
          </div>
        )}
      </div>
    </main>
  )
}

async function fetchLast24Hours(agent: import('@atproto/api').Agent): Promise<string[]> {
  const cutoffMs = Date.now() - 24 * 60 * 60 * 1000
  const posts: string[] = []
  let cursor: string | undefined

  while (true) {
    const res = await agent.getTimeline({ limit: 100, cursor })
    const feed = res.data.feed

    let hitOldPost = false

    for (const item of feed) {
      const reasonIndexedAt = (item.reason as { indexedAt?: string } | undefined)?.indexedAt
      const ts = new Date(reasonIndexedAt ?? item.post.indexedAt).getTime()
      if (ts < cutoffMs) {
        hitOldPost = true
        break
      }
      const record = item.post.record as { text?: string }
      if (record.text?.trim()) {
        posts.push(record.text.trim())
      }
    }

    if (hitOldPost || !res.data.cursor || posts.length >= 2000) break
    cursor = res.data.cursor
  }

  return posts
}
