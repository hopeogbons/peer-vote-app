// GET  /api/vote/[token] — get ballot info for this voter
// POST /api/vote/[token] — submit a vote
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const supabase = getSupabaseAdmin()
    const { token } = params

    // 1. Find the voter by their token
    const { data: voter, error: voterError } = await supabase
      .from('candidates')
      .select('id, name, election_id, eliminated_in_round')
      .eq('vote_token', token)
      .single()

    if (voterError || !voter) {
      return NextResponse.json({ error: 'Voting link is invalid or has expired.' }, { status: 404 })
    }

    // 2. Fetch election
    const { data: election } = await supabase
      .from('elections')
      .select('id, title, current_round, status')
      .eq('id', voter.election_id)
      .single()


    if (!election) {
      return NextResponse.json({ error: 'Election not found.' }, { status: 404 })
    }

    // 3. Check if voter is still active
    const voterEliminated =
      voter.eliminated_in_round !== null &&
      voter.eliminated_in_round < election.current_round

    // 4. Check if voter has already voted this round
    const { data: existingVote } = await supabase
      .from('votes')
      .select('id, voted_for_id, reason, voted_for:candidates!votes_voted_for_id_fkey(name)')
      .eq('election_id', election.id)
      .eq('round', election.current_round)
      .eq('voter_id', voter.id)
      .single()

    // 5. Fetch all active candidates except this voter
    const { data: candidates } = await supabase
      .from('candidates')
      .select('id, name')
      .eq('election_id', election.id)
      .is('eliminated_in_round', null)
      .neq('id', voter.id)
      .order('name')

    return NextResponse.json({
      voter: { id: voter.id, name: voter.name },
      election: { title: election.title, round: election.current_round, status: election.status },
      electionId: election.id,       // exposed for client-side Realtime subscriptions
      voterEliminated,
      alreadyVoted: !!existingVote,
      existingVote: existingVote ?? null,
      candidates: candidates ?? [],
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const supabase = getSupabaseAdmin()
    const { token } = params
    const { votedForId, reason } = await request.json() as {
      votedForId: string
      reason?: string
    }

    if (!votedForId) {
      return NextResponse.json({ error: 'Please select someone to vote for.' }, { status: 400 })
    }

    // 1. Find voter
    const { data: voter } = await supabase
      .from('candidates')
      .select('id, election_id, eliminated_in_round')
      .eq('vote_token', token)
      .single()

    if (!voter) {
      return NextResponse.json({ error: 'Invalid voting link.' }, { status: 404 })
    }

    // 2. Fetch election
    const { data: election } = await supabase
      .from('elections')
      .select('id, current_round, status')
      .eq('id', voter.election_id)
      .single()

    if (!election) {
      return NextResponse.json({ error: 'Election not found.' }, { status: 404 })
    }
    if (election.status === 'lobby') {
      return NextResponse.json({ error: 'Voting has not opened yet. Please wait for the admin to start the round.' }, { status: 400 })
    }
    if (election.status === 'completed') {
      return NextResponse.json({ error: 'This election has ended.' }, { status: 400 })
    }

    // 3. Voter must not be eliminated
    if (voter.eliminated_in_round !== null) {
      return NextResponse.json({ error: 'You were not selected to continue in this round.' }, { status: 403 })
    }

    // 4. Cannot vote for yourself
    if (votedForId === voter.id) {
      return NextResponse.json({ error: 'You cannot vote for yourself.' }, { status: 400 })
    }

    // 5. Voted-for candidate must be active
    const { data: candidate } = await supabase
      .from('candidates')
      .select('id, election_id, eliminated_in_round')
      .eq('id', votedForId)
      .single()

    if (!candidate || candidate.election_id !== voter.election_id || candidate.eliminated_in_round !== null) {
      return NextResponse.json({ error: 'That candidate is not in this round.' }, { status: 400 })
    }

    // 6. Insert vote (unique constraint prevents double-voting)
    const { error: insertError } = await supabase.from('votes').insert({
      election_id: election.id,
      round: election.current_round,
      voter_id: voter.id,
      voted_for_id: votedForId,
      reason: reason?.trim() || null,
    })

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'You have already voted in this round.' }, { status: 409 })
      }
      console.error(insertError)
      return NextResponse.json({ error: 'Failed to record vote.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 })
  }
}
