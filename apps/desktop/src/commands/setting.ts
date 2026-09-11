import { settingCommands } from "@tau/contracts";

export async function getSetting(): Promise<string> {
  return settingCommands.read.call();
}

export async function saveSetting(setting: string): Promise<void> {
  return settingCommands.write.call(setting);
}
