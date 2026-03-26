-- ============================================================
-- PeerVote — Supabase Database Schema (v2)
-- Run this in your Supabase project: SQL Editor > New query
-- Safe to re-run on a fresh project.
-- ============================================================

-- Drop existing tables if re-running
DROP TABLE IF EXISTS votes CASCADE;
DROP TABLE IF EXISTS candidates CASCADE;
DROP TABLE IF EXISTS elections CASCADE;

-- ── Elections ──────────────────────────────────────────────────────────────────
-- status flow: 'lobby' → 'voting' → 'completed'
CREATE TABLE elections (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title         TEXT NOT NULL,
  admin_token   UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  current_round INTEGER DEFAULT 1 NOT NULL,
  status        TEXT DEFAULT 'lobby'
                  CHECK (status IN ('lobby', 'voting', 'completed')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Candidates ─────────────────────────────────────────────────────────────────
-- Each person is both a candidate (to be voted on) and a voter.
CREATE TABLE candidates (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  election_id         UUID REFERENCES elections(id) ON DELETE CASCADE NOT NULL,
  name                TEXT NOT NULL,
  email               TEXT,               -- optional; used to send voting link
  vote_token          UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  eliminated_in_round INTEGER,            -- NULL = still active
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── Votes ──────────────────────────────────────────────────────────────────────
CREATE TABLE votes (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  election_id   UUID REFERENCES elections(id) ON DELETE CASCADE NOT NULL,
  round         INTEGER NOT NULL,
  voter_id      UUID REFERENCES candidates(id) ON DELETE CASCADE NOT NULL,
  voted_for_id  UUID REFERENCES candidates(id) ON DELETE CASCADE NOT NULL,
  reason        TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (election_id, round, voter_id)   -- one vote per voter per round
);

-- ── Row Level Security ─────────────────────────────────────────────────────────
-- The anon key (used by the browser for Realtime) can only READ elections
-- and candidates. All writes go through server-side API routes (service role).
-- Votes are never readable via the anon key.

ALTER TABLE elections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "elections_public_read"  ON elections  FOR SELECT USING (true);
CREATE POLICY "candidates_public_read" ON candidates FOR SELECT USING (true);
-- No policy on votes → anon key has zero access (service role bypasses RLS)

-- ── Realtime ───────────────────────────────────────────────────────────────────
-- Subscribe clients to live updates when participants join and when
-- the admin opens/closes voting.
ALTER PUBLICATION supabase_realtime ADD TABLE elections;
ALTER PUBLICATION supabase_realtime ADD TABLE candidates;
