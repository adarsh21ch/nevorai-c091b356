const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) return null

  try {
    const payload = parts[1]
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')

    return JSON.parse(atob(payload)) as Record<string, unknown>
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const apiKeyHeader = req.headers.get('apikey')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : ''
    const claims = token ? parseJwtClaims(token) : null
    const isInternalServiceRole =
      claims?.role === 'service_role' ||
      (token && token === serviceRoleKey) ||
      (apiKeyHeader && apiKeyHeader === serviceRoleKey)

    if (!isInternalServiceRole) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey
    )

    const { registration_id, landing_page_id } = await req.json()

    if (!registration_id || !landing_page_id) {
      return new Response(JSON.stringify({ error: 'Missing params' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: reg } = await supabase
      .from('landing_page_registrations')
      .select('*')
      .eq('id', registration_id)
      .single()

    if (!reg || !reg.email) {
      return new Response(JSON.stringify({ sent: false, reason: 'No email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: page } = await supabase
      .from('landing_pages')
      .select('*')
      .eq('id', landing_page_id)
      .single()

    // Treat NULL as enabled — column default is true, NULL only on legacy
    // rows that pre-date the toggle. Only an explicit `false` opts out.
    if (!page || page.send_confirmation_email === false) {
      return new Response(JSON.stringify({ sent: false, reason: 'Email disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Plan gate — feature_landing_page_email must be enabled for the owner's plan.
    // STRUCTURAL RULE: fail-OPEN. We only block when we can unambiguously prove
    // the plan has the feature disabled. Any uncertainty (missing column,
    // unresolved plan, lookup error) → allow the email. Better a free user
    // gets a confirmation than a paying user silently loses leads.
    const ownerId = (page as any).owner_id
    const tierRank: Record<string, number> = { free: 0, basic: 1, pro: 2 }
    let planName = 'free'
    let chosenTier: string | null = null
    let profileFallback: string | null = null
    let subRowsFound = 0

    if (ownerId) {
      // (b) Try user_subscriptions for active/trialing rows w/ valid expires_at
      const nowIso = new Date().toISOString()
      const { data: subs, error: subErr } = await supabase
        .from('user_subscriptions')
        .select('tier, status, expires_at')
        .eq('user_id', ownerId)
        .in('status', ['active', 'trialing'])
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      if (subErr) {
        console.warn('[plan-gate] sub lookup error — failing OPEN:', subErr.message)
      }
      subRowsFound = subs?.length ?? 0
      if (subs && subs.length) {
        const valid = subs.filter((s: any) => !!s.tier)
        valid.sort((a: any, b: any) => (tierRank[b.tier] ?? -1) - (tierRank[a.tier] ?? -1))
        if (valid[0]?.tier) {
          chosenTier = valid[0].tier
          planName = chosenTier!
        }
      }

      // (c) Fallback to profiles.subscription_status if no sub row matched
      if (!chosenTier) {
        const { data: profile, error: profErr } = await supabase
          .from('profiles')
          .select('subscription_status')
          .eq('id', ownerId)
          .maybeSingle()
        if (profErr) {
          console.warn('[plan-gate] profile lookup error — failing OPEN:', profErr.message)
        }
        const raw = (profile as any)?.subscription_status?.toString().toLowerCase() ?? null
        profileFallback = raw
        if (raw) {
          // map trial / trialing → pro-equivalent access; explicit tier names pass through
          if (raw === 'trial' || raw === 'trialing') planName = 'pro'
          else if (raw === 'pro' || raw === 'basic' || raw === 'free') planName = raw
          else if (raw === 'active') planName = 'basic' // safe assumption
        }
      }
    }

    console.log('[plan-gate]', {
      ownerId,
      subRowsFound,
      chosenTier,
      profileFallback,
      finalPlanName: planName,
    })

    const { data: planCfg, error: planErr } = await supabase
      .from('plan_config')
      .select('plan_name, feature_landing_page_email')
      .eq('plan_name', planName)
      .maybeSingle()
    console.log('[plan-gate] planCfg lookup', { queriedPlanName: planName, planCfg, err: planErr?.message })

    // Only block on an explicit `false`. Missing row / missing column / error → allow.
    if (planCfg && (planCfg as any).feature_landing_page_email === false) {
      console.log('[plan-gate] BLOCKED', { planName, planCfg })
      return new Response(
        JSON.stringify({ sent: false, reason: 'plan_upgrade_required', resolved_plan_name: planName }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    console.log('[plan-gate] ALLOWED', { planName, planCfg })


    // Use sender_display_name from landing page settings; fall back to platform name
    const senderDisplayName = ((page as any).sender_display_name || 'Nevorai').trim() || 'Nevorai'
    const isPlatformSender = senderDisplayName === 'Nevorai' || senderDisplayName === 'nFlow'
    const trustBadgeText = isPlatformSender ? 'Verified by Nevorai' : 'Sent via Nevorai'
    const trustBadgeIcon = isPlatformSender
      ? '&#10003;'  // checkmark
      : '&#9656;'   // arrow

    const safeName = reg.name || 'there'
    const safeEmail = reg.email || ''
    const safePhone = reg.phone || ''
    const emailHeading = escapeHtml(page.email_heading || 'You are registered!')
    const emailFooter = page.email_footer_text ? escapeHtml(page.email_footer_text) : ''

    let emailBody = escapeHtml(page.email_body || '')
      .replace(/\{\{name\}\}/g, escapeHtml(safeName))
      .replace(/\{\{email\}\}/g, escapeHtml(safeEmail))
      .replace(/\{\{phone\}\}/g, escapeHtml(safePhone))

    let subject = String(page.email_subject || 'Registration Confirmed')
      .replace(/\{\{name\}\}/g, safeName)

    // Build optional enrichment blocks
    const bannerUrl: string | null = (page as any).email_banner_url || null
    const sessionLink: string | null = (page as any).session_link || null
    const resourceLink: string | null = (page as any).resource_link || null
    const sessionDatetime: string | null = (page as any).session_datetime || null
    const attachmentPdfUrl: string | null = (page as any).attachment_pdf_url || null

    let calendarUrl: string | null = null
    let sessionDateHuman: string | null = null
    if (sessionDatetime) {
      try {
        const start = new Date(sessionDatetime)
        const end = new Date(start.getTime() + 60 * 60 * 1000) // +1h default
        const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
        const dates = `${fmt(start)}/${fmt(end)}`
        const calParams = new URLSearchParams({
          action: 'TEMPLATE',
          text: page.title || 'Session',
          dates,
          details: page.description || '',
        })
        calendarUrl = `https://calendar.google.com/calendar/render?${calParams.toString()}`
        sessionDateHuman = start.toLocaleString('en-IN', {
          weekday: 'short', day: 'numeric', month: 'long',
          hour: 'numeric', minute: '2-digit', hour12: true,
          timeZone: 'Asia/Kolkata',
        })
      } catch (e) {
        console.warn('Failed to build calendar url:', (e as Error).message)
      }
    }

    const bannerBlock = bannerUrl
      ? `<div style="margin: -32px -32px 24px; overflow: hidden; border-radius: 12px 12px 0 0;">
           <img src="${bannerUrl}" alt="" style="width: 100%; height: auto; display: block;" />
         </div>`
      : ''

    const sessionButtonBlock = sessionLink
      ? `<div style="margin: 24px 0; text-align: center;">
           <a href="${sessionLink}" style="display: inline-block; padding: 14px 32px; background: #22c55e; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">Join the Session &rarr;</a>
         </div>`
      : ''

    const resourceRowBlock = resourceLink
      ? `<div style="margin: 16px 0; padding: 12px 16px; background: #f5f5f5; border-radius: 8px;">
           <a href="${resourceLink}" style="color: #1a1a1a; text-decoration: none; font-size: 14px; font-weight: 500;">📺 Watch / View Resource</a>
         </div>`
      : ''

    const calendarBlock = calendarUrl
      ? `<div style="margin: 12px 0; text-align: center;">
           <a href="${calendarUrl}" style="color: #22c55e; text-decoration: none; font-size: 14px; font-weight: 500;">📅 Add to Google Calendar${sessionDateHuman ? ` &middot; ${sessionDateHuman} IST` : ''}</a>
         </div>`
      : ''

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #ffffff; color: #1a1a1a; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e5e5e5;">
    ${bannerBlock}
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #22c55e; font-size: 20px; margin: 0;">Nevorai</h1>
    </div>
    <h2 style="font-size: 22px; margin: 0 0 16px; color: #1a1a1a;">${emailHeading}</h2>
    <div style="font-size: 15px; line-height: 1.7; color: #555555; white-space: pre-line;">${emailBody}</div>
    ${sessionButtonBlock}
    ${calendarBlock}
    ${resourceRowBlock}
    ${emailFooter ? `<div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 13px; color: #999999; white-space: pre-line;">${emailFooter}</div>` : ''}
    <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #f0f0f0; text-align: center;">
      <span style="display: inline-block; font-size: 11px; color: #b0b0b0; letter-spacing: 0.5px; font-weight: 500;">
        <span style="display: inline-block; width: 16px; height: 16px; line-height: 16px; text-align: center; background: #f5f5f5; border-radius: 50%; font-size: 9px; color: #22c55e; margin-right: 5px; vertical-align: middle;">${trustBadgeIcon}</span>
        ${trustBadgeText}
      </span>
    </div>
  </div>
</body>
</html>`

    // If PDF attachment is configured, fetch + base64 encode (best-effort).
    let attachments: Array<{ filename: string; content: string; mimeType: string }> | undefined
    if (attachmentPdfUrl) {
      try {
        const pdfRes = await fetch(attachmentPdfUrl)
        if (pdfRes.ok) {
          const buf = new Uint8Array(await pdfRes.arrayBuffer())
          let binary = ''
          for (const b of buf) binary += String.fromCharCode(b)
          const b64 = btoa(binary)
          const filename = attachmentPdfUrl.split('/').pop()?.split('?')[0] || 'attachment.pdf'
          attachments = [{ filename, content: b64, mimeType: 'application/pdf' }]
        } else {
          console.warn('PDF fetch failed:', pdfRes.status)
        }
      } catch (e) {
        console.warn('PDF fetch error:', (e as Error).message)
      }
    }

    // Send via Gmail edge function. Authenticate as backend with the service
    // key in the apikey header so the gateway treats it as a service API key.
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!

    const gmailRes = await fetch(`${supabaseUrl}/functions/v1/send-gmail-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
      },
      body: JSON.stringify({
        to: reg.email,
        subject,
        html,
        sender_name: senderDisplayName,
      }),
    })

    const result = await gmailRes.json()

    if (!gmailRes.ok || !result.sent) {
      console.error('Gmail send error:', JSON.stringify(result))
      throw new Error(result.error || 'Failed to send email via Gmail')
    }

    console.log('Email sent result:', JSON.stringify(result))

    // Update registration
    await supabase.from('landing_page_registrations').update({
      confirmation_email_sent: true,
      confirmation_email_sent_at: new Date().toISOString(),
    }).eq('id', registration_id)

    return new Response(JSON.stringify({ sent: true, resolved_plan_name: planName }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error('Email error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})