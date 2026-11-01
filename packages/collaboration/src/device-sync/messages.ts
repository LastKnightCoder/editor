// 设备同步的界面文案：把宿主抛出的 DEVICE_SYNC_* 错误翻成「发生了什么 + 下一步」，两端共用一套说法

export interface DeviceSyncProblem {
  title: string;
  hint: string;
  /** 下一步是重新粘贴配对信息 */
  repair?: boolean;
  /** 原始错误，供「复制错误详情」使用 */
  detail: string;
}

const PROBLEMS: Record<string, Omit<DeviceSyncProblem, "detail">> = {
  OFFLINE: {
    title: "暂时连不上协调电脑",
    hint: "本机照常阅读和编辑，修改已保存在这台设备上，连上后自动补齐。",
  },
  ADDRESS: {
    title: "在局域网里找不到协调电脑",
    hint: "确认两台设备在同一个局域网；协调电脑换了网络地址时，重新粘贴一次配对信息。",
    repair: true,
  },
  PAIR: { title: "配对信息不完整", hint: "请在协调电脑上重新复制，整段粘贴。" },
  PAIR_EXPIRED: {
    title: "配对信息已过期",
    hint: "配对信息 5 分钟内有效，请在协调电脑上点「添加设备」重新生成。",
  },
  UNTRUSTED: {
    title: "这台设备的配对已被解除",
    hint: "在协调电脑上添加设备，把新的配对信息粘贴过来；本机的修改会保留。",
    repair: true,
  },
  CERTIFICATE: {
    title: "协调电脑的身份校验没有通过",
    hint: "为了安全已停止连接。请在协调电脑上重新生成配对信息再粘贴。",
    repair: true,
  },
  SCHEMA: {
    title: "两台设备的 Tau 版本不一致",
    hint: "先把两边都更新到最新版本，再重试。",
  },
  SHARED_CONTENT: {
    title: "这份资料库有正在云端共享的正文",
    hint: "设备同步不能和云端共享正文同时使用。先在协作里结束共享，再回来开启。",
  },
  VERSION: {
    title: "两台设备的同步协议不兼容",
    hint: "先将配对设备都更新到支持稳定身份归并的版本，再重试。",
  },
  AUTHORITY: {
    title: "这份资料库由另一台电脑协调",
    hint: "请连接这份资料库原来的协调电脑。",
    repair: true,
  },
  AUTHORITY_BEHIND: {
    title: "协调电脑上的资料库比之前旧",
    hint: "可能是从旧备份恢复的。为了不覆盖其他设备，已停止同步，请先检查协调电脑的整库备份。",
  },
  BUDGET: {
    title: "这次修改太大，无法一次同步",
    hint: "原有资料都已保留。单次同步上限 64 MiB，图片单张上限 25 MiB。",
  },
  DISABLED: { title: "协调电脑暂停了局域网连接", hint: "在协调电脑上恢复连接后会自动补齐。" },
  BUSY: { title: "配对还在进行", hint: "请等这次配对完成后再试。" },
  CLOSED: { title: "连接已停止", hint: "稍后会自动重新连接。" },
  REPLACED: { title: "当前资料库正在恢复", hint: "完成后会自动继续同步。" },
};

const CODE = /DEVICE_SYNC_([A-Z_]+)/;

/** 原始错误中的设备同步错误码（不含前缀），无则 undefined */
export function deviceSyncErrorCode(error: unknown): string | undefined {
  return String(error ?? "").match(CODE)?.[1];
}

/** 把任意错误转成界面可读的说明；未登记的错误码保留宿主原文作为标题 */
export function describeDeviceSyncError(error: unknown): DeviceSyncProblem {
  const detail = String(error instanceof Error ? error.message : (error ?? ""));
  const known = PROBLEMS[deviceSyncErrorCode(detail) ?? ""];
  if (known) return { ...known, detail };
  // Electron 会在消息前加 "Error invoking remote method 'x': Error: "
  const text = detail
    .replace(/^Error invoking remote method '[^']*':\s*/, "")
    .replace(/^(Error:\s*)+/, "")
    .replace(CODE, "")
    .replace(/^[:：\s]+/, "")
    .trim();
  return {
    title: text || "这次同步没有完成",
    hint: "已保存的内容不受影响，可以继续编辑。",
    detail,
  };
}

export interface DevicePairPreview {
  expires: number;
  /** 协调电脑的本地主机名（配对信息里有才返回） */
  host?: string;
}

/**
 * 只解出配对信息里可以展示的部分（有效期、主机名），不读取也不返回密钥。
 * 格式不对返回 null；是否过期由调用方按 expires 判断，最终仍以宿主校验为准。
 */
export function previewDevicePairCode(value: string): DevicePairPreview | null {
  const text = value.trim();
  if (!text.startsWith("tau-pair:v1:") || text.length > 16 * 1024) return null;
  try {
    const base64 = text.slice(12).replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))) as {
      expires?: unknown;
      addresses?: unknown;
    };
    if (typeof payload.expires !== "number") return null;
    const host = Array.isArray(payload.addresses)
      ? payload.addresses.find(
          (item): item is string => typeof item === "string" && item.endsWith(".local")
        )
      : undefined;
    return { expires: payload.expires, host: host?.slice(0, -".local".length) };
  } catch {
    return null;
  }
}
