import { env } from "cloudflare:workers";

export interface TokenRecord {
  monsterIndex: string;
  objectKey: string;
  originalName: string;
  contentType: string;
  updatedAt: string;
}

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS monster_tokens (
    monster_index TEXT PRIMARY KEY NOT NULL,
    object_key TEXT NOT NULL,
    original_name TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'image/png',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

function getD1(): D1Database {
  const binding = (env as unknown as { DB?: D1Database }).DB;
  if (!binding) throw new Error("D1 binding DB is unavailable");
  return binding;
}

export function getTokenBucket(): R2Bucket {
  const binding = (env as unknown as { TOKENS?: R2Bucket }).TOKENS;
  if (!binding) throw new Error("R2 binding TOKENS is unavailable");
  return binding;
}

async function readyDb() {
  const db = getD1();
  await db.prepare(CREATE_TABLE_SQL).run();
  return db;
}

export async function listTokenRecords(): Promise<TokenRecord[]> {
  const db = await readyDb();
  const result = await db
    .prepare(
      `SELECT monster_index AS monsterIndex, object_key AS objectKey,
              original_name AS originalName, content_type AS contentType,
              updated_at AS updatedAt
       FROM monster_tokens ORDER BY updated_at DESC`
    )
    .all<TokenRecord>();
  return result.results;
}

export async function findTokenRecord(index: string) {
  const db = await readyDb();
  return db
    .prepare(
      `SELECT monster_index AS monsterIndex, object_key AS objectKey,
              original_name AS originalName, content_type AS contentType,
              updated_at AS updatedAt
       FROM monster_tokens WHERE monster_index = ? LIMIT 1`
    )
    .bind(index)
    .first<TokenRecord>();
}

export async function saveTokenRecord(record: Omit<TokenRecord, "updatedAt">) {
  const db = await readyDb();
  await db
    .prepare(
      `INSERT INTO monster_tokens
        (monster_index, object_key, original_name, content_type, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(monster_index) DO UPDATE SET
        object_key = excluded.object_key,
        original_name = excluded.original_name,
        content_type = excluded.content_type,
        updated_at = CURRENT_TIMESTAMP`
    )
    .bind(
      record.monsterIndex,
      record.objectKey,
      record.originalName,
      record.contentType
    )
    .run();
}

export async function deleteTokenRecord(index: string) {
  const existing = await findTokenRecord(index);
  if (!existing) return false;
  await getTokenBucket().delete(existing.objectKey);
  const db = await readyDb();
  await db.prepare("DELETE FROM monster_tokens WHERE monster_index = ?").bind(index).run();
  return true;
}
