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
    // Disabled, not deleted: flip ENABLE_EMAIL_PASSWORD_AUTH=true to bring
    // public/paid signup back later with no code change.
    enabled: getConfig().enableEmailPasswordAuth,
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
  socialProviders: {
    google: {
      clientId: getConfig().google.clientId,
      clientSecret: getConfig().google.clientSecret,
      // Enforced server-side against the verified id-token `hd` claim, not
      // just a UI hint — rejects sign-in outright if it doesn't match.
      hd: getConfig().googleAllowedDomain,
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
