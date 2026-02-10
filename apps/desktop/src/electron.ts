const bridge = window.electron;

const ensureBridge = (): ElectronAPI => {
  if (!bridge) {
    throw new Error("Electron API is not available in this runtime");
  }
  return bridge;
};

export const invoke = <T = any>(
  channel: string,
  ...args: any[]
): Promise<T> => {
  return ensureBridge().invoke(channel, ...args);
};

export const send = (channel: string, ...args: any[]): void => {
  ensureBridge().send(channel, ...args);
};

export const sendSync = (channel: string, ...args: any[]): any => {
  return ensureBridge().sendSync(channel, ...args);
};

export const on = (
  channel: string,
  listener: (...args: any[]) => void,
): void => {
  ensureBridge().on(channel, listener);
};

export const off = (
  channel: string,
  listener: (...args: any[]) => void,
): void => {
  ensureBridge().off(channel, listener);
};

export const platform: string = bridge?.platform ?? "web";
