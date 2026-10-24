import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://127.0.0.1:8788';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Integration checks must use a disposable local database.');
const run = Date.now().toString(36);
const password = 'stock together test password!';
const users = {
  owner: { name: 'Owner', username: `owner_${run}`, identifier: `owner_${run}@example.test`, password },
  employee: { name: 'Employee', username: `employee_${run}`, identifier: `employee_${run}@example.test`, password },
  partner: { name: 'Partner', username: `partner_${run}`, identifier: `+1${String(Date.now()).slice(-10)}`, password },
  outsider: { name: 'Outsider', username: `outsider_${run}`, identifier: `outsider_${run}@example.test`, password },
};
function client() {
  let cookie = '';
  return {
    cookie: () => cookie,
    async request(path = '/api/data', body, extra = {}) {
      const headers = { ...(cookie ? { Cookie: cookie } : {}), ...extra };
      if (body) headers['Content-Type'] = 'application/json';
      const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      return { status: response.status, data: await response.json(), cookie: setCookie, cache: response.headers.get('cache-control') };
    },
  };
}
const owner = client(), employee = client(), partner = client(), outsider = client();
assert.equal((await fetch(base)).status, 200);
assert.equal((await owner.request()).status, 401);
assert.equal((await owner.request('/api/auth', { action: 'signup', ...users.owner, password: 'short' })).status, 400);
const signedUp = await owner.request('/api/auth', { action: 'signup', ...users.owner, role: 'owner' });
assert.equal(signedUp.status, 200, JSON.stringify(signedUp.data));
assert.match(signedUp.cookie, /HttpOnly/);
assert.match(signedUp.cookie, /SameSite=Lax/);
assert.equal(signedUp.cache, 'no-store');
assert.ok(signedUp.data.user.id);
assert.ok(!JSON.stringify(signedUp.data).includes('passwordHash'));
assert.equal((await owner.request()).data.onboarding, true);
assert.equal((await owner.request('/api/data', { action: 'setup', business: 'QA business', store: 'Original store', location: 'Old road' })).status, 200);
let state = (await owner.request()).data;
assert.equal(state.items.length, 0);
assert.equal(state.members.length, 1);
const storeId = state.stores[0].id, ownerId = state.user.id;
assert.equal((await owner.request('/api/data', { action: 'editStore', id: storeId, name: 'Renamed store', location: 'New road' })).status, 200);
assert.equal((await owner.request()).data.stores[0].name, 'Renamed store');
assert.equal((await owner.request('/api/auth', { action: 'profile', name: 'Changed Owner', username: `changed_${run}` })).status, 200);
state = (await owner.request()).data;
assert.equal(state.user.id, ownerId);
assert.equal(state.user.name, 'Changed Owner');
assert.equal((await outsider.request('/api/auth', { action: 'signup', ...users.outsider, username: `CHANGED_${run}` })).status, 409);
assert.equal((await outsider.request('/api/auth', { action: 'signup', ...users.outsider, identifier: users.owner.identifier.toUpperCase() })).status, 409);
assert.equal((await employee.request('/api/auth', { action: 'signup', ...users.employee })).status, 200);
assert.equal((await partner.request('/api/auth', { action: 'signup', ...users.partner })).status, 200);
assert.equal((await outsider.request('/api/auth', { action: 'signup', ...users.outsider })).status, 200);
for (const [person, role] of [['employee', 'employee'], ['partner', 'partner']]) {
  const invitation = await owner.request('/api/data', { action: 'invite', name: users[person].name, identifier: users[person].identifier, role, ...(role === 'employee' ? { storeId } : {}) });
  assert.equal(invitation.status, 200);
  const token = new URL(invitation.data.inviteUrl).hash.split('=')[1];
  assert.equal((await outsider.request('/api/data', { action: 'join', token })).status, 400);
  const target = person === 'employee' ? employee : partner;
  assert.equal((await target.request('/api/data', { action: 'join', token })).status, 200);
  assert.equal((await target.request('/api/data', { action: 'join', token })).status, 400);
  assert.equal((await target.request()).data.member.role, role);
}
assert.equal((await employee.request('/api/data', { action: 'editStore', id: storeId, name: 'Bad edit' })).status, 403);
assert.equal((await partner.request('/api/data', { action: 'addStore', name: 'Bad store' })).status, 403);
assert.equal((await employee.request('/api/data', { action: 'invite', name: 'Bad', identifier: 'bad@example.test', role: 'owner' })).status, 403);
const stock = { action: 'addItem', store: storeId, name: 'Real stock request', quantity: 3, unit: 'boxes', category: 'Supplies', priority: 'urgent', note: 'Please order' };
assert.equal((await employee.request('/api/data', { ...stock, quantity: -1 })).status, 400);
assert.equal((await employee.request('/api/data', stock)).status, 200);
state = (await partner.request()).data;
let item = state.items[0];
assert.equal(item.addedById, (await employee.request()).data.user.id);
assert.equal(state.stores[0].name, 'Renamed store');
assert.equal((await employee.request('/api/data', { action: 'editItem', id: item.id, name: 'Updated stock request', quantity: 5, unit: 'boxes', category: 'Supplies', priority: 'normal', note: 'Updated' })).status, 200);
assert.equal((await employee.request('/api/data', { action: 'editItem', id: item.id, name: 'Invalid', quantity: 0, unit: 'boxes', category: 'Supplies' })).status, 400);
assert.equal((await employee.request()).data.items[0].name, 'Updated stock request');
assert.equal((await outsider.request('/api/data', { action: 'deleteItem', id: item.id })).status, 403);
assert.equal((await employee.request('/api/data', { action: 'deleteItem', id: item.id })).status, 200);
assert.equal((await partner.request()).data.items.length, 0);
assert.equal((await employee.request('/api/data', stock)).status, 200);
state = (await partner.request()).data;
const replacementItem = state.items[0];
item = replacementItem;
assert.equal((await employee.request('/api/data', { action: 'buy', id: item.id })).status, 403);
assert.equal((await partner.request('/api/data', { action: 'buy', id: item.id })).status, 200);
assert.equal((await owner.request('/api/data', { action: 'buy', id: item.id })).status, 400);
state = (await employee.request()).data;
assert.equal(state.items[0].boughtById, (await partner.request()).data.user.id);
assert.equal(state.items[0].status, 'bought');
assert.equal((await outsider.request('/api/data', { action: 'setup', business: 'Other business', store: 'Other store' })).status, 200);
assert.equal((await outsider.request()).data.items.length, 0);
assert.equal((await outsider.request('/api/data', { action: 'editStore', id: storeId, name: 'Cross-workspace edit' })).status, 404);
assert.equal((await outsider.request('/api/data', { action: 'buy', id: item.id })).status, 400);
assert.equal((await outsider.request('/api/data', stock)).status, 400);
assert.equal((await owner.request('/api/data', { action: 'reopen', id: item.id })).status, 200);
assert.equal((await owner.request('/api/data', { action: 'addStore', name: 'CSRF' }, { Origin: 'https://evil.example' })).status, 403);
const previousCookie = owner.cookie();
assert.equal((await owner.request('/api/auth', { action: 'logout' })).status, 200);
assert.equal((await owner.request()).status, 401);
const replay = await fetch(base + '/api/data', { headers: { Cookie: previousCookie } });
assert.equal(replay.status, 401);
assert.equal((await owner.request('/api/auth', { action: 'login', identifier: users.owner.identifier, password: 'wrong but long password' })).status, 401);
assert.equal((await owner.request('/api/auth', { action: 'login', identifier: users.owner.identifier, password })).status, 200);
assert.equal((await partner.request('/api/auth', { action: 'logout' })).status, 200);
assert.equal((await partner.request('/api/auth', { action: 'login', identifier: users.partner.identifier.replace('+1', '+1 '), password })).status, 200);
// A missing account receives the same generic login response; repeated attempts are blocked.
const attacker = client();
for (let i = 0; i < 8; i++) assert.equal((await attacker.request('/api/auth', { action: 'login', identifier: `missing_${run}@example.test`, password })).status, 401);
assert.equal((await attacker.request('/api/auth', { action: 'login', identifier: `missing_${run}@example.test`, password })).status, 429);
console.log('PASS: stock request edits and deletions,  empty workspace, email/phone signup and login, unique names and IDs, sessions/logout, invitation membership, roles, store renaming, purchase history, workspace isolation, origin checks, and auth attempt limits.');
