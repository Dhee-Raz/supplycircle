import { and, eq } from 'drizzle-orm';
import { getDb } from '../../../db';
import { items, members, stores } from '../../../db/schema';
import { getAccount, json, failure } from '../../auth';

export async function GET() {
  try {
    const account = await getAccount();
    if (!account) return json({ error: 'Please sign in.' }, 401);
    const db = getDb();
    const member = await db.select().from(members).where(eq(members.accountId, account.id)).get();
    if (!member) return json({ error: 'Workspace required.' }, 403);
    if (member.role === 'employee') return json({ error: 'Reporting is available to owners and partners.' }, 403);
    const [records, locations] = await Promise.all([
      db.select().from(items).where(eq(items.business, member.business)),
      db.select().from(stores).where(eq(stores.business, member.business)),
    ]);
    const status = ['needed', 'claimed', 'ordered', 'received', 'bought'];
    const totals = Object.fromEntries(status.map(s => [s, records.filter(i => i.status === s).length]));
    const byStore = locations.map(store => {
      const subset = records.filter(i => i.store === store.id);
      return { id: store.id, name: store.name, total: subset.length,
        pending: subset.filter(i => ['needed', 'claimed', 'ordered'].includes(i.status)).length,
        completed: subset.filter(i => ['received', 'bought'].includes(i.status)).length,
        urgentOpen: subset.filter(i => i.priority === 'urgent' && ['needed', 'claimed', 'ordered'].includes(i.status)).length };
    });
    const completed = records.filter(i => ['received', 'bought'].includes(i.status) && i.boughtAt && i.created);
    const durations = completed.map(i => new Date(i.boughtAt!).getTime() - new Date(i.created).getTime()).filter(n => Number.isFinite(n) && n >= 0);
    const averageCompletionHours = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 360000) / 10 : null;
    return json({ totals, byStore, total: records.length, urgentOpen: records.filter(i => i.priority === 'urgent' && ['needed','claimed','ordered'].includes(i.status)).length, averageCompletionHours });
  } catch (error) { return failure(error); }
}
