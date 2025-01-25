import { invoke } from "@/electron";

export const connectDatabaseByName = async (databaseName: string) => {
  return await invoke('create-or-connect-database', databaseName);
}

export default connectDatabaseByName;
