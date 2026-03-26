'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'

interface ElectionInfo {
  id: string
  title: string
  status: 'lobby' | 'voting' | 'completed'
}

interface Participant {
  id: string
  name: string
  created_at: string
}

export default function RegisterPage() {
  const { electionId } = useParams<{ electionId: string }>()

  const [election, setElection] = useState<ElectionInfo | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  // Form state
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [result, setResult] = useState<{
    success: boolean
    emailSent: boolean
    alreadyRegistered?: boolean
    message?: string
    voteToken?: string
  } | null>(null)

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = getSupabaseClient()

    // Load election details and participant list
    async function load() {
      const [elRes, parRes] = await Promise.all([
        supabase.from('elections').select('id, title, status').eq('id', electionId).single(),
        supabase
          .from('candidates')
          .select('id, name, created_at')
          .eq('election_id', electionId)
          .order('created_at', { ascending: true }),
      ])
      if (elRes.error || !elRes.data) {
        setLoadError('Election not found or the registration link is invalid.')
      } else {
        setElection(elRes.data as ElectionInfo)
      }
      if (parRes.data) setParticipants(parRes.data as Participant[])
      setLoading(false)
    }
    load()

    // ── Realtime: new participants joining ───────────────────────────────────
    const channel = supabase
      .channel(`register-${electionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'candidates', filter: `election_id=eq.${electionId}` },
        (payload) => {
          const p = payload.new as Participant
          setParticipants((prev) => {
            if (prev.some((x) => x.id === p.id)) return prev
            return [...prev, p]
          })
        },
      )
      // Also watch for election status change (voting opened while someone is on this page)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'elections', filter: `id=eq.${electionId}` },
        (payload) => {
          setElection((prev) =>
            prev ? { ...prev, status: payload.new.status } : prev,
          )
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [electionId])

  // ── Submit registration ──────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!name.trim()) { setFormError('Please enter your name.'); return }
    if (!email.trim() || !email.includes('@')) { setFormError('Please enter a valid email address.'); return }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/register/${electionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error ?? 'Registration failed.'); return }
      setResult(data)
    } catch {
      setFormError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500">Loading…</p>
      </div>
    )
  }

  if (loadError || !election) {
    return (
      <div className="max-w-md mx-auto bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
        <p className="text-4xl mb-4">🔗</p>
        <h1 className="text-xl font-bold text-red-800 mb-2">Invalid Link</h1>
        <p className="text-red-600 text-sm">{loadError || 'This registration link is invalid.'}</p>
      </div>
    )
  }

  // Election already started
  if (election.status !== 'lobby') {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <p className="text-5xl">🔒</p>
        <h1 className="text-2xl font-bold text-gray-800">Registration Closed</h1>
        <p className="text-gray-500">
          The admin has already opened voting for <strong>{election.title}</strong>.
          New sign-ups are no longer accepted for this round.
        </p>
      </div>
    )
  }

  // Success state
  if (result?.success) {
    return (
      <div className="max-w-md mx-auto space-y-6 py-8">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center text-4xl mx-auto mb-4">🎉</div>
          <h1 className="text-2xl font-bold text-gray-900">You're registered!</h1>
          <p className="text-gray-500 mt-2">
            Welcome to <strong>{election.title}</strong>, {name}.
          </p>
        </div>

        {result.emailSent ? (
          <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5 text-center space-y-2">
            <p className="text-lg font-semibold text-violet-800">📧 Check your inbox</p>
            <p className="text-sm text-violet-700">
              We've sent your personal voting link to <strong>{email}</strong>.
              Keep it safe — you'll use it when voting opens.
            </p>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
            <p className="text-sm font-semibold text-amber-800">
              ⚠️ Email delivery failed. Save your voting link below:
            </p>
            <a
              href={`/vote/${result.voteToken}`}
              className="block text-center py-3 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl transition-colors"
            >
              Open My Ballot →
            </a>
            <p className="text-xs text-gray-500 font-mono break-all">
              {typeof window !== 'undefined' ? `${window.location.origin}/vote/${result.voteToken}` : ''}
            </p>
          </div>
        )}

        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">
            Who's in so far{' '}
            <span className="text-violet-600 font-bold">({participants.length})</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {participants.map((p) => (
              <span
                key={p.id}
                className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                  p.name === name
                    ? 'bg-violet-100 text-violet-800 border-2 border-violet-300'
                    : 'bg-white border border-gray-200 text-gray-600'
                }`}
              >
                {p.name === name ? `${p.name} (you)` : p.name}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">Live • New participants appear automatically</p>
        </div>
      </div>
    )
  }

  // Already registered
  if (result?.alreadyRegistered) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <p className="text-5xl">📧</p>
        <h1 className="text-2xl font-bold text-gray-800">Already registered</h1>
        <p className="text-gray-500">{result.message}</p>
      </div>
    )
  }

  // ── Registration form ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto space-y-8">

      {/* Header */}
      <div className="text-center space-y-2">
        <p className="text-sm text-violet-600 font-semibold uppercase tracking-widest">Registration Open</p>
        <h1 className="text-3xl font-extrabold text-gray-900">{election.title}</h1>
        <p className="text-gray-500">
          Sign up to participate. You'll receive a personal voting link by email.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4 sm:col-span-1"
        >
          <h2 className="font-bold text-gray-900">Join the vote</h2>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-700">Your name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Amaka Okafor"
              className="w-full border-2 border-gray-200 focus:border-violet-400 rounded-xl px-4 py-3 text-sm outline-none transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-700">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border-2 border-gray-200 focus:border-violet-400 rounded-xl px-4 py-3 text-sm outline-none transition-colors"
            />
            <p className="text-xs text-gray-400">Your voting link will be sent here.</p>
          </div>

          {formError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-300 text-white font-bold rounded-xl transition-all shadow-md"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Registering…
              </span>
            ) : (
              'Register & Get My Link →'
            )}
          </button>
        </form>

        {/* Live participant list */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Who's joining</h2>
            <span className="bg-violet-100 text-violet-700 font-bold text-sm px-2 py-0.5 rounded-full">
              {participants.length}
            </span>
          </div>

          {participants.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">👋</p>
              <p className="text-gray-400 text-sm">Be the first to join!</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {participants.map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 animate-in fade-in duration-300"
                >
                  <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 font-bold flex items-center justify-center text-xs flex-shrink-0">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-700 font-medium">{p.name}</span>
                  {i === participants.length - 1 && (
                    <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full ml-auto">
                      Just joined
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
            🔴 Live — updates automatically
          </p>
        </div>
      </div>
    </div>
  )
}
