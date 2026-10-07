import { cookies } from 'next/headers';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '../../../db';
import { accounts, members, sessions } from '../../../db/schema';
import { getChatGPTUser } from '../../chatgpt-auth';
import { SESSION_COOKIE, InputError, readBody, clean, normalizeIdentifier, normalizeUsername, validatePassword, hashPassword, verifyPassword, publicAccount, getAccount, createSession, cookieHeader, hashToken, rateLimit, json, failure } from '../../auth';

export async function POST(request: Request) {
  try {
    const body = await readBody(request), db = getDb();
    if (body.action === 'logout') {
      const token = (await cookies()).get(SESSION_COOKIE)?.value;
      if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
      return json({ ok: true }, 200, { 'Set-Cookie': cookieHeader(request, '', 0) });
    }
    if (body.action === 'profile') {
      const account = await getAccount();
      if (!account) throw new InputError('Please sign in.', 401);
      const name = clean(body.name, 'display name', 80), username = normalizeUsername(body.username);
      const existing = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.username, username)).get();
      if (existing && existing.id !== account.id) throw new InputError('That username is already in use.', 409);
      await db.batch([
        db.update(accounts).set({ name, username }).where(eq(accounts.id, account.id)),
        db.update(members).set({ name }).where(eq(members.accountId, account.id)),
      ]);
      return json({ ok: true });
    }
    if (body.action !== 'signup' && body.action !== 'login') throw new InputError('Unknown action.');
    const { identifier, kind } = normalizeIdentifier(body.identifier);
    await rateLimit(request, identifier, String(body.action));
    const password = validatePassword(body.password);
    let account;
    if (body.action === 'signup') {
      const username = normalizeUsername(body.username), name = clean(body.name, 'display name', 80);
      const existing = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.identifier, identifier)).get();
      const existingUsername = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.username, username)).get();
      if (existing || existingUsername) throw new InputError('That email, phone number, or username is already registered. Try signing in or choose a different username.', 409);
      // Existing ChatGPT workspaces can only be claimed using a verified matching platform identity.
      const legacy = await db.select().from(members).where(and(eq(members.email, identifier), isNull(members.accountId))).get();
      const platformUser = legacy ? await getChatGPTUser() : null;
      if (legacy && platformUser?.email.toLowerCase() !== identifier) throw new InputError('This contact belongs to an existing workspace. Open the private hosted app with the matching ChatGPT account to link it.', 403);
      account = { id: crypto.randomUUID(), username, name, identifier, kind, passwordHash: await hashPassword(password), created: new Date().toISOString() };
      try {
        if (legacy) await db.batch([db.insert(accounts).values(account), db.update(members).set({ accountId: account.id, name }).where(and(eq(members.email, identifier), isNull(members.accountId)))]);
        else await db.insert(accounts).values(account);
      } catch { throw new InputError('That email, phone number, or username is already registered.', 409); }
    } else {
      account = await db.select().from(accounts).where(eq(accounts.identifier, identifier)).get();
      // Do comparable password work for a missing account to avoid a fast enumeration path.
      const dummy = 'scrypt-32768-8-3$00000000000000000000000000000000$' + '0'.repeat(128);
      const valid = await verifyPassword(password, account?.passwordHash || dummy);
      if (!account || !valid) throw new InputError('Email, phone number, or password is incorrect.', 401);
    }
    const token = await createSession(account.id);
    return json({ user: publicAccount(account) }, 200, { 'Set-Cookie': cookieHeader(request, token) });
  } catch (error) { return failure(error); }
}
