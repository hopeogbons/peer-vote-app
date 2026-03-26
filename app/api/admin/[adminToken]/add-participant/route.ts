// POST /api/admin/[adminToken]/add-participant
// Admin manually adds a participant (name + optional email).
// Works in any status so the admin can top up after voting opens if needed.
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sendVotingLink } from '@/lib/email'

export async function POST(
  request: NextRequest,
  { params }: { params: { adminToken: string } },
) {
  try {
    const supabase = getSupabaseAdmin()
    const { name, email } = await request.json() as { name: string; email?: string }

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
    }

    // Verify admin token
    const { data: election } = await supabase
      .from('elections')
      .select('id, title, status')
      .eq('admin_token', params.adminToken)
      .single()

    if (!election) {
      return NextResponse.json({ error: 'Election not found.' }, { status: 404 })
    }

    // Insert candidate
    const { data: candidate, error: insertError } = await supabase
      .from('candidates')
      .insert({
        election_id: election.id,
        name: name.trim(),
        email: email?.trim().toLowerCase() || null,
      })
      .select('id, name, vote_token')
      .single()

    if (insertError || !candidate) {
      return NextResponse.json({ error: 'Failed to add participant.' }, { status: 500 })
    }

    // Send email if address was provided
    let emailSent = false
    if (email?.trim()) {
      try {
        await sendVotingLink({
          to: email.trim(),
          name: name.trim(),
          electionTitle: election.title,
          voteToken: candidate.vote_token,
        })
        emailSent = true
      } catch (emailErr) {
        console.error('Email failed:', emailErr)
      }
    }

    return NextResponse.json({ candidate, emailSent })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error.' }, { status: 500 })
  }
}
