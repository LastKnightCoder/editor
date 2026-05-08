import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { statSync } from "node:fs";
import { getDataAccess } from "../../../data-access/index.js";
import { isAppRunning } from "../../../data-access/notify.js";
import { getActiveDatabase } from "../../../utils/settings.js";
import { getDbPath, getActiveDbName } from "../../../utils/path.js";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function DbStatusView({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<{
    appRunning: boolean | null;
    dbName: string;
    dbPath: string;
    version: number;
    sizeBytes: number;
    walSizeBytes: number;
    tableCount: number;
    journalMode: string;
  } | null>(null);

  useEffect(() => {
    const db = getActiveDatabase();
    const dbName = getActiveDbName();
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

    isAppRunning()
      .then((running) => {
        setStatus({
          appRunning: running,
          dbName: db.name,
          dbPath,
          version: db.version,
          sizeBytes,
          walSizeBytes,
          tableCount,
          journalMode,
        });
      })
      .catch(() => {
        setStatus({
          appRunning: false,
          dbName: db.name,
          dbPath,
          version: db.version,
          sizeBytes,
          walSizeBytes,
          tableCount,
          journalMode,
        });
      });
  }, []);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onBack();
    }
  });

  if (!status) {
    return <Text dimColor>Loading...</Text>;
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={0}>
        <Text bold color="cyan">
          Database Status
        </Text>
      </Box>
      <Text dimColor>{"─".repeat(50)}</Text>
      <Box flexDirection="column" marginY={1}>
        <Box>
          <Box width={16}>
            <Text dimColor>App Status</Text>
          </Box>
          <Text color={status.appRunning ? "green" : "yellow"}>
            {status.appRunning ? "Running" : "Not Running"}
          </Text>
        </Box>
        <Box>
          <Box width={16}>
            <Text dimColor>Database</Text>
          </Box>
          <Text>{status.dbName}</Text>
        </Box>
        <Box>
          <Box width={16}>
            <Text dimColor>Path</Text>
          </Box>
          <Text>{status.dbPath}</Text>
        </Box>
        <Box>
          <Box width={16}>
            <Text dimColor>Version</Text>
          </Box>
          <Text>{status.version}</Text>
        </Box>
        <Box>
          <Box width={16}>
            <Text dimColor>Size</Text>
          </Box>
          <Text>{formatBytes(status.sizeBytes)}</Text>
        </Box>
        <Box>
          <Box width={16}>
            <Text dimColor>WAL Size</Text>
          </Box>
          <Text>{formatBytes(status.walSizeBytes)}</Text>
        </Box>
        <Box>
          <Box width={16}>
            <Text dimColor>Journal Mode</Text>
          </Box>
          <Text>{status.journalMode}</Text>
        </Box>
        <Box>
          <Box width={16}>
            <Text dimColor>Tables</Text>
          </Box>
          <Text>{status.tableCount}</Text>
        </Box>
      </Box>
      <Text dimColor>{"─".repeat(50)}</Text>
      <Text dimColor>Esc/q back</Text>
    </Box>
  );
}
