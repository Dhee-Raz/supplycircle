import assert from 'node:assert/strict';
import { deliverInvitation } from '../lib/invitation-delivery.ts';

const link = 'https://supplycircle.example/#invite=test-token';
let calls = 0;
const config = { RESEND_API_KEY: 'test-key', INVITATION_EMAIL_FROM: 'team@example.test', TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'test-token', TWILIO_FROM_NUMBER: '+13125550123' };
const send = async (url, options) => {
  calls++;
  if (url.includes('resend')) {
    const body = JSON.parse(options.body);
    assert.deepEqual(body.to, ['employee@example.test']);
    assert.ok(body.text.includes(link));
    assert.equal(options.headers.Authorization, 'Bearer test-key');
  } else {
    const body = new URLSearchParams(options.body);
    assert.equal(body.get('To'), '+13125550124');
    assert.equal(body.get('From'), config.TWILIO_FROM_NUMBER);
    assert.ok(body.get('Body').includes(link));
    assert.equal(options.headers.Authorization, `Basic ${btoa('ACtest:test-token')}`);
  }
  return new Response('{}', { status: 201 });
};
assert.equal((await deliverInvitation({}, 'employee@example.test', link, send)).status, 'not_configured');
assert.equal((await deliverInvitation({}, '+13125550124', link, send)).status, 'not_configured');
assert.equal(calls, 0);
assert.deepEqual(await deliverInvitation(config, 'employee@example.test', link, send), { channel: 'email', status: 'accepted' });
assert.deepEqual(await deliverInvitation(config, '+13125550124', link, send), { channel: 'sms', status: 'accepted' });
assert.equal((await deliverInvitation(config, 'employee@example.test', link, async () => new Response('', { status: 403 }))).status, 'failed');
assert.equal((await deliverInvitation(config, '+13125550124', link, async () => { throw new Error('network'); })).status, 'failed');
console.log('Invitation delivery checks passed (mock providers; no messages sent).');
