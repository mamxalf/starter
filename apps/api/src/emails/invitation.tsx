import { Body, Button, Container, Heading, Html, Preview, Text } from '@react-email/components'
import type { Locale } from '@starter/contracts'
import { m } from '@starter/i18n'

export type InvitationProps = {
  tenantName: string
  inviterName: string
  acceptUrl: string
}

export function invitationSubject(p: InvitationProps, locale: Locale): string {
  return m.email_invite_subject({ inviter: p.inviterName, tenant: p.tenantName }, { locale })
}

export function InvitationEmail(props: InvitationProps & { locale: Locale }) {
  const { locale } = props
  return (
    <Html lang={locale}>
      <Preview>{invitationSubject(props, locale)}</Preview>
      <Body style={{ fontFamily: 'system-ui, sans-serif', background: '#f6f6f6', padding: 24 }}>
        <Container style={{ background: '#ffffff', padding: 32, borderRadius: 8, maxWidth: 480 }}>
          <Heading as="h2">{props.tenantName}</Heading>
          <Text>{m.email_invite_body({ tenant: props.tenantName }, { locale })}</Text>
          <Button
            href={props.acceptUrl}
            style={{ background: '#111', color: '#fff', padding: '12px 20px', borderRadius: 6 }}
          >
            {m.email_invite_cta({}, { locale })}
          </Button>
        </Container>
      </Body>
    </Html>
  )
}
