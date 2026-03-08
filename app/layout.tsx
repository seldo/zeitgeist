import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Zeitgeist',
  description: 'Summarize your Bluesky or Twitter feed',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="siteFooter">
          Created by <a href="https://seldo.com">Laurie Voss</a> | <a href="https://github.com/seldo/zeitgeist" target="_blank" rel="noopener noreferrer">
            Open source on GitHub
          </a>
        </footer>
      </body>
    </html>
  )
}
