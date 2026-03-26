// POST /api/admin/[adminToken]/control
// Body: { action: 'open-voting' | 'end-election' }
// open-voting: transition from 'lobby' → 'voting'
// end-election: transition to 'completed'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(
  request: NextRequest,
  { params }: { params: { adminToken: string } },
) {
  try {
    const supabase = getSupabaseAdmin()
    const { action } = await request.json() as { action: 'open-voting' | 'end-election' }

    const { data: election } = await supabase
      .from('elections')
      .select('id, status, current_round')
      .eq('admin_token', params.adminToken)
      .single()

    if (!election) {
      return NextResponse.json({ error: 'Election not found.' }, { status: 404 })
    }

    if (action === 'open-voting') {
      if (election.status !== 'lobby') {
        return NextResponse.json({ error: 'Voting is already open or the election has ended.' }, { status: 400 })
      }

      // Need at least 2 participants to open voting
      const { count } = await supabase
        .from('candidates')
        .select('id', { count: 'exact', head: true })
        .eq('election_id', election.id)
        .is('eliminated_in_round', null)

      if (!count || count < 2) {
        return NextResponse.json({ error: 'At least 2 participants must register before you can open voting.' }, { status: 400 })
      }

      await supabase.from('elections').update({ status: 'voting' }).eq('id', election.id)
      return NextResponse.json({ status: 'voting' })
    }

    if (action === 'end-election') {
      await supabase.from('elections').update({ status: 'completed' }).eq('id', election.id)
      return NextResponse.json({ status: 'completed' })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 })
  }
}
