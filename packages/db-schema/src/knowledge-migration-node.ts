import { readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname } from "node:path";
import { migrateKnowledgeToProjects, type MigrationDatabase } from "./knowledge-migration";

export interface UpgradeKnowledgeDatabaseOptions {
  /** 临时验证库等用后即弃的场景无需迁移备份。 */
  skipBackup?: boolean;
}

/** SQLite 快照包含已提交 WAL；备份失败时不得开始数据迁移。 */
export function upgradeKnowledgeDatabase(
  db: MigrationDatabase,
  path: string,
  options: UpgradeKnowledgeDatabaseOptions = {}
) {
  try {
    return migrateKnowledgeToProjects(db, () => {
      if (path === ":memory:" || options.skipBackup) return;
      const directory = dirname(path);
      const prefix = `${basename(path)}.pre-knowledge-v1-`;
      // 迁移失败重试时库内容与首份备份一致，已存在备份则复用，避免全量备份反复膨胀。
      if (readdirSync(directory).some(name => name.startsWith(prefix))) return;
      db.prepare("VACUUM INTO ?").run(`${path}.pre-knowledge-v1-${randomUUID()}.bak`);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/KNOWLEDGE_MIGRATION_FAILED|DB_MODEL_INCOMPATIBLE/.test(message)) throw error;
    throw new Error(`KNOWLEDGE_MIGRATION_FAILED: ${message}`);
  }
}
