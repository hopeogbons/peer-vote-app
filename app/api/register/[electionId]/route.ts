// POST /api/register/[electionId]
// Public self-registration: participant submits name + email, receives voting link by email.
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { sendVotingLink } from '@/lib/email'

export async function POST(
  request: NextRequest,
  { params }: { params: { electionId: string } },
) {
  try {
    const supabase = getSupabaseAdmin()
    const { name, email } = await request.json() as { name: string; email: string }

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
    }
    if (!email?.trim() || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 })
    }

    // 1. Fetch election — must exist and be in 'lobby' status
    const { data: election } = await supabase
      .from('elections')
      .select('id, title, status')
      .eq('id', params.electionId)
      .single()

    if (!election) {
      return NextResponse.json({ error: 'Election not found.' }, { status: 404 })
    }
    if (election.status !== 'lobby') {
      return NextResponse.json(
        { error: 'Registration is closed. The admin has already opened voting.' },
        { status: 403 },
      )
    }

    // 2. Check if this email is already registered
    const { data: existing } = await supabase
      .from('candidates')
      .select('id, vote_token')
      .eq('election_id', election.id)
      .ilike('email', email.trim())
      .single()

    if (existing) {
      // Resend the email with their existing link
      try {
        await sendVotingLink({
          to: email.trim(),
          name: name.trim(),
          electionTitle: election.title,
          voteToken: existing.vote_token,
        })
      } catch (emailErr) {
        console.error('Re-send email failed:', emailErr)
      }
      return NextResponse.json({
        alreadyRegistered: true,
        message: "You're already registered! We've resent your voting link to your email.",
      })
    }

    // 3. Create candidate record
    const { data: candidate, error: insertError } = await supabase
      .from('candidates')
      .insert({
        election_id: election.id,
        name: name.trim(),
        email: email.trim().toLowerCase(),
      })
      .select('vote_token')
      .single()

    if (insertError || !candidate) {
      console.error(insertError)
      return NextResponse.json({ error: 'Failed to register. Please try again.' }, { status: 500 })
    }

    // 4. Send email with voting link
    let emailSent = true
    try {
      await sendVotingLink({
        to: email.trim(),
        name: name.trim(),
        electionTitle: election.title,
        voteToken: candidate.vote_token,
      })
    } catch (emailErr) {
      console.error('Email failed to send:', emailErr)
      emailSent = false
    }

    return NextResponse.json({
      success: true,
      emailSent,
      // Return the voting link so the page can show it as a fallback if email fails
      voteToken: candidate.vote_token,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 })
  }
}
