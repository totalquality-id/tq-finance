import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { authConfig } from './auth.config';
import { consumeLoginAttempt, validSession } from './lib/login-security.js';
import { loadSessionUser } from './lib/session-user.js';

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  // Vercel mengakhiri HTTPS sebelum meneruskan permintaan ke server component.
  ...(process.env.VERCEL ? { useSecureCookies: true } : {}),
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      const id = user?.id ?? token.id;
      if (!id) return null;
      const current = await loadSessionUser(prisma, id);
      if (!validSession(user ? { sessionVersion: user.sessionVersion } : token, current)) return null;
      return { ...token, id: current.id, name: current.name, email: current.email, role: current.role, sessionVersion: current.sessionVersion };
    },
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        if (typeof credentials?.email !== 'string' || typeof credentials?.password !== 'string') return null;
        const email = credentials.email.trim().toLowerCase();
        if (email.length > 254 || !email.includes('@') || Buffer.byteLength(credentials.password) > 72) return null;
        const ip = request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local';
        if (!(await consumeLoginAttempt(prisma, email, ip))) return null;
        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, password: true, role: true, isActive: true, sessionVersion: true },
        });
        if (!user || !user.isActive || !user.password) return null;
        if (!(await bcrypt.compare(credentials.password, user.password))) return null;
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        return { id: user.id, name: user.name, email: user.email, role: user.role, sessionVersion: user.sessionVersion };
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
});
