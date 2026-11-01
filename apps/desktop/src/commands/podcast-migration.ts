import { invoke } from "@/electron";

/** 宿主播客迁入播客插件的主进程命令 */
export interface PodcastMigrationResult {
  episodes: number;
  skipped: number;
  notebook: number;
}

export const getPodcastMigrationStatus = (
  databaseName: string
): Promise<{ pending: boolean; requiresPlugin: boolean }> =>
  invoke("podcast-migration:pending", { databaseName });

export const runPodcastMigration = (databaseName: string): Promise<PodcastMigrationResult | null> =>
  invoke("podcast-migration:run", { databaseName });
