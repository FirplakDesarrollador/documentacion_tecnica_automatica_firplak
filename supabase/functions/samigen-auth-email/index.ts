import { Webhook } from 'npm:standardwebhooks@1.0.0'

type AuthEmailData = {
  email_action_type?: string
  redirect_to?: string
  token_hash?: string
}

type AuthEmailEvent = {
  user?: { email?: string }
  email_data?: AuthEmailData
}

type AutomationMessage = {
  recipient: string
  subject: string
  html: string
  actionType: string
}

const htmlEscape = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

function getMessageCopy(actionType: string) {
  if (actionType === 'invite') {
    return {
      subject: 'Te invitaron a SamiGen | Firplak',
      heading: 'Te damos la bienvenida',
      intro: 'Un administrador te invitó a acceder a SamiGen.',
      buttonLabel: 'Crear mi contraseña',
    }
  }

  if (actionType === 'recovery') {
    return {
      subject: 'Actualiza tu contraseña | SamiGen',
      heading: 'Actualiza tu contraseña',
      intro: 'Solicitaste crear o actualizar la contraseña de acceso a SamiGen.',
      buttonLabel: 'Crear o actualizar contraseña',
    }
  }

  return {
    subject: 'Acceso a SamiGen | Firplak',
    heading: 'Acceso a SamiGen',
    intro: 'Recibimos una solicitud relacionada con tu acceso a SamiGen.',
    buttonLabel: 'Continuar',
  }
}

function buildVerificationUrl(event: AuthEmailEvent) {
  const actionType = event.email_data?.email_action_type?.trim()
  const tokenHash = event.email_data?.token_hash?.trim()
  const redirectTo = event.email_data?.redirect_to?.trim()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')

  if (!actionType || !tokenHash || !redirectTo || !supabaseUrl) {
    return null
  }

  const url = new URL('/auth/v1/verify', supabaseUrl)
  url.searchParams.set('token', tokenHash)
  url.searchParams.set('type', actionType)
  url.searchParams.set('redirect_to', redirectTo)
  return url.toString()
}

function buildMessage(event: AuthEmailEvent): AutomationMessage {
  const recipient = event.user?.email?.trim().toLowerCase()
  const actionType = event.email_data?.email_action_type?.trim() || 'auth'
  const verificationUrl = buildVerificationUrl(event)

  if (!recipient) {
    throw new Error('El evento de Auth no contiene un destinatario.')
  }

  const copy = getMessageCopy(actionType)
  const action = verificationUrl
    ? `<p style="margin:28px 0"><a href="${htmlEscape(verificationUrl)}" style="display:inline-block;background:#27485a;color:#ffffff;padding:13px 20px;border-radius:8px;text-decoration:none;font-weight:700">${copy.buttonLabel}</a></p>`
    : ''

  return {
    recipient,
    subject: copy.subject,
    actionType,
    html: `<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.55;max-width:600px;margin:0 auto"><h1 style="color:#27485a">${copy.heading}</h1><p>${copy.intro}</p>${action}<p style="font-size:13px;color:#64748b">Si no esperabas este correo, puedes ignorarlo.</p></div>`,
  }
}

function errorResponse(message: string, status = 500) {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return errorResponse('Método no permitido.', 405)
  }

  const hookSecret = Deno.env.get('SAMIGEN_SEND_EMAIL_HOOK_SECRET')
  const automationUrl = Deno.env.get('POWER_AUTOMATE_AUTH_EMAIL_URL')

  if (!hookSecret || !automationUrl) {
    return errorResponse('La función de correo no está configurada.', 503)
  }

  try {
    const rawPayload = await request.text()
    const webhook = new Webhook(hookSecret.replace('v1,whsec_', ''))
    const event = webhook.verify(rawPayload, Object.fromEntries(request.headers)) as AuthEmailEvent
    const message = buildMessage(event)
    const automationResponse = await fetch(automationUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(4_000),
    })

    if (!automationResponse.ok) {
      return errorResponse('Power Automate no confirmó el envío del correo.', 502)
    }

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('No se pudo procesar el correo de Auth.', error)
    return errorResponse('No se pudo procesar el correo de acceso.', 500)
  }
})
