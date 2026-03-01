import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import PathUtil from "../../utils/PathUtil";
import {
  cleanupLegacyIfMigrated,
  migrateDbFileWithSidecars,
  scanLegacyDbFiles,
} from "../utils/index-db-storage";

const createdRoots: string[] = [];

const createTempRoot = (): string => {
  const root = join(
    tmpdir(),
    `index-db-storage-${Date.now()}-${Math.random()}`,
  );
  mkdirSync(root, { recursive: true });
  createdRoots.push(root);
  return root;
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of createdRoots.splice(0, createdRoots.length)) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe("index-db-storage", () => {
  it("应迁移 db 与 wal/shm sidecar 到目标目录", () => {
    const root = createTempRoot();
    const legacyDbPath = join(root, "data-video-note-1.db");
    const targetDbPath = join(root, "index", "data", "data-video-note-1.db");

    writeFileSync(legacyDbPath, "legacy-db");
    writeFileSync(`${legacyDbPath}-wal`, "legacy-wal");
    writeFileSync(`${legacyDbPath}-shm`, "legacy-shm");

    const result = migrateDbFileWithSidecars(legacyDbPath, targetDbPath);
    expect(result.moved).toBe(true);
    expect(result.reason).toBe("migrated");

    expect(existsSync(targetDbPath)).toBe(true);
    expect(existsSync(`${targetDbPath}-wal`)).toBe(true);
    expect(existsSync(`${targetDbPath}-shm`)).toBe(true);
    expect(existsSync(legacyDbPath)).toBe(false);
    expect(existsSync(`${legacyDbPath}-wal`)).toBe(false);
    expect(existsSync(`${legacyDbPath}-shm`)).toBe(false);
  });

  it("当目标已存在时应清理旧路径残留", () => {
    const root = createTempRoot();
    const legacyDbPath = join(root, "data-project-2.db");
    const targetDbPath = join(root, "index", "data", "data-project-2.db");
    mkdirSync(join(root, "index", "data"), { recursive: true });

    writeFileSync(legacyDbPath, "legacy-db");
    writeFileSync(`${legacyDbPath}-wal`, "legacy-wal");
    writeFileSync(`${legacyDbPath}-shm`, "legacy-shm");
    writeFileSync(targetDbPath, "new-db");
    writeFileSync(`${targetDbPath}-wal`, "new-wal");
    writeFileSync(`${targetDbPath}-shm`, "new-shm");

    const result = migrateDbFileWithSidecars(legacyDbPath, targetDbPath);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("target_exists_cleanup_legacy");
    expect(existsSync(legacyDbPath)).toBe(false);
    expect(existsSync(`${legacyDbPath}-wal`)).toBe(false);
    expect(existsSync(`${legacyDbPath}-shm`)).toBe(false);
    expect(readFileSync(targetDbPath, "utf8")).toBe("new-db");
  });

  it("scan 应只返回 appDir 根目录匹配文件", () => {
    const root = createTempRoot();
    mkdirSync(join(root, "index", "data"), { recursive: true });
    writeFileSync(join(root, "data.index.db"), "x");
    writeFileSync(join(root, "data.index.db-wal"), "x");
    writeFileSync(join(root, "foo.txt"), "x");
    writeFileSync(join(root, "index", "data", "nested.index.db"), "x");

    vi.spyOn(PathUtil, "getAppDir").mockReturnValue(root);

    const { files } = scanLegacyDbFiles((fileName) =>
      fileName.endsWith(".index.db"),
    );
    expect(files).toHaveLength(1);
    expect(files[0]).toBe(join(root, "data.index.db"));

    const cleanupResult = cleanupLegacyIfMigrated(
      join(root, "not-exists.db"),
      join(root, "index", "data", "nested.index.db"),
    );
    expect(cleanupResult.reason).toBe("legacy_not_found");
  });
});
