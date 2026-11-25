import { invoke, on } from "@/electron";
import {
  getDatabaseConnection,
  rememberDatabaseConnection,
  updateDatabaseConnection,
} from "@/services/command-context";
import type { DatabaseConnection } from "@/types/database-connection";

export type DatabaseConnectMode = "normal" | "maintenance";
export type DatabaseConnectSource = "sync_upload_reconnect" | "sync_download_reconnect";

let connecting = 0;

on("database:sync-reconnected", (_event, connection: DatabaseConnection) => {
  updateDatabaseConnection(connection);
});

function finishConnection(
  request: number,
  previous: DatabaseConnection | undefined,
  response: DatabaseConnection
) {
  if (request !== connecting) return;
  const latest = getDatabaseConnection(response.databaseName);
  // 重连广播可能先于旧 IPC 响应到达，不能把已发布的新身份改回去。
  rememberDatabaseConnection(latest && latest !== previous ? latest : response);
}

type ConnectDatabaseOptions = {
  force?: boolean;
  mode?: DatabaseConnectMode;
  source?: DatabaseConnectSource;
};

const normalizeOptions = (options?: boolean | ConnectDatabaseOptions): ConnectDatabaseOptions => {
  if (typeof options === "boolean") {
    return {
      force: options,
      mode: "maintenance",
    };
  }
  return {
    force: options?.force,
    mode: options?.mode ?? "maintenance",
    source: options?.source,
  };
};

export const connectDatabaseByName = async (
  databaseName: string,
  options?: boolean | ConnectDatabaseOptions
) => {
  const { force, mode, source } = normalizeOptions(options);
  const request = ++connecting;
  const previous = getDatabaseConnection(databaseName);
  const connection = await invoke<DatabaseConnection>(
    "create-or-connect-database",
    databaseName,
    force,
    mode,
    source
  );
  finishConnection(request, previous, connection);
};

export const reconnectDatabaseFast = async (
  databaseName: string,
  source?: DatabaseConnectSource
) => {
  const request = ++connecting;
  const previous = getDatabaseConnection(databaseName);
  const connection = await invoke<DatabaseConnection>(
    "reconnect-database-fast",
    databaseName,
    source
  );
  finishConnection(request, previous, connection);
};

export const closeDatabase = async (databaseName: string, replace?: boolean) => {
  return await invoke("close-database", databaseName, replace);
};
