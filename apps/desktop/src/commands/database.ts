import { invoke } from "@/electron";
import { rememberDatabaseConnection } from "@/services/command-context";
import type { DatabaseConnection } from "@/types/database-connection";

export type DatabaseConnectMode = "normal" | "maintenance";
export type DatabaseConnectSource = "sync_upload_reconnect" | "sync_download_reconnect";

let connecting = 0;

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
  const connection = await invoke<DatabaseConnection>(
    "create-or-connect-database",
    databaseName,
    force,
    mode,
    source
  );
  if (request === connecting) rememberDatabaseConnection(connection);
};

export const reconnectDatabaseFast = async (
  databaseName: string,
  source?: DatabaseConnectSource
) => {
  const request = ++connecting;
  const connection = await invoke<DatabaseConnection>(
    "reconnect-database-fast",
    databaseName,
    source
  );
  if (request === connecting) rememberDatabaseConnection(connection);
};

export const closeDatabase = async (databaseName: string, replace?: boolean) => {
  return await invoke("close-database", databaseName, replace);
};

export const forceCheckpoint = async (databaseName: string) => {
  return await invoke("force-checkpoint", databaseName);
};

export default connectDatabaseByName;
