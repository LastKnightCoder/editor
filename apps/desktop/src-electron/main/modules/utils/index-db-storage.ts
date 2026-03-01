import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import PathUtil from "../../utils/PathUtil";

const SQLITE_SIDECAR_SUFFIXES = ["-wal", "-shm"] as const;

export interface MigrationResult {
  moved: boolean;
  skipped: boolean;
  reason: string;
  source: string;
  target: string;
}

export interface ScanLegacyResult {
  files: string[];
}

export const normalizeMainDbBase = (mainDbName: string): string => {
  return mainDbName.endsWith(".db") ? mainDbName.slice(0, -3) : mainDbName;
};

export const getIndexRootDir = (): string => {
  return join(PathUtil.getAppDir(), "index");
};

export const getIndexDbDir = (mainDbName: string): string => {
  return join(getIndexRootDir(), normalizeMainDbBase(mainDbName));
};

export const ensureIndexDbDir = (mainDbName: string): void => {
  mkdirSync(getIndexDbDir(mainDbName), { recursive: true });
};

const moveFileWithFallback = (sourcePath: string, targetPath: string): void => {
  try {
    renameSync(sourcePath, targetPath);
    return;
  } catch {
    copyFileSync(sourcePath, targetPath);
    unlinkSync(sourcePath);
  }
};

const removeFileIfExists = (filePath: string): boolean => {
  if (!existsSync(filePath)) {
    return false;
  }
  unlinkSync(filePath);
  return true;
};

export const cleanupLegacyIfMigrated = (
  legacyDbPath: string,
  targetDbPath: string,
): MigrationResult => {
  const source = legacyDbPath;
  const target = targetDbPath;
  if (!existsSync(target)) {
    return {
      moved: false,
      skipped: true,
      reason: "target_not_exists",
      source,
      target,
    };
  }

  let removedAny = removeFileIfExists(source);
  for (const suffix of SQLITE_SIDECAR_SUFFIXES) {
    removedAny = removeFileIfExists(`${source}${suffix}`) || removedAny;
  }

  return {
    moved: removedAny,
    skipped: !removedAny,
    reason: removedAny ? "legacy_removed" : "legacy_not_found",
    source,
    target,
  };
};

export const migrateDbFileWithSidecars = (
  legacyDbPath: string,
  targetDbPath: string,
): MigrationResult => {
  const source = legacyDbPath;
  const target = targetDbPath;

  if (!existsSync(source)) {
    return {
      moved: false,
      skipped: true,
      reason: "source_not_found",
      source,
      target,
    };
  }

  if (existsSync(target)) {
    const cleanupResult = cleanupLegacyIfMigrated(source, target);
    return {
      moved: cleanupResult.moved,
      skipped: true,
      reason: "target_exists_cleanup_legacy",
      source,
      target,
    };
  }

  mkdirSync(dirname(target), { recursive: true });

  moveFileWithFallback(source, target);

  for (const suffix of SQLITE_SIDECAR_SUFFIXES) {
    const sourceSidecar = `${source}${suffix}`;
    const targetSidecar = `${target}${suffix}`;
    if (!existsSync(sourceSidecar)) {
      continue;
    }
    if (existsSync(targetSidecar)) {
      removeFileIfExists(sourceSidecar);
      continue;
    }
    moveFileWithFallback(sourceSidecar, targetSidecar);
  }

  return {
    moved: true,
    skipped: false,
    reason: "migrated",
    source,
    target,
  };
};

export const scanLegacyDbFiles = (
  matcher: (fileName: string) => boolean,
): ScanLegacyResult => {
  const appDir = PathUtil.getAppDir();
  if (!existsSync(appDir)) {
    return { files: [] };
  }
  const files = readdirSync(appDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && matcher(entry.name))
    .map((entry) => join(appDir, entry.name));
  return { files };
};
