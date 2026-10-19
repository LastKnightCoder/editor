import type { GitSnapshotRequest, GitCacheDirectory } from "@tau/plugins";
import { ensureModule } from "./module-init";

export async function publishGitSnapshot(
  input: GitSnapshotRequest,
  options?: { signal?: AbortSignal }
): Promise<void> {
  const signal = options?.signal;
  signal?.throwIfAborted();
  await ensureModule("publish");
  signal?.throwIfAborted();
  const cancel = () => {
    void window.electron.invoke("publish-git:cancel", input.publicationId).catch(() => undefined);
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    await window.electron.invoke("publish-git:snapshot", input);
    signal?.throwIfAborted();
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}
export async function selectGitCacheDirectory(): Promise<GitCacheDirectory | null> {
  await ensureModule("publish");
  return window.electron.invoke("publish-git:select-cache");
}
