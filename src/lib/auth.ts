import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { user, session, account, verification } from "./db/schema";
import { getConfig } from "./config";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email";

export const auth = betterAuth({
  appName: "Road Runner",
  secret: getConfig().betterAuthSecret,
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ].filter(Boolean) as string[],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: getConfig().requireEmailVerification,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({ to: user.email, url });
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail({ to: user.email, url });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh once a day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  user: {
    additionalFields: {
      timezone: {
        type: "string",
        defaultValue: "UTC",
        required: false,
        input: true,
      },
    },
  },
  advanced: {
    cookiePrefix: "rr",
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
