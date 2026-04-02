import { invoke } from "@/electron";

export type DatabaseConnectMode = "normal" | "maintenance";
export type DatabaseConnectSource =
  | "sync_upload_reconnect"
  | "sync_download_reconnect";

type ConnectDatabaseOptions = {
  force?: boolean;
  mode?: DatabaseConnectMode;
  source?: DatabaseConnectSource;
};

const normalizeOptions = (
  options?: boolean | ConnectDatabaseOptions,
): ConnectDatabaseOptions => {
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
  options?: boolean | ConnectDatabaseOptions,
) => {
  const { force, mode, source } = normalizeOptions(options);
  return await invoke(
    "create-or-connect-database",
    databaseName,
    force,
    mode,
    source,
  );
};

export const reconnectDatabaseFast = async (
  databaseName: string,
  source?: DatabaseConnectSource,
) => {
  return await invoke("reconnect-database-fast", databaseName, source);
};

export const closeDatabase = async (databaseName: string) => {
  return await invoke("close-database", databaseName);
};

export const forceCheckpoint = async (databaseName: string) => {
  return await invoke("force-checkpoint", databaseName);
};

export default connectDatabaseByName;
