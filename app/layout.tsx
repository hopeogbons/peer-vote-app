import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PeerVote - Multi-Round Peer Voting',
  description: 'Run transparent multi-round peer voting sessions with shareable links.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f8f7ff]">
        <header className="bg-gradient-to-r from-violet-700 to-indigo-600 text-white shadow-md">
          <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
            <span className="text-2xl">🗳️</span>
            <span className="text-xl font-bold tracking-tight">PeerVote</span>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-10">{children}</main>
      </body>
    </html>
  )
}
