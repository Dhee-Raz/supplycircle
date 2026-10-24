import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDb } from '../../../db';
import { accounts, businesses, invitations, items, members, stores } from '../../../db/schema';
import { getAccount, publicAccount, InputError, readBody, clean, normalizeIdentifier, newToken, hashToken, json, failure } from '../../auth';

export async function GET() {
  try {
    const account = await getAccount();
    if (!account) return json({ error: 'Please sign in.' }, 401);
    const db = getDb(), member = await db.select().from(members).where(eq(members.accountId, account.id)).get();
    if (!member) return json({ user: publicAccount(account), onboarding: true, stores: [], items: [], members: [] });
    const team = await db.select({ name: members.name, identifier: members.email, role: members.role, accountId: members.accountId, username: accounts.username, storeId: members.storeId }).from(members).leftJoin(accounts, eq(members.accountId, accounts.id)).where(eq(members.business, member.business));
    const pendingInvitations = member.role === 'owner' ? await db.select({ id: invitations.id, name: invitations.name, identifier: invitations.identifier, role: invitations.role, storeId: invitations.storeId, expires: invitations.expires }).from(invitations).where(and(eq(invitations.business, member.business), isNull(invitations.usedAt), gt(invitations.expires, Date.now()))) : [];
    return json({
      user: publicAccount(account), member,
      business: await db.select().from(businesses).where(eq(businesses.id, member.business)).get(),
      stores: await db.select().from(stores).where(and(eq(stores.business, member.business), ...(member.role === 'employee' ? [eq(stores.id, member.storeId || '__unassigned__')] : []))),
      items: await db.select().from(items).where(and(eq(items.business, member.business), ...(member.role === 'employee' ? [eq(items.store, member.storeId || '__unassigned__')] : []))),
      members: team, invitations: pendingInvitations,
    });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const body = await readBody(request), account = await getAccount();
    if (!account) throw new InputError('Please sign in.', 401);
    const db = getDb(), member = await db.select().from(members).where(eq(members.accountId, account.id)).get();
    if (body.action === 'setup') {
      if (member) throw new InputError('You already belong to a workspace.');
      const id = crypto.randomUUID();
      await db.batch([
        db.insert(businesses).values({ id, name: clean(body.business, 'business name'), owner: account.id }),
        db.insert(members).values({ email: account.identifier, business: id, accountId: account.id, name: account.name, role: 'owner' }),
        db.insert(stores).values({ id: crypto.randomUUID(), business: id, name: clean(body.store, 'store name'), location: typeof body.location === 'string' && body.location.trim() ? clean(body.location, 'location') : '' }),
      ]);
      return json({ ok: true });
    }
    if (body.action === 'join') {
      if (member) throw new InputError('You already belong to a workspace.');
      const token = clean(body.token, 'invitation code', 64);
      if (!/^[a-f0-9]{64}$/.test(token)) throw new InputError('This invitation is invalid or expired.');
      const invite = await db.select().from(invitations).where(and(eq(invitations.tokenHash, hashToken(token)), isNull(invitations.usedAt), gt(invitations.expires, Date.now()))).get();
      if (!invite || invite.identifier !== account.identifier) throw new InputError('This invitation is invalid, expired, or intended for a different email or phone number.');
      await db.batch([
        db.insert(members).values({ email: account.identifier, accountId: account.id, business: invite.business, name: account.name, role: invite.role, storeId: invite.storeId }),
        db.update(invitations).set({ usedAt: new Date().toISOString() }).where(and(eq(invitations.id, invite.id), isNull(invitations.usedAt))),
      ]);
      return json({ ok: true });
    }
    if (!member) throw new InputError('Create a workspace or accept an invitation first.', 403);
    if (['addStore', 'editStore', 'invite', 'assignStore'].includes(String(body.action))) {
      if (member.role !== 'owner') throw new InputError('Only the owner can manage stores and team invitations.', 403);
      if (body.action === 'assignStore') {
        const accountId = clean(body.accountId, 'employee account ID');
        const storeId = clean(body.storeId, 'store ID');
        const targetStore = await db.select({ id: stores.id }).from(stores).where(and(eq(stores.id, storeId), eq(stores.business, member.business))).get();
        if (!targetStore) throw new InputError('Store not found in your business.', 404);
        const updated = await db.update(members).set({ storeId }).where(and(eq(members.accountId, accountId), eq(members.business, member.business), eq(members.role, 'employee'))).returning({ accountId: members.accountId });
        if (!updated.length) throw new InputError('Employee not found in your business.', 404);
        return json({ ok: true });
      }
      if (body.action === 'invite') {
        const { identifier } = normalizeIdentifier(body.identifier);
        if (body.role !== 'partner' && body.role !== 'employee') throw new InputError('Select a valid role.');
        const existing = await db.select({ email: members.email }).from(members).where(eq(members.email, identifier)).get();
        if (existing) throw new InputError('This person already belongs to a workspace.');
        const storeId = body.role === 'employee' ? clean(body.storeId, 'employee store') : null;
        if (storeId && !(await db.select({ id: stores.id }).from(stores).where(and(eq(stores.id, storeId), eq(stores.business, member.business))).get())) throw new InputError('Choose a store in your business.');
        const token = newToken();
        await db.insert(invitations).values({ id: crypto.randomUUID(), business: member.business, identifier, name: clean(body.name, 'team member name', 80), role: body.role, storeId, tokenHash: hashToken(token), expires: Date.now() + 7 * 86400000, usedAt: null });
        return json({ ok: true, inviteUrl: `${new URL(request.url).origin}/#invite=${token}` });
      }
      const values = { name: clean(body.name, 'store name'), location: typeof body.location === 'string' && body.location.trim() ? clean(body.location, 'location') : '' };
      if (body.action === 'addStore') await db.insert(stores).values({ id: crypto.randomUUID(), business: member.business, ...values });
      else {
        const id = clean(body.id, 'store ID');
        const updated = await db.update(stores).set(values).where(and(eq(stores.id, id), eq(stores.business, member.business))).returning({ id: stores.id });
        if (!updated.length) throw new InputError('Store not found.', 404);
      }
    } else if (body.action === 'addItem') {
      const id = clean(body.store, 'store ID');
      const store = await db.select({ id: stores.id }).from(stores).where(and(eq(stores.id, id), eq(stores.business, member.business))).get();
      if (!store) throw new InputError('Select a store in your workspace.');
      if (member.role === 'employee' && (!member.storeId || member.storeId !== store.id)) throw new InputError('You can only report stock for your assigned store.', 403);
      const quantity = Number(body.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) throw new InputError('Quantity must be between 1 and 100,000.');
      await db.insert(items).values({
        id: crypto.randomUUID(), business: member.business, store: store.id,
        name: clean(body.name, 'item name'), quantity, unit: clean(body.unit, 'unit', 40),
        category: clean(body.category, 'category', 60), priority: body.priority === 'urgent' ? 'urgent' : 'normal',
        note: typeof body.note === 'string' && body.note.trim() ? clean(body.note, 'note', 1000) : '',
        status: 'needed', addedBy: account.name, addedById: account.id, boughtBy: null, boughtById: null,
        created: new Date().toISOString(), boughtAt: null,
      });
    } else if (body.action === 'buy' || body.action === 'reopen') {
      if (member.role === 'employee') throw new InputError('A partner or owner must mark purchases.', 403);
      const buying = body.action === 'buy', id = clean(body.id, 'item ID');
      const result = await db.update(items).set({ status: buying ? 'bought' : 'needed', boughtBy: buying ? account.name : null, boughtById: buying ? account.id : null, boughtAt: buying ? new Date().toISOString() : null }).where(and(eq(items.id, id), eq(items.business, member.business), eq(items.status, buying ? 'needed' : 'bought'))).returning({ id: items.id });
      if (!result.length) throw new InputError('This item was already updated or is not in your workspace. Refresh the list.');
    } else throw new InputError('Unknown action.');
    return json({ ok: true });
  } catch (error) { return failure(error); }
}
