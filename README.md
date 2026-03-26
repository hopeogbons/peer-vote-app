# 🗳️ PeerVote

A multi-round peer voting web app with self-registration, automatic email delivery, real-time lobby, and admin-controlled voting rounds.

---

## How it works

1. **Admin creates an election** — enters a title, gets an admin link and a registration link.
2. **Admin shares the registration link** with everyone they want to invite.
3. **Participants sign up** with their name and email — they instantly receive their personal voting link by email.
4. **The lobby fills up in real-time** — admin watches the list grow live.
5. **Admin clicks "Open Voting"** — the ballot appears for everyone.
6. **Everyone votes** — selects one person and optionally explains why.
7. **Admin clicks "End Round & Advance"** — anyone with ≥ 1 vote moves to the next round.
8. **Repeat** until a winner emerges.

---

## Quick Setup (~15 minutes)

### Step 1 — Create a free Supabase project

1. Go to [supabase.com](https://supabase.com) → **New Project** (free tier is enough)
2. Once ready, go to **SQL Editor → New query**
3. Paste the contents of `supabase/schema.sql` and click **Run**
4. Go to **Database → Replication** → make sure `candidates` and `elections` are enabled under **Supabase Realtime** (the schema already runs `ALTER PUBLICATION`, but verify in the UI)

### Step 2 — Get your Supabase credentials

In your project → **Settings → API**:
- Copy the **Project URL** (`NEXT_PUBLIC_SUPABASE_URL`)
- Copy the **anon / public** key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- Reveal and copy the **service_role secret** key (`SUPABASE_SERVICE_ROLE_KEY`)

### Step 3 — Set up Resend (email delivery)

1. Create a free account at [resend.com](https://resend.com)
2. Go to **API Keys → Create API Key** (`RESEND_API_KEY`)
3. For testing: use `onboarding@resend.dev` as `RESEND_FROM_EMAIL` — this only delivers to your own Resend-registered email address
4. For production: [verify your domain](https://resend.com/docs/send-with-custom-domain) and use `noreply@yourdomain.com`

### Step 4 — Deploy to Vercel

1. Push this project to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → **New Project** → import the repo
3. Add these **Environment Variables** before deploying:

   | Variable                       | Value                                             |
   |-------------------------------|---------------------------------------------------|
   | `NEXT_PUBLIC_SUPABASE_URL`    | Your Supabase project URL                         |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon/public key                   |
   | `SUPABASE_SERVICE_ROLE_KEY`   | Your Supabase service_role key (keep secret)      |
   | `RESEND_API_KEY`              | Your Resend API key                               |
   | `RESEND_FROM_EMAIL`           | `PeerVote <noreply@yourdomain.com>`               |
   | `NEXT_PUBLIC_APP_URL`         | Your Vercel URL e.g. `https://my-app.vercel.app`  |

4. Click **Deploy**

### Step 5 — Use the app

1. Open your Vercel URL → enter a title → **Create Election**
2. You'll land on the **admin dashboard** — **bookmark this URL** (it's secret and permanent)
3. Copy the **Registration Link** and share it with participants
4. Watch the lobby fill up in real time
5. When ready, click **▶ Open Voting**
6. After everyone votes, click **⏭ End Round & Advance**
7. Repeat rounds until done

---

## Local Development

```bash
git clone <repo>
cd peer-vote-app
npm install

# Copy env template and fill in values
cp .env.example .env.local

npm run dev
# Open http://localhost:3000
```

Set `NEXT_PUBLIC_APP_URL=http://localhost:3000` in `.env.local`.

---

## Project Structure

```
peer-vote-app/
├── app/
│   ├── page.tsx                              # Home: create election
│   ├── register/[electionId]/page.tsx        # Public self-registration (real-time lobby)
│   ├── admin/[adminToken]/page.tsx           # Admin dashboard (lobby + voting + results)
│   ├── vote/[token]/page.tsx                 # Voter page (lobby wait → ballot → confirmation)
│   └── api/
│       ├── elections/route.ts                # POST: create election
│       ├── admin/[adminToken]/route.ts       # GET: admin data
│       ├── admin/[adminToken]/control/       # POST: open-voting | end-election
│       ├── admin/[adminToken]/add-participant/  # POST: manually add a participant
│       ├── advance/[adminToken]/route.ts     # POST: advance round / DELETE: end
│       ├── register/[electionId]/route.ts    # POST: self-register + send email
│       └── vote/[token]/route.ts             # GET: ballot / POST: submit vote
├── lib/
│   ├── supabase.ts                           # Supabase admin + browser clients
│   └── email.ts                             # Resend email helper
├── supabase/
│   └── schema.sql                           # Database tables, RLS, Realtime
└── .env.example
```

---

## Security Notes

- **Admin token** in your admin URL — keep it private
- **Vote tokens** are one-per-person — they can vote but not view results
- **Supabase anon key** is exposed to the browser but is safe — it can only read elections and candidates (RLS enforced). All writes go through server-side API routes using the service role key
- **Service role key** is only on the server (API routes) — never sent to the browser
- Votes are unique-constrained per `(election, round, voter)` — no double voting possible
