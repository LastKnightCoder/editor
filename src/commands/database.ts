import { invoke } from "@/electron";

export const connectDatabaseByName = async (databaseName: string, force?: boolean) => {
  return await invoke('create-or-connect-database', databaseName, force);
}

export default connectDatabaseByName;
