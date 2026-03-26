'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Candidate {
  id: string
  name: string
  email: string | null
  vote_token: string
  eliminated_in_round: number | null
}

interface Vote {
  id: string
  round: number
  reason: string | null
  voter: { id: string; name: string }
  voted_for: { id: string; name: string }
}

interface Election {
  id: string
  title: string
  admin_token: string
  current_round: number
  status: 'lobby' | 'voting' | 'completed'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function voteLink(token: string) {
  return typeof window !== 'undefined' ? `${window.location.origin}/vote/${token}` : ''
}

function registrationLink(electionId: string) {
  return typeof window !== 'undefined' ? `${window.location.origin}/register/${electionId}` : ''
}

function useCopy() {
  const [copied, setCopied] = useState('')
  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(''), 1600)
    })
  }
  return { copied, copy }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { adminToken } = useParams<{ adminToken: string }>()
  const [election, setElection] = useState<Election | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [votes, setVotes] = useState<Vote[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const { copied, copy } = useCopy()

  // Action states
  const [actionBusy, setActionBusy] = useState(false)
  const [confirm, setConfirm] = useState<'open-voting' | 'advance' | 'end' | null>(null)
  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Add participant form
  const [showAddForm, setShowAddForm] = useState(false)
  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addMsg, setAddMsg] = useState('')

  // Expanded vote breakdown
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchDataRef = useRef<() => Promise<void>>()

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/${adminToken}`)
      if (!res.ok) {
        const j = await res.json()
        setFetchError(j.error ?? 'Failed to load election.')
        return
      }
      const data = await res.json()
      setElection(data.election)
      setCandidates(data.candidates)
      setVotes(data.votes)
    } catch {
      setFetchError('Network error. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [adminToken])

  fetchDataRef.current = fetchData

  // ── Initial load + Realtime ───────────────────────────────────────────────

  useEffect(() => {
    fetchData()
    // poll for vote updates every 6 seconds
    const interval = setInterval(() => fetchDataRef.current?.(), 6000)
    return () => clearInterval(interval)
  }, [fetchData])

  useEffect(() => {
    if (!election) return
    const supabase = getSupabaseClient()
    const channel = supabase
      .channel(`admin-${election.id}`)
      // New participant joins
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'candidates',
        filter: `election_id=eq.${election.id}`,
      }, (payload) => {
        const c = payload.new as Candidate
        setCandidates((prev) => prev.some((x) => x.id === c.id) ? prev : [...prev, c])
      })
      // Election status changes (e.g. after control actions)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'elections',
        filter: `id=eq.${election.id}`,
      }, (payload) => {
        setElection((prev) => prev ? { ...prev, ...payload.new } : prev)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [election?.id])

  // ── Derived data ──────────────────────────────────────────────────────────

  const round = election?.current_round ?? 1
  const active = candidates.filter((c) => c.eliminated_in_round === null)
  const eliminated = candidates.filter((c) => c.eliminated_in_round !== null)
  const roundVotes = votes.filter((v) => v.round === round)
  const voterIds = new Set(roundVotes.map((v) => v.voter.id))
  const votedCount = active.filter((c) => voterIds.has(c.id)).length

  const tally: Record<string, { candidate: Candidate; count: number; voteList: Vote[] }> = {}
  for (const c of active) tally[c.id] = { candidate: c, count: 0, voteList: [] }
  for (const v of roundVotes) {
    if (tally[v.voted_for.id]) {
      tally[v.voted_for.id].count++
      tally[v.voted_for.id].voteList.push(v)
    }
  }
  const sortedTally = Object.values(tally).sort((a, b) => b.count - a.count)

  // ── Actions ───────────────────────────────────────────────────────────────

  async function doControl(action: 'open-voting' | 'end-election') {
    setConfirm(null)
    setActionBusy(true)
    setActionMsg(null)
    try {
      const res = await fetch(`/api/admin/${adminToken}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) {
        setActionMsg({ type: 'err', text: data.error })
      } else {
        setActionMsg({
          type: 'ok',
          text: action === 'open-voting'
            ? '✅ Voting is now open! Participants can submit their votes.'
            : '🏁 Election ended.',
        })
        await fetchData()
      }
    } catch {
      setActionMsg({ type: 'err', text: 'Network error.' })
    } finally {
      setActionBusy(false)
    }
  }

  async function doAdvance() {
    setConfirm(null)
    setActionBusy(true)
    setActionMsg(null)
    try {
      const res = await fetch(`/api/advance/${adminToken}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setActionMsg({ type: 'err', text: data.error })
      } else if (data.status === 'completed') {
        setActionMsg({ type: 'ok', text: `🎉 Election complete! ${data.remaining} finalist(s) remain.` })
      } else {
        setActionMsg({
          type: 'ok',
          text: `✅ Round ${round} closed. ${data.eliminated} eliminated. Round ${data.newRound} is open.`,
        })
      }
      await fetchData()
    } catch {
      setActionMsg({ type: 'err', text: 'Network error.' })
    } finally {
      setActionBusy(false)
    }
  }

  async function doAddParticipant(e: React.FormEvent) {
    e.preventDefault()
    if (!addName.trim()) return
    setAddBusy(true)
    setAddMsg('')
    try {
      const res = await fetch(`/api/admin/${adminToken}/add-participant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName, email: addEmail || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddMsg(`Error: ${data.error}`)
      } else {
        setAddMsg(
          `✅ ${data.candidate.name} added.${data.emailSent ? ' Email sent!' : addEmail ? ' ⚠️ Email failed — share link manually.' : ''}`,
        )
        setAddName('')
        setAddEmail('')
        await fetchData()
      }
    } catch {
      setAddMsg('Network error.')
    } finally {
      setAddBusy(false)
    }
  }

  // ── Loading / error ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500">Loading dashboard…</p>
      </div>
    )
  }
  if (fetchError || !election) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center text-red-700">
        {fetchError || 'Election not found.'}
      </div>
    )
  }

  // ── Phase badges ──────────────────────────────────────────────────────────

  const phaseBadge: Record<string, { label: string; cls: string }> = {
    lobby:     { label: '🚪 Lobby open', cls: 'bg-amber-100 text-amber-800' },
    voting:    { label: '🗳️ Voting open', cls: 'bg-green-100 text-green-800' },
    completed: { label: '🏁 Completed', cls: 'bg-gray-100 text-gray-700' },
  }
  const phase = phaseBadge[election.status]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <p className="text-sm text-violet-600 font-semibold uppercase tracking-widest mb-1">Admin Dashboard</p>
          <h1 className="text-3xl font-extrabold text-gray-900">{election.title}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${phase.cls}`}>
              {phase.label}
            </span>
            {election.status === 'voting' && (
              <span className="text-xs text-gray-500">Round {round}</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {election.status === 'lobby' && (
            <button
              onClick={() => setConfirm('open-voting')}
              disabled={actionBusy || active.length < 2}
              title={active.length < 2 ? 'Need at least 2 participants' : ''}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-sm disabled:opacity-50 transition-colors shadow"
            >
              {actionBusy ? 'Processing…' : '▶ Open Voting'}
            </button>
          )}
          {election.status === 'voting' && (
            <button
              onClick={() => setConfirm('advance')}
              disabled={actionBusy}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-semibold text-sm disabled:opacity-50 transition-colors shadow"
            >
              {actionBusy ? 'Processing…' : `⏭ End Round ${round} & Advance`}
            </button>
          )}
          {election.status !== 'completed' && (
            <button
              onClick={() => setConfirm('end')}
              disabled={actionBusy}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold text-sm disabled:opacity-50 transition-colors"
            >
              ■ End Election
            </button>
          )}
        </div>
      </div>

      {/* ── Confirm modal ───────────────────────────────────────────────────── */}
      {confirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            <h2 className="text-lg font-bold text-gray-900">
              {confirm === 'open-voting' && 'Open voting now?'}
              {confirm === 'advance' && `Advance to Round ${round + 1}?`}
              {confirm === 'end' && 'End the election?'}
            </h2>
            <p className="text-gray-600 text-sm">
              {confirm === 'open-voting' && `All ${active.length} registered participants will be able to vote. Registration will close.`}
              {confirm === 'advance' && `Candidates with zero votes in Round ${round} will be eliminated. Cannot be undone.`}
              {confirm === 'end' && 'All voting will stop. This cannot be undone.'}
            </p>
            {confirm === 'advance' && votedCount < active.length && (
              <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                ⚠️ {active.length - votedCount} voter(s) haven't voted yet this round.
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirm(null)} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirm === 'open-voting') doControl('open-voting')
                  else if (confirm === 'advance') doAdvance()
                  else if (confirm === 'end') doControl('end-election')
                }}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Action result ───────────────────────────────────────────────────── */}
      {actionMsg && (
        <div className={`rounded-xl p-4 text-sm font-medium ${actionMsg.type === 'ok' ? 'bg-violet-50 border border-violet-200 text-violet-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {actionMsg.text}
        </div>
      )}

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Registered', value: candidates.length },
          { label: election.status === 'lobby' ? 'Need to vote' : 'Active this round', value: active.length },
          { label: 'Voted this round', value: election.status === 'voting' ? `${votedCount}/${active.length}` : '—' },
          { label: 'Eliminated', value: eliminated.length },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-2xl font-extrabold text-violet-700">{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════ LOBBY PHASE ═══════════════════════════ */}
      {election.status === 'lobby' && (
        <>
          {/* Registration link */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Registration Link</h2>
            <p className="text-sm text-gray-500 mb-3">
              Share this link with everyone you want to invite. They sign up with their name and email and receive their voting link automatically.
            </p>
            <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
              <span className="text-sm font-mono text-violet-800 truncate flex-1">
                {registrationLink(election.id)}
              </span>
              <button
                onClick={() => copy(registrationLink(election.id), 'reg')}
                className="px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-semibold flex-shrink-0 transition-colors"
              >
                {copied === 'reg' ? '✅' : 'Copy'}
              </button>
            </div>
          </section>

          {/* Lobby participant list — real-time */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-900">
                Lobby{' '}
                <span className="text-violet-600">({active.length})</span>
              </h2>
              <span className="text-xs text-gray-400">🔴 Live</span>
            </div>

            {active.length === 0 ? (
              <div className="bg-gray-50 border border-dashed border-gray-300 rounded-2xl p-10 text-center text-gray-400">
                <p className="text-3xl mb-2">👥</p>
                <p className="font-semibold">Waiting for participants to join…</p>
                <p className="text-sm mt-1">Share the registration link above.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {active.map((c) => (
                  <div key={c.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
                    <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 font-bold flex items-center justify-center text-sm">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{c.name}</p>
                      {c.email && <p className="text-xs text-gray-400 truncate">{c.email}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* ══════════════════════════ VOTING PHASE ══════════════════════════════ */}
      {election.status === 'voting' && (
        <>
          {/* Voting links */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Voting Links — Round {round}</h2>
            <p className="text-sm text-gray-500 mb-3">
              These links were emailed automatically. You can copy and re-share any individual link here.
            </p>
            <button
              onClick={() => copy(active.map((c) => `${c.name}: ${voteLink(c.vote_token)}`).join('\n'), 'all')}
              className="mb-3 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-sm font-semibold border border-indigo-200"
            >
              {copied === 'all' ? '✅ Copied!' : '📋 Copy all links'}
            </button>
            <div className="space-y-2">
              {active.map((c) => (
                <div key={c.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 font-bold flex items-center justify-center text-sm flex-shrink-0">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm">{c.name}</p>
                    {c.email && <p className="text-xs text-gray-400 truncate">{c.email}</p>}
                  </div>
                  {voterIds.has(c.id)
                    ? <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-1 rounded-full flex-shrink-0">✓ Voted</span>
                    : <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-1 rounded-full flex-shrink-0">Pending</span>}
                  <button
                    onClick={() => copy(voteLink(c.vote_token), c.id)}
                    className="text-xs px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-semibold flex-shrink-0"
                  >
                    {copied === c.id ? '✅' : 'Copy'}
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Live tally */}
          {roundVotes.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">Round {round} — Live Tally</h2>
              <div className="space-y-3">
                {sortedTally.map(({ candidate, count, voteList }) => (
                  <div key={candidate.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="flex items-center gap-4 px-4 py-3">
                      <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 font-bold flex items-center justify-center text-sm flex-shrink-0">
                        {candidate.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-gray-800 flex-1">{candidate.name}</span>
                      <div className="flex-1 max-w-xs">
                        <div className="bg-gray-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="bg-violet-500 h-2.5 rounded-full transition-all duration-500"
                            style={{ width: active.length > 1 ? `${(count / (active.length - 1)) * 100}%` : '0%' }}
                          />
                        </div>
                      </div>
                      <span className="text-sm font-bold text-gray-700 w-16 text-right flex-shrink-0">
                        {count} vote{count !== 1 ? 's' : ''}
                      </span>
                      {voteList.length > 0 && (
                        <button
                          onClick={() => setExpanded(expanded === candidate.id ? null : candidate.id)}
                          className="text-xs text-violet-600 hover:text-violet-800 font-semibold underline flex-shrink-0"
                        >
                          {expanded === candidate.id ? 'Hide' : 'Details'}
                        </button>
                      )}
                    </div>
                    {expanded === candidate.id && voteList.length > 0 && (
                      <div className="border-t border-gray-100 bg-violet-50 px-4 py-3 space-y-2">
                        <p className="text-xs font-semibold text-violet-700 uppercase tracking-wider">Who voted & why</p>
                        {voteList.map((v) => (
                          <div key={v.id} className="flex gap-3 items-start">
                            <div className="w-6 h-6 rounded-full bg-violet-200 text-violet-800 font-bold flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                              {v.voter.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="text-sm font-semibold text-gray-700">{v.voter.name}</span>
                              {v.reason
                                ? <p className="text-sm text-gray-600 italic">"{v.reason}"</p>
                                : <p className="text-xs text-gray-400">No reason given</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* ══════════════ COMPLETED PHASE ════════════════ */}
      {election.status === 'completed' && active.length > 0 && (
        <section className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-200 rounded-2xl p-8 text-center space-y-4">
          <p className="text-5xl">🏆</p>
          <h2 className="text-2xl font-extrabold text-gray-900">
            {active.length === 1 ? 'Winner' : 'Finalists'}
          </h2>
          <div className="flex flex-wrap gap-3 justify-center">
            {active.map((c) => (
              <span key={c.id} className="px-4 py-2 bg-white border-2 border-violet-300 rounded-xl font-bold text-violet-800 shadow-sm">
                {c.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ══════════════ ADD PARTICIPANT MANUALLY ═══════════════ */}
      <section>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="text-sm text-violet-600 hover:text-violet-800 font-semibold underline"
        >
          {showAddForm ? '− Hide' : '+ Add participant manually'}
        </button>
        {showAddForm && (
          <form onSubmit={doAddParticipant} className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3 max-w-md">
            <p className="text-sm text-gray-600">
              Add someone directly without the registration link. If you provide their email, they'll receive their voting link automatically.
            </p>
            <input
              type="text" value={addName} onChange={(e) => setAddName(e.target.value)}
              placeholder="Full name *"
              className="w-full border border-gray-200 focus:border-violet-400 rounded-lg px-3 py-2 text-sm outline-none"
            />
            <input
              type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)}
              placeholder="Email address (optional)"
              className="w-full border border-gray-200 focus:border-violet-400 rounded-lg px-3 py-2 text-sm outline-none"
            />
            {addMsg && <p className="text-sm text-violet-700">{addMsg}</p>}
            <button
              type="submit" disabled={addBusy || !addName.trim()}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {addBusy ? 'Adding…' : 'Add Participant'}
            </button>
          </form>
        )}
      </section>

      {/* ══════════════ ELIMINATED ════════════════════════════════ */}
      {eliminated.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3">Eliminated</h2>
          <div className="flex flex-wrap gap-2">
            {eliminated.map((c) => (
              <span key={c.id} className="px-3 py-1.5 bg-gray-100 text-gray-500 rounded-full text-sm font-medium line-through">
                {c.name} (Round {c.eliminated_in_round})
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ══════════════ ROUND HISTORY ════════════════════════════ */}
      {round > 1 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-3">Round History</h2>
          {Array.from({ length: round - 1 }, (_, i) => i + 1).map((r) => {
            const rVotes = votes.filter((v) => v.round === r)
            if (!rVotes.length) return null
            const rTally: Record<string, { name: string; count: number }> = {}
            for (const v of rVotes) {
              if (!rTally[v.voted_for.id]) rTally[v.voted_for.id] = { name: v.voted_for.name, count: 0 }
              rTally[v.voted_for.id].count++
            }
            return (
              <div key={r} className="mb-3">
                <h3 className="text-sm font-semibold text-gray-600 mb-2">Round {r}</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.values(rTally).sort((a, b) => b.count - a.count).map((t) => (
                    <span key={t.name} className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-700 shadow-sm">
                      {t.name} — {t.count} vote{t.count !== 1 ? 's' : ''}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}
