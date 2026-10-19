import type { IPublishFile } from "@/types/publish";

/** 依赖批次全部结束且成功后，才允许更新作者入口。 */
export async function uploadPublication(
  files: IPublishFile[],
  concurrency: number,
  upload: (file: IPublishFile) => Promise<boolean>
) {
  for (const batch of [
    files.filter(file => !file.publicationEntry),
    files.filter(file => file.publicationEntry),
  ]) {
    let next = 0;
    let failed = false;
    const workers = Array.from(
      { length: Math.min(Math.max(1, Math.floor(concurrency) || 1), batch.length) },
      async () => {
        while (next < batch.length) {
          const file = batch[next++];
          if (!(await upload(file))) failed = true;
        }
      }
    );
    const results = await Promise.allSettled(workers);
    const error = results.find(result => result.status === "rejected");
    if (error?.status === "rejected") throw error.reason;
    if (failed) return;
  }
}
