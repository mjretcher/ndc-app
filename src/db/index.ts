import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://ndc:ndc_dev@localhost:5432/ndc_dev";

// postgres-js: single shared pool; ssl required for Neon in production.
const client = postgres(connectionString, {
  max: 5,
  ssl: connectionString.includes("localhost") ? false : "require",
});

export const db = drizzle(client, { schema });
export type Db = typeof db;
export * as tables from "./schema";
