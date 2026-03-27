'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!title.trim()) { setError('Please enter a title for the election.'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/elections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No candidates - they self-register via the registration link
        body: JSON.stringify({ title: title.trim(), candidates: [] }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create election.'); return }
      router.push(`/admin/${data.adminToken}`)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-10">

      {/* Hero */}
      <div className="text-center space-y-3 py-4">
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">
          Run a peer vote in minutes
        </h1>
        <p className="text-gray-500 text-lg">
          Share a sign-up link, let participants self-register, then open voting
          when you're ready - with real-time results and multi-round support.
        </p>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          { icon: '✏️', step: '1', title: 'Create', body: 'Give your election a title.' },
          { icon: '🔗', step: '2', title: 'Share link', body: 'Send the registration link to participants.' },
          { icon: '📧', step: '3', title: 'Auto-email', body: 'Each registrant gets their personal voting link by email.' },
          { icon: '🏆', step: '4', title: 'Vote & advance', body: 'Open voting, run as many rounds as needed.' },
        ].map((s) => (
          <div key={s.step} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm text-center relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center">
              {s.step}
            </div>
            <div className="text-3xl mb-2 mt-2">{s.icon}</div>
            <h3 className="font-bold text-gray-800 mb-1">{s.title}</h3>
            <p className="text-gray-500 text-sm">{s.body}</p>
          </div>
        ))}
      </div>

      {/* Create form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-6"
      >
        <h2 className="text-xl font-bold text-gray-900">Create a new election</h2>

        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-gray-700">Election title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Employee of the Quarter - Q1 2026"
            className="w-full border-2 border-gray-200 focus:border-violet-400 rounded-xl px-4 py-3 text-sm outline-none transition-colors"
            autoFocus
          />
          <p className="text-xs text-gray-400">
            After creating, you'll get an admin link and a registration link to share with participants.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{error}</div>
        )}

        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="w-full py-3.5 px-6 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-md text-base"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Creating…
            </span>
          ) : (
            'Create Election →'
          )}
        </button>

        <p className="text-xs text-gray-400 text-center">
          Bookmark your admin link - it's the only way to manage this election.
        </p>
      </form>
    </div>
  )
}
