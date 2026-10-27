/**
 * Payment gateway port (billing Model 1: tenants pay the platform).
 *
 * The billing engine (plans, subscriptions, invoices, entitlements) lives in the app and the DB.
 * A gateway adapter only creates a payment link for an invoice and verifies its webhooks.
 * Write the first adapter when the first product needs it.
 */
export interface PaymentGateway {
  readonly name: string
  createCheckout(input: {
    invoiceId: string
    amount: number
    currency: string
    customer: { email: string; name: string }
    returnUrl: string
  }): Promise<{ url: string; reference: string }>
  /** Verifies the signature and normalizes the payload. Throws on an invalid signature. */
  verifyWebhook(request: Request): Promise<PaymentEvent>
}

export type PaymentEvent = {
  /** Gateway's unique event id: stored in payment_events for idempotency. */
  eventId: string
  type: 'paid' | 'expired' | 'failed' | 'refunded'
  /** Our invoice id, as passed to createCheckout. */
  invoiceId: string
  reference: string
  raw: unknown
}
