'use client'

import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'

type Platform = 'bluesky' | 'twitter'

type AppState =
  | { status: 'initializing' }
  | { status: 'login' }
  | { status: 'loading'; message: string }
  | { status: 'streaming'; summary: string; postCount: number; handle: string; platform: Platform }
  | { status: 'done'; summary: string; postCount: number; handle: string; platform: Platform }
  | { status: 'error'; message: string }

export default function Home() {
  const [state, setState] = useState<AppState>({ status: 'initializing' })
  const [handle, setHandle] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [platform, setPlatform] = useState<Platform>('bluesky')
  const clientRef = useRef<import('@atproto/oauth-client-browser').BrowserOAuthClient | null>(null)
  const agentRef = useRef<import('@atproto/api').Agent | null>(null)

  const ownerHandle = process.env.NEXT_PUBLIC_OWNER_HANDLE ?? 'seldo.com'
  const isOwner = handle.trim().replace(/^@/, '') === ownerHandle

  useEffect(() => {
    // Check for Twitter OAuth callback
    const params = new URLSearchParams(window.location.search)
    if (params.get('twitter_auth') === 'success') {
      // Clean up URL
      window.history.replaceState({}, '', '/')
      setPlatform('twitter')
      handleTwitterSession()
      return
    }
    if (params.get('twitter_error')) {
      const error = params.get('twitter_error')!
      window.history.replaceState({}, '', '/')
      setState({ status: 'error', message: `Twitter auth failed: ${error}` })
      return
    }

    initOAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleTwitterSession() {
    try {
      setState({ status: 'loading', message: 'Fetching your Twitter feed...' })

      const storedKey = localStorage.getItem('zeitgeist_api_key')
      const timelineRes = await fetch('/api/twitter/timeline')

      if (!timelineRes.ok) {
        const err = await timelineRes.json().catch(() => ({ error: 'Failed to fetch timeline' }))
        throw new Error(err.error)
      }

      const { posts, username } = await timelineRes.json()

      if (!posts || posts.length === 0) {
        setState({ status: 'error', message: 'No tweets found in the last 24 hours.' })
        return
      }

      setState({ status: 'loading', message: `Summarizing ${posts.length} tweets...` })

      // For Twitter, the "owner" check uses the owner handle without domain
      const twitterHandle = username
      const keyToUse = storedKey || undefined

      await streamSummary(posts, twitterHandle, 'twitter', keyToUse)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setState({ status: 'error', message: msg })
    }
  }

  async function initOAuth(skipSessionRestore = false) {
    try {
      const { BrowserOAuthClient } = await import('@atproto/oauth-client-browser')

      const origin = window.location.origin
      const redirectUri = `${origin}/`
      const isLocalhost = window.location.hostname === 'localhost'
        || window.location.hostname === '127.0.0.1'

      let clientId: string

      if (isLocalhost) {
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

      if (skipSessionRestore) {
        setState({ status: 'login' })
        return
      }

      const result = await client.init()

      if (result?.session) {
        const { Agent } = await import('@atproto/api')
        const agent = new Agent(result.session)
        agentRef.current = agent

        const profile = await agent.getProfile({ actor: result.session.did })
        const resolvedHandle = profile.data.handle

        const storedKey = localStorage.getItem('zeitgeist_api_key')
        const isOwnerSession = resolvedHandle === ownerHandle

        if (!isOwnerSession && !storedKey) {
          setState({ status: 'login' })
          setHandle(resolvedHandle)
          return
        }

        const cached = loadCachedSummary('bluesky')
        if (cached && cached.handle === resolvedHandle) {
          setState({ status: 'done', ...cached, platform: 'bluesky' })
        } else {
          await fetchAndSummarizeBluesky(agent, resolvedHandle, storedKey || undefined)
        }
      } else {
        const cached = loadCachedSummary('bluesky') || loadCachedSummary('twitter')
        if (cached) {
          const cachedPlatform = loadCachedSummary('bluesky') ? 'bluesky' : 'twitter'
          setState({ status: 'done', ...cached, platform: cachedPlatform })
        } else {
          setState({ status: 'login' })
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setState({ status: 'error', message: msg })
    }
  }

  async function streamSummary(
    posts: { text: string; url: string }[],
    userHandle: string,
    source: Platform,
    key?: string,
  ) {
    const res = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts, handle: userHandle, apiKey: key, source }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error ?? 'Summarization failed')
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let summary = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      summary += decoder.decode(value, { stream: true })
      setState({ status: 'streaming', summary, postCount: posts.length, handle: userHandle, platform: source })
    }

    saveCachedSummary(summary, posts.length, userHandle, source)
    setState({ status: 'done', summary, postCount: posts.length, handle: userHandle, platform: source })
  }

  async function fetchAndSummarizeBluesky(
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
      await streamSummary(posts, userHandle, 'bluesky', key)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setState({ status: 'error', message: msg })
    }
  }

  async function signInBluesky() {
    const trimmedHandle = handle.trim().replace(/^@/, '')
    if (!trimmedHandle) return

    if (agentRef.current) {
      if (!isOwner && !apiKey.trim()) return
      if (apiKey.trim()) {
        localStorage.setItem('zeitgeist_api_key', apiKey.trim())
      }
      await fetchAndSummarizeBluesky(agentRef.current, trimmedHandle, apiKey.trim() || undefined)
      return
    }

    if (!isOwner && !apiKey.trim()) return

    if (apiKey.trim()) {
      localStorage.setItem('zeitgeist_api_key', apiKey.trim())
    }

    try {
      setState({ status: 'loading', message: 'Redirecting to Bluesky...' })
      await clientRef.current!.signIn(trimmedHandle, {
        scope: 'atproto transition:generic',
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setState({ status: 'error', message: msg })
    }
  }

  async function signInTwitter() {
    if (apiKey.trim()) {
      localStorage.setItem('zeitgeist_api_key', apiKey.trim())
    }
    // Redirect to our server-side Twitter OAuth route, passing origin
    // so it uses 127.0.0.1 (not localhost) for the redirect URI
    window.location.href = `/api/twitter/auth?origin=${encodeURIComponent(window.location.origin)}`
  }

  async function refresh() {
    if (state.status !== 'done' && state.status !== 'streaming') return
    const storedKey = localStorage.getItem('zeitgeist_api_key')

    if (state.platform === 'twitter') {
      await handleTwitterSession()
    } else {
      if (!agentRef.current) return
      await fetchAndSummarizeBluesky(agentRef.current, state.handle, storedKey || undefined)
    }
  }

  async function signOut() {
    localStorage.removeItem('zeitgeist_api_key')
    agentRef.current = null
    clientRef.current = null
    // Clear Twitter cookies
    await fetch('/api/twitter/signout', { method: 'POST' }).catch(() => {})
    setState({ status: 'login' })
    setHandle('')
    setApiKey('')
    // Re-initialize OAuth client so Bluesky sign-in works without a page refresh
    // Skip session restore so it doesn't immediately sign back in
    initOAuth(true)
  }

  const activePlatform = (state.status === 'done' || state.status === 'streaming') ? state.platform : platform

  return (
    <main className="page">
      <div className="inner">
        <h1 className="siteTitle">Zeitgeist</h1>
        <p className="siteSubtitle">24-hour feed summary, powered by Claude</p>

        {state.status === 'initializing' && (
          <div className="loadingWrap">
            <div className="spinner" />
            <p className="loadingMsg">Connecting...</p>
          </div>
        )}

        {state.status === 'login' && (
          <div className="card">
            <div className="platformTabs">
              <button
                className={`platformTab ${platform === 'bluesky' ? 'platformTabActive' : ''}`}
                onClick={() => setPlatform('bluesky')}
              >
                Bluesky
              </button>
              <button
                className={`platformTab ${platform === 'twitter' ? 'platformTabActive' : ''}`}
                onClick={() => setPlatform('twitter')}
              >
                Twitter / X
              </button>
            </div>

            {platform === 'bluesky' && (
              <>
                <h2 className="cardTitle">Sign in with Bluesky</h2>
                <div className="formGroup">
                  <label className="label" htmlFor="handle">Handle</label>
                  <input
                    id="handle"
                    className="input"
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && signInBluesky()}
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
                      onKeyDown={(e) => e.key === 'Enter' && signInBluesky()}
                      placeholder="sk-ant-..."
                    />
                    <p className="hint" style={{ marginTop: '0.5rem' }}>
                      Get your API key from{' '}
                      <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener noreferrer">
                        Anthropic&apos;s console
                      </a>
                      . You&apos;ll need an Anthropic account with API credits.
                    </p>
                  </div>
                )}
                <button
                  className="btn"
                  onClick={signInBluesky}
                  disabled={!handle.trim() || (!isOwner && !apiKey.trim())}
                >
                  {agentRef.current ? 'Summarize my feed' : 'Sign in with Bluesky'}
                </button>
                <p className="hint">
                  You&apos;ll be redirected to Bluesky to authorize access to your feed.
                </p>
              </>
            )}

            {platform === 'twitter' && (
              <>
                <h2 className="cardTitle">Sign in with Twitter / X</h2>
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
                    onKeyDown={(e) => e.key === 'Enter' && signInTwitter()}
                    placeholder="sk-ant-..."
                  />
                  <p className="hint" style={{ marginTop: '0.5rem' }}>
                    Get your API key from{' '}
                    <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener noreferrer">
                      Anthropic&apos;s console
                    </a>
                    . You&apos;ll need an Anthropic account with API credits.
                  </p>
                </div>
                <button
                  className="btn"
                  onClick={signInTwitter}
                >
                  Sign in with Twitter
                </button>
                <p className="hint">
                  You&apos;ll be redirected to Twitter to authorize access to your feed.
                </p>
              </>
            )}
          </div>
        )}

        {state.status === 'login' && platform === 'bluesky' && (
          <div className="embedWrap">
            <blockquote
              className="bluesky-embed"
              data-bluesky-uri="at://did:plc:4w3lx5jmokfvihilz2q562ev/app.bsky.feed.post/3mggrm36nuc2w"
              data-bluesky-cid="bafyreifcnvzgzqiua74ofnfzdwuctriwuyszudgy6ujncwske3v43jgc3e"
              data-bluesky-embed-color-mode="system"
            >
              <p lang="en">
                I wrote an app that reads the last 24 hours of my BlueSky feed and catches me up on
                what everyone is talking about. This is actual output that I have not edited in any way.
              </p>
              &mdash; Laurie Voss (
              <a href="https://bsky.app/profile/did:plc:4w3lx5jmokfvihilz2q562ev?ref_src=embed">@seldo.com</a>
              ){' '}
              <a href="https://bsky.app/profile/did:plc:4w3lx5jmokfvihilz2q562ev/post/3mggrm36nuc2w?ref_src=embed">
                March 6, 2026 at 6:26 PM
              </a>
            </blockquote>
            <BlueskyEmbedScript />
          </div>
        )}

        {state.status === 'login' && platform === 'twitter' && (
          <div className="embedWrap">
            <blockquote
              className="bluesky-embed"
              data-bluesky-uri="at://did:plc:4w3lx5jmokfvihilz2q562ev/app.bsky.feed.post/3mgj5paspns25"
              data-bluesky-cid="bafyreibpbex3xkzgg32rngynaiiz5upmeczptuqivpwl4bymtf5zffyrjq"
              data-bluesky-embed-color-mode="system"
            >
              <p lang="en">
                I extended Zeitgeist.Blue to handle Twitter feeds and the results were... predictable.
                But if you want a summary instead of having to wade through nazis yourself, it&apos;s there now.
              </p>
              &mdash; Laurie Voss (
              <a href="https://bsky.app/profile/did:plc:4w3lx5jmokfvihilz2q562ev?ref_src=embed">@seldo.com</a>
              ){' '}
              <a href="https://bsky.app/profile/did:plc:4w3lx5jmokfvihilz2q562ev/post/3mgj5paspns25?ref_src=embed">
                March 7, 2026 at 5:07 PM
              </a>
            </blockquote>
            <BlueskyEmbedScript />
          </div>
        )}

        {state.status === 'loading' && (
          <div className="loadingWrap">
            <div className="spinner" />
            <p className="loadingMsg">{state.message}</p>
          </div>
        )}

        {(state.status === 'streaming' || state.status === 'done') && (
          <>
            <div className="resultsMeta">
              <span className="postCount">
                {state.postCount} {activePlatform === 'twitter' ? 'tweets' : 'posts'} · last 24 hours
                {' · '}{activePlatform === 'twitter' ? 'Twitter / X' : 'Bluesky'}
              </span>
              <button className="textBtn" onClick={signOut}>Sign out</button>
            </div>
            <div className="summaryCard">
              <h2 className="summaryTitle">What&apos;s happening on your feed</h2>
              <div className="prose">
                <ReactMarkdown>{state.summary}</ReactMarkdown>
              </div>
              {state.status === 'streaming' && <div className="spinner" style={{ marginTop: '1rem' }} />}
            </div>
            {state.status === 'done' && (
              <button className="refreshBtn" onClick={refresh}>Refresh summary</button>
            )}
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

function BlueskyEmbedScript() {
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://embed.bsky.app/static/embed.js'
    script.async = true
    script.charset = 'utf-8'
    document.body.appendChild(script)
    return () => { document.body.removeChild(script) }
  }, [])
  return null
}

function saveCachedSummary(summary: string, postCount: number, handle: string, platform: Platform) {
  localStorage.setItem(`zeitgeist_summary_${platform}`, JSON.stringify({
    summary, postCount, handle, timestamp: Date.now(),
  }))
}

function loadCachedSummary(platform: Platform): { summary: string; postCount: number; handle: string } | null {
  try {
    let raw = localStorage.getItem(`zeitgeist_summary_${platform}`)
    // Migrate legacy cache key from before platform support was added
    if (!raw && platform === 'bluesky') {
      raw = localStorage.getItem('zeitgeist_summary')
      if (raw) {
        localStorage.setItem('zeitgeist_summary_bluesky', raw)
        localStorage.removeItem('zeitgeist_summary')
      }
    }
    if (!raw) return null
    const data = JSON.parse(raw)
    if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(`zeitgeist_summary_${platform}`)
      return null
    }
    return { summary: data.summary, postCount: data.postCount, handle: data.handle }
  } catch {
    return null
  }
}

type FeedPost = { text: string; url: string }

async function fetchLast24Hours(agent: import('@atproto/api').Agent): Promise<FeedPost[]> {
  const cutoffMs = Date.now() - 24 * 60 * 60 * 1000
  const posts: FeedPost[] = []
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
        const rkey = item.post.uri.split('/').pop()
        const authorHandle = item.post.author.handle
        const url = `https://bsky.app/profile/${authorHandle}/post/${rkey}`
        posts.push({ text: record.text.trim(), url })
      }
    }

    if (hitOldPost || !res.data.cursor || posts.length >= 2000) break
    cursor = res.data.cursor
  }

  return posts
}
