import { invoke } from "@/electron";
import { ensureModule } from "@/commands/module-init";

export interface SnapshotStore {
  save(path: string, body: string): Promise<void>;
  load(path: string): Promise<string>;
}

export interface TransferSource {
  session: string;
  close(): Promise<void>;
  kind: "folder" | "zip";
  name: string;
  rootPath: string;
  files: string[];
  markers: string[];
  has: (path: string) => boolean;
  readText: (path: string) => Promise<string>;
  snapshots: SnapshotStore;
}

/** 规范化包内相对路径：统一 /，消解 . 与 ..；越出根目录返回 null */
export const normalizeRelativePath = (path: string): string | null => {
  const out: string[] = [];
  for (const segment of path.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else {
      out.push(segment);
    }
  }
  return out.join("/");
};

export const isZipPath = (path: string) => /\.zip$/i.test(path);

export async function openTransferSource(
  rootPath: string,
  signal?: AbortSignal
): Promise<TransferSource> {
  await ensureModule("file");
  signal?.throwIfAborted();
  const session = await invoke<string>("import:open", rootPath);
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await invoke("import:close", session);
  };
  const abort = () => {
    void close().catch(console.error);
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    const { name, markers } = await invoke<{ name: string; markers: string[] }>(
      "import:index",
      session
    );
    const files: string[] = [];
    let after = 0;
    while (true) {
      const page = await invoke<{ after: number; files: string[] }>("import:paths", session, after);
      if (!page.files.length) break;
      files.push(...page.files);
      after = page.after;
    }
    const paths = new Set(files);
    return {
      session,
      kind: isZipPath(rootPath) ? "zip" : "folder",
      name,
      markers,
      rootPath,
      files,
      has: path => paths.has(path),
      readText: path => invoke<string>("import:text", session, path),
      snapshots: {
        save: (path, body) => invoke<void>("import:save", session, path, body),
        load: path => invoke<string>("import:load", session, path),
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
