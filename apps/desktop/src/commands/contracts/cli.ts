import { command } from "@tau/rpc";

export interface CliStatus {
  installed: boolean;
  path: string;
}

export interface CliOperationResult {
  success: boolean;
  error?: string;
}

/** tau CLI 安装管理（桌面专属概念，不进共享契约包） */
export const cliCommands = {
  getStatus: command<[], CliStatus>("cli:get-status"),
  install: command<[], CliOperationResult>("cli:install"),
  uninstall: command<[], CliOperationResult>("cli:uninstall"),
};
