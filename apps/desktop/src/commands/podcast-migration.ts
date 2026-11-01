import { invoke } from "@/electron";

/** 卡片、文章、项目文档上的播客迁入播客插件的主进程命令 */
export interface PodcastMigrationResult {
  episodes: number;
  skipped: number;
}

export const hasPendingPodcastMigration = (databaseName: string): Promise<boolean> =>
  invoke("podcast-migration:pending", { databaseName });

export const runPodcastMigration = (databaseName: string): Promise<PodcastMigrationResult | null> =>
  invoke("podcast-migration:run", { databaseName });
