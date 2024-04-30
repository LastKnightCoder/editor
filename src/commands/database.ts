import { invoke } from "@tauri-apps/api";

export const connectDatabaseByName = async (databaseName: string) => {
  return await invoke('connect_database_by_name', { databaseName });
}

export default connectDatabaseByName;
