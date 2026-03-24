import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Zeitgeist',
    short_name: 'Zeitgeist',
    description: 'Summarize your Bluesky, Twitter, or Mastodon feed',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fbff',
    theme_color: '#1a5fa8',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
