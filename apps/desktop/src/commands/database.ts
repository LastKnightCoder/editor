import { invoke } from "@/electron";

export type DatabaseConnectMode = "normal" | "maintenance";

type ConnectDatabaseOptions = {
  force?: boolean;
  mode?: DatabaseConnectMode;
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
  };
};

export const connectDatabaseByName = async (
  databaseName: string,
  options?: boolean | ConnectDatabaseOptions,
) => {
  const { force, mode } = normalizeOptions(options);
  return await invoke("create-or-connect-database", databaseName, force, mode);
};

export const reconnectDatabaseFast = async (databaseName: string) => {
  return await invoke("reconnect-database-fast", databaseName);
};

export const closeDatabase = async (databaseName: string) => {
  return await invoke("close-database", databaseName);
};

export const forceCheckpoint = async (databaseName: string) => {
  return await invoke("force-checkpoint", databaseName);
};

export default connectDatabaseByName;
