'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'

interface Candidate { id: string; name: string }
interface ElectionInfo { title: string; round: number; status: 'lobby' | 'voting' | 'completed' }

interface BallotData {
  voter: { id: string; name: string }
  election: ElectionInfo
  electionId: string          // needed for Realtime subscriptions
  voterEliminated: boolean
  alreadyVoted: boolean
  existingVote: { voted_for: { name: string }; reason: string | null } | null
  candidates: Candidate[]
}

export default function VotePage() {
  const { token } = useParams<{ token: string }>()

  const [data, setData] = useState<BallotData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Real-time lobby state
  const [lobbyParticipants, setLobbyParticipants] = useState<{ id: string; name: string }[]>([])
  const [electionStatus, setElectionStatus] = useState<string | null>(null)

  // Voting form
  const [selected, setSelected] = useState<string>('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/vote/${token}`)
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) { setLoadError(json.error ?? 'Failed to load ballot.'); return }
        setData(json)
        setElectionStatus(json.election.status)
        if (json.alreadyVoted) setSubmitted(true)
      })
      .catch(() => setLoadError('Network error. Please try again.'))
      .finally(() => setLoading(false))
  }, [token])

  // ── Realtime subscriptions ──────────────────────────────────────────────────
  // Only active when election is in 'lobby' phase
  useEffect(() => {
    if (!data?.electionId) return
    const supabase = getSupabaseClient()

    // Fetch current participants for lobby view
    supabase
      .from('candidates')
      .select('id, name')
      .eq('election_id', data.electionId)
      .is('eliminated_in_round', null)
      .order('created_at', { ascending: true })
      .then(({ data: rows }) => {
        if (rows) setLobbyParticipants(rows)
      })

    const channel = supabase
      .channel(`voter-${data.electionId}`)
      // New participant joins the lobby
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'candidates',
        filter: `election_id=eq.${data.electionId}`,
      }, (payload) => {
        const p = payload.new as { id: string; name: string }
        setLobbyParticipants((prev) =>
          prev.some((x) => x.id === p.id) ? prev : [...prev, p],
        )
      })
      // Election status change (voting opens or closes)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'elections',
        filter: `id=eq.${data.electionId}`,
      }, (payload) => {
        const newStatus = payload.new.status
        setElectionStatus(newStatus)
        if (newStatus === 'voting') {
          // Reload ballot data so the vote form appears
          fetch(`/api/vote/${token}`)
            .then((r) => r.json())
            .then((json) => {
              if (json.candidates) setData((prev) => prev ? { ...prev, candidates: json.candidates, election: json.election } : prev)
            })
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [data?.electionId, token])

  // ── Vote submission ─────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) { setSubmitError('Please select someone to vote for.'); return }
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch(`/api/vote/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ votedForId: selected, reason }),
      })
      const json = await res.json()
      if (!res.ok) { setSubmitError(json.error ?? 'Failed to submit vote.'); return }
      setSubmitted(true)
      if (data) {
        const chosen = data.candidates.find((c) => c.id === selected)
        setData({ ...data, alreadyVoted: true, existingVote: { voted_for: { name: chosen?.name ?? '' }, reason: reason || null } })
      }
    } catch {
      setSubmitError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500">Loading your ballot…</p>
      </div>
    )
  }

  if (loadError || !data) {
    return (
      <div className="max-w-md mx-auto bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
        <p className="text-4xl mb-4">🔗</p>
        <h1 className="text-xl font-bold text-red-800 mb-2">Link not found</h1>
        <p className="text-red-600 text-sm">{loadError || 'This voting link is invalid or expired.'}</p>
      </div>
    )
  }

  const { voter, election, voterEliminated } = data
  const liveStatus = electionStatus ?? election.status

  // ── Eliminated ──────────────────────────────────────────────────────────────
  if (voterEliminated) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <p className="text-5xl">😔</p>
        <h1 className="text-2xl font-bold text-gray-800">Thanks for participating, {voter.name}!</h1>
        <p className="text-gray-500">
          You weren't selected to continue in <strong>{election.title}</strong>. The remaining participants are still voting.
        </p>
      </div>
    )
  }

  // ── Election ended ──────────────────────────────────────────────────────────
  if (liveStatus === 'completed') {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <p className="text-5xl">🏁</p>
        <h1 className="text-2xl font-bold text-gray-800">Election Ended</h1>
        <p className="text-gray-500">
          <strong>{election.title}</strong> has been completed. Thank you for participating!
        </p>
      </div>
    )
  }

  // ── LOBBY — waiting for admin to open voting ────────────────────────────────
  if (liveStatus === 'lobby') {
    return (
      <div className="max-w-lg mx-auto space-y-8 py-4">

        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center text-3xl mx-auto">⏳</div>
          <h1 className="text-2xl font-extrabold text-gray-900">{election.title}</h1>
          <p className="text-gray-500">
            You're registered, <strong>{voter.name}</strong>. Voting hasn't started yet — the admin will open the round shortly.
          </p>
          <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Waiting for admin to open voting
          </span>
        </div>

        {/* Real-time participant list */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">Participants in the lobby</h2>
            <span className="bg-violet-100 text-violet-700 font-bold text-sm px-2 py-0.5 rounded-full">
              {lobbyParticipants.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lobbyParticipants.map((p) => (
              <span
                key={p.id}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
                  p.id === voter.id
                    ? 'bg-violet-100 text-violet-800 border-violet-300'
                    : 'bg-gray-50 text-gray-700 border-gray-200'
                }`}
              >
                {p.id === voter.id ? `${p.name} (you)` : p.name}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-4">
            🔴 Live — this page updates automatically when new people join or when voting opens.
          </p>
        </div>
      </div>
    )
  }

  // ── Already voted ────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-6">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center text-4xl mx-auto">✅</div>
        <h1 className="text-2xl font-bold text-gray-800">Vote recorded!</h1>
        <p className="text-gray-600">
          You voted for{' '}
          <strong className="text-violet-700">{data.existingVote?.voted_for.name}</strong> in Round{' '}
          {election.round} of <em>{election.title}</em>.
        </p>
        {data.existingVote?.reason && (
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-800 italic">
            "{data.existingVote.reason}"
          </div>
        )}
        <p className="text-gray-400 text-sm">
          Results will be announced when the admin closes the round.
        </p>
      </div>
    )
  }

  // ── Ballot ────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto space-y-8">
      <div>
        <p className="text-sm text-violet-600 font-semibold uppercase tracking-widest mb-1">Round {election.round}</p>
        <h1 className="text-2xl font-extrabold text-gray-900">{election.title}</h1>
        <p className="text-gray-500 mt-1">
          Hello, <strong>{voter.name}</strong>. Select one person you'd like to vote for.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-3">
          {data.candidates.length === 0
            ? <p className="text-gray-400 text-sm">No other active candidates found.</p>
            : data.candidates.map((c) => (
              <label
                key={c.id}
                className={`flex items-center gap-4 bg-white border-2 rounded-xl px-5 py-4 cursor-pointer transition-all shadow-sm ${
                  selected === c.id
                    ? 'border-violet-500 bg-violet-50 shadow-violet-100'
                    : 'border-gray-200 hover:border-violet-300 hover:bg-violet-50/40'
                }`}
              >
                <input
                  type="radio" name="vote" value={c.id} checked={selected === c.id}
                  onChange={() => setSelected(c.id)} className="accent-violet-600 w-5 h-5"
                />
                <div className="w-9 h-9 rounded-full bg-violet-100 text-violet-700 font-extrabold flex items-center justify-center text-sm flex-shrink-0">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <span className="font-semibold text-gray-800">{c.name}</span>
              </label>
            ))
          }
        </div>

        {selected && (
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">
              Why are you voting for{' '}
              <span className="text-violet-700">{data.candidates.find((c) => c.id === selected)?.name}</span>?{' '}
              <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Great leadership, always collaborative…"
              maxLength={280} rows={3}
              className="w-full border-2 border-gray-200 focus:border-violet-400 rounded-xl px-4 py-3 text-sm text-gray-800 resize-none outline-none transition-colors"
            />
            <p className="text-xs text-gray-400 text-right">{reason.length}/280</p>
          </div>
        )}

        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{submitError}</div>
        )}

        <button
          type="submit" disabled={!selected || submitting}
          className="w-full py-3 px-6 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors shadow-md text-base"
        >
          {submitting ? 'Submitting…' : 'Submit Vote'}
        </button>
        <p className="text-xs text-gray-400 text-center">Your vote is final — you cannot change it once submitted.</p>
      </form>
    </div>
  )
}
