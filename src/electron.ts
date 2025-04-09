const electron = window.electron;

export const invoke = electron && electron.invoke;
export const on = electron && electron.on;
export const off = electron && electron.off;
export const send = electron && electron.send;
export const sendSync = electron && electron.sendSync;
export const platform = electron && electron.platform;
