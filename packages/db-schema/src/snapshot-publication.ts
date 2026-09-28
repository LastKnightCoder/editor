import { assertCompatibleSync } from "./sync-version";

export interface SnapshotInfo {
  version: number;
  dataModelVersion?: number;
  commitId?: string;
  parentVersion?: number;
  databaseObject?: string;
  sessionsObject?: string;
  [key: string]: unknown;
}

export interface SnapshotPublicationProvider {
  downloadFile(name: string): Promise<Uint8Array>;
  fileExists(name: string): Promise<boolean>;
  uploadFile(name: string, data: Uint8Array): Promise<boolean>;
  /** 后端原子创建：已存在时返回 false，禁止 GET 后普通覆盖。 */
  createFileIfAbsent(name: string, data: Uint8Array): Promise<boolean>;
}

export const successorObject = (pointer: string, version: number) => `${pointer}.next-${version}`;
const parseInfo = (data: Uint8Array): SnapshotInfo => {
  const info = JSON.parse(new TextDecoder().decode(data));
  if (!info || !Number.isSafeInteger(info.version) || info.version < 0)
    throw new Error("远端版本号无效");
  assertCompatibleSync(info);
  return info;
};

/** 指针只是加速入口，后继记录是提交事实；旧指针或发布响应丢失不影响发现新版本。 */
export async function readSnapshotHead(
  provider: Pick<SnapshotPublicationProvider, "downloadFile" | "fileExists">,
  pointer: string
): Promise<SnapshotInfo> {
  let info = (await provider.fileExists(pointer))
    ? parseInfo(await provider.downloadFile(pointer))
    : { version: 0 };
  for (let depth = 0; depth < 10000; depth += 1) {
    const nextObject = successorObject(pointer, info.version);
    if (!(await provider.fileExists(nextObject))) return info;
    const next = parseInfo(await provider.downloadFile(nextObject));
    if (next.parentVersion !== info.version || next.version <= info.version || !next.commitId)
      throw new Error("远端版本链无效");
    info = next;
  }
  throw new Error("远端版本链过长，需要整理版本指针");
}

/** 数据对象上传完成后调用；所有竞争者争用同一个后继对象，最多一个提交成功。 */
export async function publishSnapshot(
  provider: SnapshotPublicationProvider,
  pointer: string,
  parent: SnapshotInfo,
  next: SnapshotInfo
): Promise<void> {
  if (
    !Number.isSafeInteger(parent.version) ||
    parent.version < 0 ||
    !Number.isSafeInteger(next.version) ||
    typeof next.commitId !== "string" ||
    !next.commitId ||
    next.parentVersion !== parent.version ||
    next.version <= parent.version
  )
    throw new Error("快照提交身份无效");
  assertCompatibleSync(next);
  const object = successorObject(pointer, parent.version);
  const bytes = new TextEncoder().encode(JSON.stringify(next));
  try {
    if (!(await provider.createFileIfAbsent(object, bytes)))
      throw new Error("远端已被其他设备更新，请重新下载");
  } catch (error) {
    // 网络错误可能发生在后端已经提交之后，必须按提交身份核验，不能直接重写。
    let committed: SnapshotInfo;
    try {
      committed = parseInfo(await provider.downloadFile(object));
    } catch {
      throw new Error(`无法确认快照是否已提交，请重新检查同步状态：${String(error)}`);
    }
    if (
      committed.commitId !== next.commitId ||
      committed.databaseObject !== next.databaseObject ||
      committed.sessionsObject !== next.sessionsObject
    )
      throw new Error("远端已被其他设备更新，本次快照未发布");
  }
  // 即使较早发布者的指针迟到，读者仍沿后继记录到达最新提交。
  await provider.uploadFile(pointer, bytes).catch(() => false);
}
