'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'

type AppState =
  | { status: 'login' }
  | { status: 'loading'; message: string }
  | { status: 'done'; summary: string; postCount: number }
  | { status: 'error'; message: string }

export default function Home() {
  const [state, setState] = useState<AppState>({ status: 'login' })
  const [handle, setHandle] = useState('')
  const [password, setPassword] = useState('')
  const [apiKey, setApiKey] = useState('')

  const ownerHandle = process.env.NEXT_PUBLIC_OWNER_HANDLE ?? 'seldo.com'
  const isOwner = handle.trim().replace(/^@/, '') === ownerHandle

  async function signIn() {
    const trimmedHandle = handle.trim().replace(/^@/, '')
    const trimmedPassword = password.trim()
    if (!trimmedHandle || !trimmedPassword) return

    try {
      setState({ status: 'loading', message: 'Signing in...' })

      const { AtpAgent } = await import('@atproto/api')
      const agent = new AtpAgent({ service: 'https://bsky.social' })
      await agent.login({ identifier: trimmedHandle, password: trimmedPassword })

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
        body: JSON.stringify({ posts, handle: trimmedHandle, apiKey: apiKey.trim() || undefined }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error ?? 'Summarization failed')
      }

      const { summary } = await res.json()
      setState({ status: 'done', summary, postCount: posts.length })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setState({ status: 'error', message: msg })
    }
  }

  function reset() {
    setState({ status: 'login' })
    setPassword('')
    setApiKey('')
  }

  return (
    <main className="page">
      <div className="inner">
        <h1 className="siteTitle">Zeitgeist</h1>
        <p className="siteSubtitle">24-hour Bluesky feed summary, powered by Claude</p>

        {state.status === 'login' && (
          <div className="card">
            <h2 className="cardTitle">Sign in</h2>
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
              />
            </div>
            <div className="formGroup">
              <label className="label" htmlFor="password">App password</label>
              <input
                id="password"
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && signIn()}
                placeholder="xxxx-xxxx-xxxx-xxxx"
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
              </div>
            )}
            <button
              className="btn"
              onClick={signIn}
              disabled={!handle.trim() || !password.trim() || (!isOwner && !apiKey.trim())}
            >
              Summarize my feed
            </button>
            <p className="hint">
              Bluesky app password: Settings → Privacy &amp; Security → App Passwords
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
              <button className="textBtn" onClick={reset}>Sign out</button>
            </div>
            <div className="summaryCard">
              <h2 className="summaryTitle">What&apos;s happening on your feed</h2>
              <div className="prose">
                <ReactMarkdown>{state.summary}</ReactMarkdown>
              </div>
            </div>
            <button className="refreshBtn" onClick={signIn}>Refresh summary</button>
          </>
        )}

        {state.status === 'error' && (
          <div className="errorCard">
            <p className="errorMsg">{state.message}</p>
            <button className="textBtn" onClick={reset}>Try again</button>
          </div>
        )}
      </div>
    </main>
  )
}

async function fetchLast24Hours(agent: import('@atproto/api').AtpAgent): Promise<string[]> {
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
