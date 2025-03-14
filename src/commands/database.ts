import { invoke } from "@/electron";

export const connectDatabaseByName = async (
  databaseName: string,
  force?: boolean,
) => {
  return await invoke("create-or-connect-database", databaseName, force);
};

export const closeDatabase = async (databaseName: string) => {
  return await invoke("close-database", databaseName);
};

export const forceCheckpoint = async (databaseName: string) => {
  return await invoke("force-checkpoint", databaseName);
};

export default connectDatabaseByName;
