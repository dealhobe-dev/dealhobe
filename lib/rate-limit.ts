import connectDB from '@/lib/mongodb';
import LoginAttempt from '@/lib/models/LoginAttempt';

// Failed-attempt limiter backed by MongoDB, so the count is shared by every serverless instance
// (an in-memory Map would reset on each cold start and be per-instance).

export type Limit = { max: number; windowMs: number; lockMs: number };

/** Seconds left on the longest active lock among `keys`; 0 when none is locked. */
export async function lockedForSeconds(keys: string[]): Promise<number> {
  await connectDB();
  const now = new Date();
  const rows = await LoginAttempt.find({ key: { $in: keys }, lockedUntil: { $gt: now } }).select('lockedUntil').lean();
  const until = Math.max(0, ...rows.map((r) => r.lockedUntil!.getTime()));
  return until ? Math.ceil((until - now.getTime()) / 1000) : 0;
}

/** Count one failure against `key`; locks it once `max` failures land inside the window. Atomic, so parallel guesses can't slip past. */
export async function recordFailure(key: string, limit: Limit): Promise<void> {
  try {
    await bump(key, limit);
  } catch (err) {
    // Two first-ever failures racing to upsert the same key: the loser hits the unique index, so count it again.
    if ((err as { code?: number }).code !== 11000) throw err;
    await bump(key, limit);
  }
}

async function bump(key: string, { max, windowMs, lockMs }: Limit): Promise<void> {
  await connectDB();
  const now = new Date();
  const fresh = { $gt: [now, { $ifNull: ['$resetAt', new Date(0)] }] }; // no row yet, or its window has passed
  await LoginAttempt.updateOne(
    { key },
    [
      {
        $set: {
          count:       { $cond: [fresh, 1, { $add: [{ $ifNull: ['$count', 0] }, 1] }] },
          resetAt:     { $cond: [fresh, new Date(now.getTime() + windowMs), '$resetAt'] },
          lockedUntil: { $cond: [fresh, null, { $ifNull: ['$lockedUntil', null] }] },
        },
      },
      {
        $set: {
          lockedUntil: { $cond: [{ $gte: ['$count', max] }, new Date(now.getTime() + lockMs), '$lockedUntil'] },
        },
      },
      { $set: { expiresAt: { $max: ['$resetAt', { $ifNull: ['$lockedUntil', '$resetAt'] }] } } },
    ],
    { upsert: true },
  );
}

export async function clearFailures(key: string): Promise<void> {
  await connectDB();
  await LoginAttempt.deleteOne({ key });
}
