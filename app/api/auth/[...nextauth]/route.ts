import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { createHash, timingSafeEqual } from 'crypto';
import { clearFailures, lockedForSeconds, recordFailure, type Limit } from '@/lib/rate-limit';

const MIN = 60 * 1000;
// Failed attempts only. Three layers: one IP can't hammer, one IP can't hammer one account, and the admin
// account as a whole is capped so a botnet (or spoofed X-Forwarded-For values) can't brute-force around the first two.
const PER_IP:      Limit = { max: 10, windowMs: 15 * MIN, lockMs: 15 * MIN };
const PER_IP_USER: Limit = { max: 5,  windowMs: 15 * MIN, lockMs: 15 * MIN };
const GLOBAL:      Limit = { max: 30, windowMs: 15 * MIN, lockMs: 15 * MIN };

const sha = (v: string) => createHash('sha256').update(v).digest();
const digest = (v: string) => sha(v).toString('hex').slice(0, 32);
/** Constant-time string compare (hashing first makes the lengths equal). */
const safeEqual = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Behind Vercel / a reverse proxy the first X-Forwarded-For entry is the client. */
function clientIp(headers: Record<string, unknown> | undefined): string {
  const h = (k: string) => {
    const v = headers?.[k];
    return typeof v === 'string' ? v : Array.isArray(v) ? String(v[0] ?? '') : '';
  };
  return (h('x-real-ip') || h('x-forwarded-for').split(',')[0] || 'unknown').trim().slice(0, 64) || 'unknown';
}

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Admin Credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email'    },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        // Env values pasted into a dashboard often carry stray spaces or a trailing newline, and phone keyboards
        // capitalise the first letter of an email, so trim both sides and compare the email case-insensitively.
        const adminEmail    = process.env.ADMIN_EMAIL?.trim().toLowerCase();
        const adminPassword = process.env.ADMIN_PASSWORD?.trim();
        const email         = credentials?.email?.trim().toLowerCase() ?? '';
        const password      = credentials?.password?.trim() ?? '';

        // Cap input sizes before any hashing; real credentials are far shorter.
        if (!adminEmail || !adminPassword || !email || !password || email.length > 254 || password.length > 256) {
          await sleep(400);
          return null;
        }

        const ip = clientIp(req?.headers as Record<string, unknown> | undefined);
        const buckets: [string, Limit][] = [
          [`admin:ip:${ip}`, PER_IP],
          [`admin:ip-user:${digest(`${ip}|${email}`)}`, PER_IP_USER],
          ['admin:global', GLOBAL],
        ];

        // Fail closed: if the limiter can't be reached, nobody gets to guess passwords unmetered.
        let locked: number;
        try {
          locked = await lockedForSeconds(buckets.map(([k]) => k));
        } catch {
          throw new Error('UNAVAILABLE');
        }
        if (locked > 0) throw new Error(`RATE_LIMITED:${locked}`);

        // Both comparisons always run so timing doesn't reveal which field was wrong.
        const emailOk = safeEqual(email, adminEmail);
        const passOk  = safeEqual(password, adminPassword);

        if (emailOk && passOk) {
          await clearFailures(buckets[1][0]).catch(() => undefined);
          return { id: '1', name: 'Admin', email: process.env.ADMIN_EMAIL!.trim(), role: 'admin' };
        }

        await Promise.all(buckets.map(([k, l]) => recordFailure(k, l))).catch(() => undefined);
        await sleep(400 + Math.random() * 300); // slows each guess without helping on the happy path
        return null;
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge:   60 * 60 * 24, // 24 hours
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/admin/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
