// POST /api/advance/[adminToken] - advance the election to the next round
// Candidates who received zero votes in the current round are eliminated.
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(
  _request: NextRequest,
  { params }: { params: { adminToken: string } },
) {
  try {
    const supabase = getSupabaseAdmin()
    const { adminToken } = params

    // 1. Fetch election
    const { data: election, error: electionError } = await supabase
      .from('elections')
      .select('*')
      .eq('admin_token', adminToken)
      .single()

    if (electionError || !election) {
      return NextResponse.json({ error: 'Election not found.' }, { status: 404 })
    }
    if (election.status === 'completed') {
      return NextResponse.json({ error: 'Election is already completed.' }, { status: 400 })
    }

    const round = election.current_round

    // 2. Find active candidates this round (not yet eliminated)
    const { data: activeCandidates } = await supabase
      .from('candidates')
      .select('id')
      .eq('election_id', election.id)
      .is('eliminated_in_round', null)

    if (!activeCandidates || activeCandidates.length === 0) {
      return NextResponse.json({ error: 'No active candidates.' }, { status: 400 })
    }

    // 3. Find candidates who received at least one vote this round
    const { data: votedFor } = await supabase
      .from('votes')
      .select('voted_for_id')
      .eq('election_id', election.id)
      .eq('round', round)

    const votedForIds = new Set((votedFor ?? []).map((v) => v.voted_for_id))

    // 4. Eliminate candidates with zero votes
    const toEliminate = activeCandidates
      .map((c) => c.id)
      .filter((id) => !votedForIds.has(id))

    if (toEliminate.length > 0) {
      const { error: elimError } = await supabase
        .from('candidates')
        .update({ eliminated_in_round: round })
        .in('id', toEliminate)

      if (elimError) {
        return NextResponse.json({ error: 'Failed to eliminate candidates.' }, { status: 500 })
      }
    }

    // 5. Check how many candidates remain after elimination
    const remaining = activeCandidates.length - toEliminate.length

    // 6a. If only 1 (or 0) remain - end the election
    if (remaining <= 1) {
      await supabase
        .from('elections')
        .update({ status: 'completed' })
        .eq('id', election.id)

      return NextResponse.json({ status: 'completed', remaining })
    }

    // 6b. Otherwise, increment the round
    const { error: updateError } = await supabase
      .from('elections')
      .update({ current_round: round + 1 })
      .eq('id', election.id)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to advance round.' }, { status: 500 })
    }

    return NextResponse.json({ status: 'advanced', newRound: round + 1, eliminated: toEliminate.length, remaining })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 })
  }
}

// POST /api/advance/[adminToken] with body { end: true } - manually end the election
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { adminToken: string } },
) {
  try {
    const supabase = getSupabaseAdmin()
    const { data: election } = await supabase
      .from('elections')
      .select('id')
      .eq('admin_token', params.adminToken)
      .single()

    if (!election) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

    await supabase.from('elections').update({ status: 'completed' }).eq('id', election.id)
    return NextResponse.json({ status: 'completed' })
  } catch {
    return NextResponse.json({ error: 'Server error.' }, { status: 500 })
  }
}
