import { invoke, on, off } from "@/electron";

export interface CreateTerminalOpts {
  cwd: string;
  cols: number;
  rows: number;
}

export const initTerminalModule = async (): Promise<void> => {
  await invoke("module-init:init-module", "terminal");
};

export const createTerminal = async (
  opts: CreateTerminalOpts,
): Promise<{ id: string }> => {
  return await invoke("terminal:create", opts);
};

export const writeTerminal = async (
  id: string,
  data: string,
): Promise<void> => {
  await invoke("terminal:write", { id, data });
};

export const resizeTerminal = async (
  id: string,
  cols: number,
  rows: number,
): Promise<void> => {
  await invoke("terminal:resize", { id, cols, rows });
};

export const destroyTerminal = async (id: string): Promise<void> => {
  await invoke("terminal:destroy", { id });
};

type TerminalDataListener = (
  event: unknown,
  payload: { id: string; data: string },
) => void;

type TerminalExitListener = (
  event: unknown,
  payload: { id: string; exitCode: number },
) => void;

export const onTerminalData = (listener: TerminalDataListener): void => {
  on("terminal:data", listener);
};

export const offTerminalData = (listener: TerminalDataListener): void => {
  off("terminal:data", listener);
};

export const onTerminalExit = (listener: TerminalExitListener): void => {
  on("terminal:exit", listener);
};

export const offTerminalExit = (listener: TerminalExitListener): void => {
  off("terminal:exit", listener);
};
