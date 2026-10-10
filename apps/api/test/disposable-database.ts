import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { Client } from "pg";
import { PrismaService } from "../src/prisma/prisma.service.js";

/** Owns only the randomly named local database it creates; never resets configured data. */
export async function disposableDatabase(label: string) {
  if (!/^[a-z]+$/.test(label)) throw new Error("Invalid fixture label");
  const original = process.env.DATABASE_URL!;
  const url = new URL(original);
  if (!["localhost", "127.0.0.1"].includes(url.hostname))
    throw new Error("Local fixture database required");
  const name = `preflyt_${label}_test_${randomUUID().replace(/-/g, "")}`;
  const admin = new Client({ connectionString: original });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  url.pathname = "/" + name;
  const sql = new Client({ connectionString: url.toString() });
  await sql.connect();
  try {
    for (const entry of (await readdir("prisma/migrations"))
      .filter((name) => /^\d/.test(name))
      .sort())
      await sql.query(
        await readFile(`prisma/migrations/${entry}/migration.sql`, "utf8"),
      );
    process.env.DATABASE_URL = url.toString();
    const prisma = new PrismaService();
    await prisma.$connect();
    return {
      prisma,
      async reset() {
        if (
          (await sql.query("SELECT current_database() AS name")).rows[0]
            .name !== name
        )
          throw new Error("Fixture ownership changed");
        const tables = (
          await sql.query(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
          )
        ).rows.map((row) => '"' + row.tablename.replaceAll('"', '""') + '"');
        if (tables.length)
          await sql.query("TRUNCATE " + tables.join(", ") + " CASCADE");
      },
      async close() {
        await prisma.$disconnect();
        await sql.end();
        await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
        await admin.end();
        process.env.DATABASE_URL = original;
      },
    };
  } catch (error) {
    await sql.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
    process.env.DATABASE_URL = original;
    throw error;
  }
}
