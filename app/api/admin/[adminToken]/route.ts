// GET /api/admin/[adminToken] - full election state for the admin dashboard
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(
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

    // 2. Fetch all candidates
    const { data: candidates, error: candidateError } = await supabase
      .from('candidates')
      .select('id, name, vote_token, eliminated_in_round')
      .eq('election_id', election.id)
      .order('name')

    if (candidateError) {
      return NextResponse.json({ error: 'Failed to fetch candidates.' }, { status: 500 })
    }

    // 3. Fetch all votes for this election (all rounds)
    const { data: votes, error: votesError } = await supabase
      .from('votes')
      .select(`
        id,
        round,
        reason,
        voter:candidates!votes_voter_id_fkey ( id, name ),
        voted_for:candidates!votes_voted_for_id_fkey ( id, name )
      `)
      .eq('election_id', election.id)
      .order('created_at', { ascending: true })

    if (votesError) {
      return NextResponse.json({ error: 'Failed to fetch votes.' }, { status: 500 })
    }

    return NextResponse.json({ election, candidates, votes })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 })
  }
}
