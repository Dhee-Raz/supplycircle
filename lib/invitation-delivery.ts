export type DeliveryConfig = {
  RESEND_API_KEY?: string;
  INVITATION_EMAIL_FROM?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
};

export async function deliverInvitation(config: DeliveryConfig, identifier: string, inviteUrl: string, send: typeof fetch = fetch) {
  const channel = identifier.includes('@') ? 'email' : 'sms';
  const text = `You have been invited to join your team on SupplyCircle. Open this link and sign in or create an account using ${identifier}:\n${inviteUrl}\nThis invitation expires in 7 days. If you were not expecting it, you can ignore this message.`;
  const unavailable = { channel, status: 'not_configured' as const };
  let endpoint: string;
  let options: RequestInit;
  if (channel === 'email') {
    if (!config.RESEND_API_KEY || !config.INVITATION_EMAIL_FROM) return unavailable;
    endpoint = 'https://api.resend.com/emails';
    options = {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.INVITATION_EMAIL_FROM, to: [identifier], subject: 'Your SupplyCircle team invitation', text }),
    };
  } else {
    if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN || !config.TWILIO_FROM_NUMBER) return unavailable;
    endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.TWILIO_ACCOUNT_SID)}/Messages.json`;
    options = {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: identifier, From: config.TWILIO_FROM_NUMBER, Body: text }).toString(),
    };
  }
  try {
    const response = await send(endpoint, { ...options, signal: AbortSignal.timeout(10000) });
    // Acceptance by a provider does not guarantee delivery to the recipient.
    return { channel, status: response.ok ? 'accepted' as const : 'failed' as const };
  } catch {
    return { channel, status: 'failed' as const };
  }
}
