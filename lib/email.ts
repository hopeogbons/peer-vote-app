import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = process.env.RESEND_FROM_EMAIL ?? 'PeerVote <onboarding@resend.dev>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

// ── Send voting link to a newly registered participant ────────────────────────
export async function sendVotingLink({
  to,
  name,
  electionTitle,
  voteToken,
}: {
  to: string
  name: string
  electionTitle: string
  voteToken: string
}) {
  const votingLink = `${APP_URL}/vote/${voteToken}`

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `You're registered for "${electionTitle}"`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8f7ff; margin: 0; padding: 32px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; padding: 40px; box-shadow: 0 1px 4px rgba(0,0,0,0.08);">
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 24px;">
      <span style="font-size: 28px;">🗳️</span>
      <span style="font-size: 22px; font-weight: 800; color: #5b21b6;">PeerVote</span>
    </div>

    <h2 style="margin: 0 0 8px; color: #111827; font-size: 20px;">Hi ${name} 👋</h2>
    <p style="color: #4b5563; margin: 0 0 24px; line-height: 1.6;">
      You're registered for <strong style="color: #7c3aed;">${electionTitle}</strong>.
      Voting hasn't started yet — the admin will open the round shortly.
    </p>

    <p style="color: #374151; font-weight: 600; margin: 0 0 12px;">Your personal voting link:</p>
    <a href="${votingLink}"
       style="display: block; text-align: center; padding: 14px 24px; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: white; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 15px; margin-bottom: 12px;">
      Open My Ballot →
    </a>
    <p style="color: #9ca3af; font-size: 12px; word-break: break-all; margin: 0 0 24px;">${votingLink}</p>

    <div style="background: #fdf4ff; border: 1px solid #e9d5ff; border-radius: 8px; padding: 14px; margin-bottom: 24px;">
      <p style="margin: 0; color: #6d28d9; font-size: 13px; font-weight: 600;">🔒 Keep this link private</p>
      <p style="margin: 4px 0 0; color: #7c3aed; font-size: 13px;">It's unique to you and works across all voting rounds.</p>
    </div>

    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 0 0 16px;" />
    <p style="color: #9ca3af; font-size: 12px; margin: 0;">Sent by PeerVote. You received this because you signed up for "${electionTitle}".</p>
  </div>
</body>
</html>
    `.trim(),
  })

  if (error) {
    console.error('Resend error:', error)
    throw new Error(`Failed to send email: ${JSON.stringify(error)}`)
  }
}
