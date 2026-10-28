import { invoke } from "@/electron";
import { withModule } from "@/commands/module-init";
function fileCall<T>(channel: string, ...args: unknown[]): Promise<T> {
  return withModule("file", () => invoke<T>(channel, ...args));
}
import {
  uploadChunkedFile,
  downloadChunkedFile,
  type ObjectStorage,
} from "@tau/db-schema/sync-protocol";
export const chunkDigest = async (bytes: Uint8Array) => {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
  return [...hash].map(byte => byte.toString(16).padStart(2, "0")).join("");
};
export async function uploadChunkedPath(
  store: ObjectStorage,
  object: string,
  filePath: string,
  name: string,
  onChunk?: (bytes: number) => void
) {
  const size = await fileCall<number>("sync:file-size", filePath);
  return uploadChunkedFile(
    store,
    object,
    name,
    {
      size,
      read: (offset, length) => fileCall<Uint8Array>("sync:file-read", filePath, offset, length),
      assertUnchanged: async () => {
        if ((await fileCall<number>("sync:file-size", filePath)) !== size)
          throw new Error("同步期间本地文件已变化");
      },
    },
    chunkDigest,
    undefined,
    onChunk
  );
}
export async function downloadChunkedPath(
  store: Pick<ObjectStorage, "downloadFile">,
  object: string,
  target: string
) {
  await fileCall("sync:file-write", target, 0, new Uint8Array());
  return downloadChunkedFile(
    store,
    object,
    (bytes, offset) => fileCall<void>("sync:file-write", target, offset, bytes),
    chunkDigest
  );
}

export const syncFileSize = (filePath: string) => fileCall<number>("sync:file-size", filePath);

export const copySyncFile = (source: string, target: string) =>
  fileCall<void>("sync:file-copy", source, target);
