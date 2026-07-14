import { prisma } from '../lib/prisma.js';

/**
 * Notification dispatch. In-app notifications are persisted directly;
 * EMAIL / SMS / PUSH are delivered through pluggable providers so the
 * platform can swap in AWS SES, an SMS gateway (e.g. an MCMC-registered
 * provider), and FCM/APNs without touching call sites.
 */
export interface DeliveryProvider {
  send(to: string, title: string, body: string): Promise<void>;
}

const providers: { email?: DeliveryProvider; sms?: DeliveryProvider; push?: DeliveryProvider } =
  {};

export function registerProvider(
  channel: 'email' | 'sms' | 'push',
  provider: DeliveryProvider
): void {
  providers[channel] = provider;
}

export function emailProviderConfigured(): boolean {
  return !!providers.email;
}

/** Send a transactional email if a provider is configured (best-effort). */
export async function deliverEmail(to: string, subject: string, body: string): Promise<void> {
  if (!providers.email) return;
  await providers.email.send(to, subject, body);
}

export async function notify(
  userId: string,
  type: string,
  title: string,
  body: string
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, phone: true },
  });
  if (!user) return;

  await prisma.notification.create({
    data: { userId, channel: 'IN_APP', type, title, body },
  });

  // Best-effort external delivery — never blocks the business operation.
  if (providers.email) {
    providers.email.send(user.email, title, body).catch((e) => {
      console.warn('[notify] email delivery failed:', e.message);
    });
  }
  if (providers.sms && user.phone) {
    providers.sms.send(user.phone, title, body).catch((e) => {
      console.warn('[notify] sms delivery failed:', e.message);
    });
  }
}
