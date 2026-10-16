import { createBackupStore } from "./draftState";

/** 浏览器内的未保存修改暂存（localStorage，跨刷新与重新登录保留） */
export const localBackups = createBackupStore(() =>
  typeof localStorage === "undefined" ? null : localStorage
);
