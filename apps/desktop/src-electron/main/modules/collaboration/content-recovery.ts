import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  renameSync,
  writeFileSync,
  chmodSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { canonicalContractJson } from "@tau/db-schema/content-contracts";
import { ContentLocalState, type LocalRecoveryReceipt } from "./content-local-state";

interface RecoveryFile {
  name: string;
  bytes: number;
  hash: string;
}
export interface ContentRecoveryManifest {
  version: 1;
  id: string;
  workspaceId: string;
  reason: "migration" | "library-replacement" | "private-block" | "offline-edit";
  provenance: Record<string, unknown>;
  files: RecoveryFile[];
  missing: string[];
}
const validId = (value: string) => /^[a-f0-9-]{36}$/.test(value);
const validName = (value: string) =>
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value) && value !== "manifest.json";
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");

function flush(path: string, directory = false) {
  // Windows 的 FlushFileBuffers 需要可写文件句柄，Node 不支持目录刷盘。
  if (directory && process.platform === "win32") return;
  const descriptor = openSync(path, directory ? "r" : "r+");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function fileDigest(path: string): { bytes: number; hash: string } {
  const information = lstatSync(path);
  if (!information.isFile() || information.isSymbolicLink())
    throw new Error("恢复材料必须是普通文件");
  const digest = createHash("sha256"),
    buffer = Buffer.alloc(1024 * 1024),
    descriptor = openSync(path, "r");
  let bytes = 0;
  try {
    let read: number;
    while ((read = readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
      digest.update(buffer.subarray(0, read));
      bytes += read;
    }
  } finally {
    closeSync(descriptor);
  }
  if (bytes !== information.size) throw new Error("恢复材料在读取期间发生变化");
  return { bytes, hash: digest.digest("hex") };
}

/** 恢复包独立于运行缓存，保存成功、迁移终止和迁移完成均不自动删除。 */
export class ContentRecoveryStore {
  readonly directory: string;
  constructor(
    directory: string,
    private readonly state: ContentLocalState
  ) {
    this.directory = join(directory, "content-recoveries");
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    for (const receipt of this.state.db
      .prepare(
        "SELECT id,manifest_hash AS manifestHash,manifest_path AS manifestPath FROM recoveries WHERE workspace_id IS NULL"
      )
      .all() as LocalRecoveryReceipt[]) {
      try {
        this.state.registerRecovery(receipt, this.manifest(receipt).workspaceId);
      } catch {
        const scopes = this.state.db
          .prepare(
            "SELECT workspace_id FROM migrations WHERE json_extract(record,'$.plan.recovery.id')=? UNION SELECT workspace_id FROM entity_holds WHERE holder=?"
          )
          .all(receipt.id, `recovery:${receipt.id}`) as { workspace_id: string }[];
        if (scopes.length === 1) this.state.registerRecovery(receipt, scopes[0].workspace_id);
        // 无法证明旧损坏材料的归属时保留原登记，不猜测属于当前资料库。
      }
    }
  }

  save(
    input: Omit<ContentRecoveryManifest, "version" | "id" | "files"> & {
      files: readonly ({ name: string; path: string } | { name: string; bytes: Uint8Array })[];
    },
    checkpoint?: (phase: "files-written" | "package-installed" | "registered") => void
  ): LocalRecoveryReceipt {
    if (
      !input.workspaceId ||
      input.files.length > 100_000 ||
      input.files.some(file => !validName(file.name)) ||
      new Set(input.files.map(file => file.name)).size !== input.files.length ||
      !input.missing.every(item => typeof item === "string")
    )
      throw new Error("恢复包清单无效");
    const id = randomUUID(),
      temporary = join(this.directory, `.pending-${id}`),
      destination = join(this.directory, id);
    mkdirSync(temporary, { mode: 0o700 });
    const files = input.files.map(file => {
      const before =
          "path" in file
            ? fileDigest(file.path)
            : { bytes: file.bytes.byteLength, hash: hash(file.bytes) },
        target = join(temporary, file.name);
      if ("path" in file) copyFileSync(file.path, target);
      else writeFileSync(target, file.bytes, { flag: "wx", mode: 0o600 });
      chmodSync(target, 0o600);
      flush(target);
      const after = fileDigest(target);
      if (
        before.bytes !== after.bytes ||
        before.hash !== after.hash ||
        ("path" in file && !sameDigest(before, fileDigest(file.path)))
      )
        throw new Error("恢复材料在复制期间发生变化");
      return { name: file.name, ...after };
    });
    const manifest: ContentRecoveryManifest = {
      version: 1,
      id,
      workspaceId: input.workspaceId,
      reason: input.reason,
      provenance: input.provenance,
      files,
      missing: input.missing,
    };
    const encoded = Buffer.from(canonicalContractJson(manifest));
    if (encoded.length > 16 * 1024 * 1024) throw new Error("恢复包清单超过预算");
    writeFileSync(join(temporary, "manifest.json"), encoded, { flag: "wx", mode: 0o600 });
    flush(join(temporary, "manifest.json"));
    flush(temporary, true);
    checkpoint?.("files-written");
    renameSync(temporary, destination);
    flush(this.directory, true);
    checkpoint?.("package-installed");
    const receipt = {
      id,
      manifestHash: hash(encoded),
      manifestPath: join(destination, "manifest.json"),
    };
    this.verify(receipt);
    this.state.registerRecovery(receipt, input.workspaceId);
    checkpoint?.("registered");
    return receipt;
  }

  manifest(receipt: LocalRecoveryReceipt): ContentRecoveryManifest {
    if (
      !validId(receipt.id) ||
      receipt.manifestPath !== join(this.directory, receipt.id, "manifest.json")
    )
      throw new Error("恢复包路径无效");
    const directory = join(this.directory, receipt.id),
      information = lstatSync(directory);
    if (!information.isDirectory() || information.isSymbolicLink())
      throw new Error("恢复包目录无效");
    const manifestFile = lstatSync(receipt.manifestPath);
    if (
      !manifestFile.isFile() ||
      manifestFile.isSymbolicLink() ||
      manifestFile.size > 16 * 1024 * 1024
    )
      throw new Error("恢复包清单无效");
    const encoded = readFileSync(receipt.manifestPath);
    if (hash(encoded) !== receipt.manifestHash) throw new Error("恢复包清单摘要不匹配");
    const manifest = JSON.parse(encoded.toString("utf8")) as ContentRecoveryManifest;
    if (
      manifest.version !== 1 ||
      manifest.id !== receipt.id ||
      !manifest.workspaceId ||
      !Array.isArray(manifest.files) ||
      !Array.isArray(manifest.missing) ||
      manifest.files.length > 100_000 ||
      !manifest.missing.every(item => typeof item === "string")
    )
      throw new Error("恢复包格式无效");
    const names = new Set<string>();
    for (const file of manifest.files) {
      if (
        !validName(file.name) ||
        names.has(file.name) ||
        !Number.isSafeInteger(file.bytes) ||
        file.bytes < 0 ||
        !/^[a-f0-9]{64}$/.test(file.hash)
      )
        throw new Error("恢复包文件记录无效");
      names.add(file.name);
    }
    return manifest;
  }

  verify(receipt: LocalRecoveryReceipt): ContentRecoveryManifest {
    const manifest = this.manifest(receipt);
    for (const file of manifest.files)
      if (!sameDigest(fileDigest(join(this.directory, receipt.id, file.name)), file))
        throw new Error("恢复材料缺失或已损坏");
    return manifest;
  }

  readFile(receipt: LocalRecoveryReceipt, name: string): Buffer {
    const manifest = this.manifest(receipt);
    const file = manifest.files.find(file => file.name === name);
    if (!file) throw new Error("恢复包缺少所需文件");
    const bytes = readFileSync(join(this.directory, receipt.id, name));
    if (bytes.length !== file.bytes || hash(bytes) !== file.hash)
      throw new Error("恢复材料缺失或已损坏");
    return bytes;
  }

  export(receipt: LocalRecoveryReceipt, parent: string): string {
    const manifest = this.verify(receipt);
    const target = join(parent, `tau-recovery-${receipt.id}`),
      temporary = join(parent, `.tau-recovery-${randomUUID()}`);
    if (existsSync(target)) throw new Error("目标目录已有这份恢复包，请选择其他目录");
    mkdirSync(temporary, { mode: 0o700 });
    try {
      for (const file of manifest.files) {
        const destination = join(temporary, file.name);
        copyFileSync(join(this.directory, receipt.id, file.name), destination);
        if (!sameDigest(fileDigest(destination), file)) throw new Error("导出的恢复材料校验失败");
        flush(destination);
      }
      const manifestPath = join(temporary, "manifest.json");
      copyFileSync(receipt.manifestPath, manifestPath);
      if (hash(readFileSync(manifestPath)) !== receipt.manifestHash)
        throw new Error("导出的清单校验失败");
      flush(manifestPath);
      flush(temporary, true);
      renameSync(temporary, target);
      flush(parent, true);
      return target;
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }

  /** 处理包落盘后、登记回执前的断电；不能凭目录存在就认定完整。 */
  recoverUnregistered(): LocalRecoveryReceipt[] {
    const recovered: LocalRecoveryReceipt[] = [];
    for (let name of readdirSync(this.directory)) {
      if (name.startsWith(".pending-") && validId(name.slice(9))) {
        const pending = join(this.directory, name),
          final = join(this.directory, name.slice(9));
        const information = lstatSync(pending);
        if (!information.isDirectory() || information.isSymbolicLink())
          throw new Error("待安装恢复包目录无效");
        if (!existsSync(join(pending, "manifest.json")) || existsSync(final)) continue;
        renameSync(pending, final);
        flush(this.directory, true);
        name = name.slice(9);
      }
      if (!validId(name) || this.state.recovery(name)) continue;
      const manifestPath = join(this.directory, name, "manifest.json");
      const information = lstatSync(manifestPath);
      if (
        !information.isFile() ||
        information.isSymbolicLink() ||
        information.size > 16 * 1024 * 1024
      )
        throw new Error("未登记恢复包清单无效");
      const receipt = { id: name, manifestPath, manifestHash: hash(readFileSync(manifestPath)) };
      const manifest = this.verify(receipt);
      this.state.registerRecovery(receipt, manifest.workspaceId);
      recovered.push(receipt);
    }
    return recovered;
  }
}

function sameDigest(left: { bytes: number; hash: string }, right: { bytes: number; hash: string }) {
  return left.bytes === right.bytes && left.hash === right.hash;
}
