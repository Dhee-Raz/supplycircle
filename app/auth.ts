import { cookies } from 'next/headers';
import { scrypt, timingSafeEqual, randomBytes, createHash } from 'node:crypto';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { accounts, sessions, authAttempts } from '../db/schema';

export class InputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const SESSION_COOKIE = 'supplycircle_session';
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');
export const newToken = () => randomBytes(32).toString('hex');
export function clean(value: unknown, label: string, max = 120): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new InputError(`Enter a valid ${label}.`);
  return value.trim();
}
export function normalizeIdentifier(value: unknown) {
  const input = clean(value, 'email or phone number', 254);
  if (input.includes('@')) {
    const identifier = input.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) throw new InputError('Enter a valid email address.');
    return { identifier, kind: 'email' };
  }
  const identifier = input.replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(identifier)) throw new InputError('Include the country code, for example +1 312 555 0123.');
  return { identifier, kind: 'phone' };
}
export function normalizeUsername(value: unknown) {
  const username = clean(value, 'username', 30).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_]{2,29}$/.test(username)) throw new InputError('Use 3–30 letters, numbers, or underscores for your username.');
  return username;
}
export function validatePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 15 || value.length > 128) throw new InputError('Use a password with 15–128 characters.');
  return value;
}
// OWASP's 32 MiB scrypt configuration, supported by Workers' nodejs_compat.
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt-32768-8-3$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, expected] = encoded.split('$');
  if (algorithm !== 'scrypt-32768-8-3' || !salt || !expected || expected.length !== 128) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') throw new InputError('This request is not allowed.', 403);
}
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  checkOrigin(request);
  if (!request.headers.get('content-type')?.includes('application/json')) throw new InputError('Send a JSON request.');
  const text = await request.text();
  if (text.length > 8000) throw new InputError('Request is too large.');
  let body;
  try { body = JSON.parse(text); } catch { throw new InputError('Invalid request.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Invalid request.');
  return body;
}
export function json(body: unknown, status = 200, extra?: HeadersInit) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', ...extra } });
}
export function failure(error: unknown) {
  if (error instanceof InputError) return json({ error: error.message }, error.status);
  return json({ error: 'Could not save these details. Please try again.' }, 500);
}
export async function getAccount() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const db = getDb();
  const session = await db.select().from(sessions).where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expires, Date.now()))).get();
  if (!session) return null;
  return await db.select().from(accounts).where(eq(accounts.id, session.accountId)).get() || null;
}
export function publicAccount(account: typeof accounts.$inferSelect) {
  return { id: account.id, username: account.username, name: account.name, identifier: account.identifier, kind: account.kind };
}
export function cookieHeader(request: Request, token: string, maxAge = SESSION_SECONDS) {
  const secure = new URL(request.url).protocol === 'https:';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
export async function createSession(accountId: string) {
  const token = newToken();
  const db = getDb();
  await db.batch([
    db.delete(sessions).where(lt(sessions.expires, Date.now())),
    db.insert(sessions).values({ tokenHash: hashToken(token), accountId, expires: Date.now() + SESSION_SECONDS * 1000 }),
  ]);
  return token;
}
export async function rateLimit(request: Request, identifier: string, action: string) {
  const db = getDb(), now = Date.now(), window = Math.floor(now / 900000);
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const keys = [hashToken(`ip:${ip}:${window}`), hashToken(`${action}:${identifier}:${window}`)];
  const results = await db.batch([
    db.delete(authAttempts).where(lt(authAttempts.expires, now)),
    ...keys.map(key => db.insert(authAttempts).values({ key, count: 1, expires: (window + 1) * 900000 }).onConflictDoUpdate({ target: authAttempts.key, set: { count: sql`${authAttempts.count} + 1` } }).returning()),
  ]);
  if (results[1][0].count > 60 || results[2][0].count > 8) throw new InputError('Too many attempts. Please try again in 15 minutes.', 429);
}
