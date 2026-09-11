import { cliCommands, type CliStatus, type CliOperationResult } from "@/commands/contracts/cli";

export type { CliStatus, CliOperationResult };

export const getCliStatus = async (): Promise<CliStatus> => {
  return cliCommands.getStatus.call();
};

export const installCli = async (): Promise<CliOperationResult> => {
  return cliCommands.install.call();
};

export const uninstallCli = async (): Promise<CliOperationResult> => {
  return cliCommands.uninstall.call();
};
