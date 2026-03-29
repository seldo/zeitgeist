const USER_AGENT = 'Zeitgeist/1.0 (social feed summarizer; https://github.com/seldo/zeitgeist)'

export function mastodonFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('User-Agent', USER_AGENT)
  return fetch(url, { ...init, headers })
}
