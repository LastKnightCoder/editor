import React from "react";
import { render, Box, Text } from "ink";
import { statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDataAccess } from "../../data-access/index.js";
import { isAppRunning } from "../../data-access/notify.js";
import { getAppDir, getDbPath } from "../../utils/path.js";

interface DatabaseConfig {
  name: string;
  version: number;
}

interface Settings {
  database?: {
    active?: string;
    databases?: DatabaseConfig[];
  };
}

interface StatusInfo {
  appRunning: boolean | null;
  dbName: string;
  dbPath: string;
  version: number | null;
  sizeBytes: number;
  walSizeBytes: number;
  tableCount: number;
  journalMode: string;
}

function readSettings(): Settings {
  try {
    const content = readFileSync(join(getAppDir(), "setting.json"), "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function StatusView({ status }: { status: StatusInfo }) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Tau Database Status
        </Text>
      </Box>
      <Text dimColor>{"─".repeat(35)}</Text>
      <Box flexDirection="column" gap={0}>
        <Row
          label="App Status"
          value={
            status.appRunning === null
              ? "Unknown"
              : status.appRunning
                ? "Running"
                : "Not Running"
          }
          color={
            status.appRunning === null
              ? "gray"
              : status.appRunning
                ? "green"
                : "yellow"
          }
        />
        <Row label="Database" value={status.dbName} />
        <Row label="Path" value={status.dbPath} />
        <Row
          label="Version"
          value={status.version !== null ? String(status.version) : "N/A"}
        />
        <Row label="Size" value={formatBytes(status.sizeBytes)} />
        <Row label="WAL Size" value={formatBytes(status.walSizeBytes)} />
        <Row label="Journal Mode" value={status.journalMode} />
        <Row label="Tables" value={String(status.tableCount)} />
      </Box>
    </Box>
  );
}

function Row({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <Box>
      <Box width={16}>
        <Text dimColor>{label}</Text>
      </Box>
      <Text color={color}>{value}</Text>
    </Box>
  );
}

export async function runDbStatus() {
  const settings = readSettings();
  const dbName = settings.database?.active ?? "data.db";
  const dbConfig = settings.database?.databases?.find((d) => d.name === dbName);
  const version = dbConfig?.version ?? null;

  const dbPath = getDbPath(dbName);
  const da = getDataAccess(dbName);

  let sizeBytes = 0;
  let walSizeBytes = 0;
  try {
    sizeBytes = statSync(dbPath).size;
  } catch {
    /* file may not exist */
  }
  try {
    walSizeBytes = statSync(dbPath + "-wal").size;
  } catch {
    /* WAL may not exist */
  }

  const jm = da.queryOne<{ journal_mode: string }>("PRAGMA journal_mode");
  const journalMode = jm?.journal_mode ?? "unknown";

  const result = da.queryOne<{ count: number }>(
    `SELECT count(*) as count FROM sqlite_master WHERE type = 'table'`,
  );
  const tableCount = result?.count ?? 0;

  const appRunning = await isAppRunning();

  da.close();

  render(
    <StatusView
      status={{
        appRunning,
        dbName,
        dbPath,
        version,
        sizeBytes,
        walSizeBytes,
        tableCount,
        journalMode,
      }}
    />,
  );
}
