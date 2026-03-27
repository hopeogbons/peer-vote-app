// POST /api/elections - create a new election with a list of candidates
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { title, candidates } = await request.json() as {
      title: string
      candidates: string[]
    }

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Election title is required.' }, { status: 400 })
    }
    const cleanedNames = (candidates ?? [])
      .map((n: string) => n.trim())
      .filter((n: string) => n.length > 0)

    const supabase = getSupabaseAdmin()

    // 1. Create election
    const { data: election, error: electionError } = await supabase
      .from('elections')
      .insert({ title: title.trim(), current_round: 1, status: 'lobby' })
      .select()
      .single()

    if (electionError || !election) {
      console.error(electionError)
      return NextResponse.json({ error: 'Failed to create election.' }, { status: 500 })
    }

    // 2. Create candidate rows
    const rows = cleanedNames.map((name: string) => ({
      election_id: election.id,
      name,
    }))

    const { error: candidateError } = await supabase.from('candidates').insert(rows)
    if (candidateError) {
      console.error(candidateError)
      return NextResponse.json({ error: 'Failed to add candidates.' }, { status: 500 })
    }

    return NextResponse.json({ adminToken: election.admin_token })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 })
  }
}
