import { render } from '@react-email/components'
import type { Locale } from '@starter/contracts'
import { InvitationEmail, type InvitationProps, invitationSubject } from './invitation'

/**
 * Template registry. Add a template: create the component, add a case here,
 * add its props to EmailPayload in jobs/definitions.ts.
 */
export type EmailTemplate = { template: 'invitation'; props: InvitationProps }

export async function renderEmail(email: EmailTemplate, locale: Locale) {
  switch (email.template) {
    case 'invitation': {
      const element = <InvitationEmail {...email.props} locale={locale} />
      return {
        subject: invitationSubject(email.props, locale),
        html: await render(element),
        text: await render(element, { plainText: true }),
      }
    }
  }
}
