import { createTransport } from 'nodemailer'

export type MailMessage = {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
  /** Display name override, e.g. "Acme via App". The address always stays MAIL_FROM's. */
  fromName?: string
}

/** Port: business code depends on this, never on a provider SDK. */
export interface Mailer {
  send(message: MailMessage): Promise<{ id?: string }>
}

export type MailConfig =
  | { driver: 'smtp'; from: string; url: string }
  | { driver: 'resend'; from: string; apiKey: string }
  | { driver: 'memory'; from: string }

function fromHeader(from: string, name?: string): string {
  if (!name) return from
  const address = from.match(/<([^>]+)>/)?.[1] ?? from
  return `"${name.replaceAll('"', '')}" <${address}>`
}

export function createMailer(config: MailConfig): Mailer {
  switch (config.driver) {
    case 'smtp':
      return smtpMailer(config.url, config.from)
    case 'resend':
      return resendMailer(config.apiKey, config.from)
    case 'memory':
      return memoryMailer(config.from)
  }
}

/** Any SMTP server: Mailpit in dev, Amazon SES or others in production. */
export function smtpMailer(url: string, from: string): Mailer {
  const transport = createTransport(url)
  return {
    async send(m) {
      const info = await transport.sendMail({
        from: fromHeader(from, m.fromName),
        to: m.to,
        subject: m.subject,
        html: m.html,
        text: m.text,
        replyTo: m.replyTo,
      })
      return { id: info.messageId }
    },
  }
}

/** Resend over plain fetch: no SDK dependency. */
export function resendMailer(apiKey: string, from: string): Mailer {
  return {
    async send(m) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: fromHeader(from, m.fromName),
          to: [m.to],
          subject: m.subject,
          html: m.html,
          text: m.text,
          reply_to: m.replyTo,
        }),
      })
      if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`)
      const body = (await res.json()) as { id?: string }
      return { id: body.id }
    },
  }
}

export type MemoryMailer = Mailer & { outbox: (MailMessage & { from: string })[] }

/** For tests: keeps sent messages in memory. */
export function memoryMailer(from = 'test@example.com'): MemoryMailer {
  const outbox: MemoryMailer['outbox'] = []
  return {
    outbox,
    async send(m) {
      outbox.push({ ...m, from: fromHeader(from, m.fromName) })
      return { id: `mem-${outbox.length}` }
    },
  }
}
