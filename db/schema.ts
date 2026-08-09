import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const monsterTokens = sqliteTable("monster_tokens", {
  monsterIndex: text("monster_index").primaryKey(),
  objectKey: text("object_key").notNull(),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull().default("image/png"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
