import type { Platform } from "./types";

/**
 * 能力标识清单（方法级粒度）。
 *
 * supports() 只接受本清单内的标识，拼写错误在编译期暴露；
 * 服务端 RPC 的 UNSUPPORTED 错误码还原为异常时也使用同一标识。
 */
export const CAPABILITY_IDS = [
  "window.close",
  "window.minimize",
  "window.maximize",
  "window.toggle-fullscreen",
  "window.always-on-top",
  "window.state",
  "window.show-focus",
  "window.open-markdown",
  "window.open-editor",
  "window.pomodoro-main",
  "window.pomodoro-mini",
  "window.pomodoro-immersive",
  "window.maximized-events",
  "window.fullscreen-events",
  "window.focus-events",
  "fileDialog.select-file",
  "fileDialog.select-directory",
  "fileDialog.save-file",
  "fileDialog.download-file",
  "localFile.read-text",
  "localFile.write-text",
  "localFile.read-binary",
  "localFile.write-binary",
  "localFile.create-exclusive",
  "localFile.remove",
  "localFile.rename",
  "localFile.create-dir",
  "localFile.exists",
  "localFile.read-dir",
  "localFile.watch",
  "shell.open-external",
  "shell.show-in-folder",
  "shell.open-with-default-app",
  "system.fonts",
  "system.home-dir",
  "system.app-dir",
  "system.user-data-dir",
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

/**
 * 当前环境不支持该平台能力（如 Web 下无窗口概念）。
 *
 * 与 @tau/rpc 的 RpcErrorCode.UNSUPPORTED 对应：客户端还原服务端
 * UNSUPPORTED 错误时也抛本异常，调用方只需处理一种形态。
 */
export class UnsupportedError extends Error {
  constructor(
    readonly capability: CapabilityId,
    message?: string
  ) {
    super(message ?? `capability "${capability}" is not supported on this platform`);
    this.name = "UnsupportedError";
  }
}

/** 生成指定能力的 UnsupportedError 抛出函数（async 版：抛出表现为 rejected promise，供 Promise 方法用） */
export function unsupported(capability: CapabilityId) {
  return async (): Promise<never> => {
    throw new UnsupportedError(capability);
  };
}

/** 同步抛 UnsupportedError（订阅类方法用：签名返回取消函数而非 Promise） */
export function unsupportedSync(capability: CapabilityId) {
  return (): never => {
    throw new UnsupportedError(capability);
  };
}

/** 以白名单集合实现的 supports；实现类构造时传入自己支持的能力 */
export function supportsWith(supported: ReadonlySet<CapabilityId>): Platform["supports"] {
  return capability => supported.has(capability);
}
