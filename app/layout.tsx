import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Zeitgeist',
  description: 'Summarize your Bluesky feed',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="siteFooter">
          <a href="https://github.com/seldo/zeitgeist" target="_blank" rel="noopener noreferrer">
            Open source on GitHub
          </a>
        </footer>
      </body>
    </html>
  )
}
