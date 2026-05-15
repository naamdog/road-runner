import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __pg__: ReturnType<typeof postgres> | undefined;
}

function getClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Allow build-time / no-DB usage to succeed (e.g. landing page render).
    // Any query at runtime will throw a clear error.
    return null;
  }
  if (process.env.NODE_ENV === "production") {
    return postgres(url, { prepare: false, max: 1 });
  }
  globalThis.__pg__ ??= postgres(url, { prepare: false, max: 1 });
  return globalThis.__pg__;
}

const client = getClient();

export const db = client
  ? drizzle(client, { schema, casing: "snake_case" })
  : (new Proxy(
      {},
      {
        get() {
          throw new Error(
            "DATABASE_URL is not set. Add it to your environment to use the database."
          );
        },
      }
    ) as ReturnType<typeof drizzle<typeof schema>>);

export { schema };
