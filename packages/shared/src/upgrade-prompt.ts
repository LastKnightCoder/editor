/**
 * 通用应用升级提示契约与错误分类器（桌面端与移动端共用，零 UI / 平台依赖）。
 *
 * 所有「旧端遇到新版数据结构、协议或插件版本要求」的拦截场景统一通过本契约描述原因与数据保护承诺，
 * 由各端宿主挂载统一的升级闭环 UI 承接。
 */

export type UpgradePromptReason =
  | "calendar-timezone-write"
  | "calendar-timezone-drag"
  | "whiteboard-readonly"
  | "collaboration-incompatible"
  | "plugin-min-version"
  | "db-model-incompatible"
  | "content-source-unsupported"
  | "generic";

export interface UpgradePromptExplanationRow {
  label: string;
  text: string;
}

export interface UpgradePromptExplanation {
  triggerLabel: string;
  rows: UpgradePromptExplanationRow[];
}

export interface UpgradePromptSecondaryAction {
  label: string;
  onClick: () => void;
}

export interface UpgradePromptRequest {
  reason: UpgradePromptReason;
  /** 缺省按 reason 使用对应预设文案 */
  title?: string;
  description?: string;
  /** 操作对象徽标（如日程标题、插件名、资料库名） */
  context?: string;
  /** 数据保护说明（消除用户对原数据是否受损的担忧） */
  dataSafety?: string;
  /** 最低所需版本号（不含 v 前缀，如 "0.63.0"） */
  minAppVersion?: string;
  /** 可选折叠说明（用于解释版本差异） */
  explanation?: UpgradePromptExplanation;
  /** 可选业务脱困动作（如日程表单「还原时间」以继续保存标题或备注） */
  secondaryAction?: UpgradePromptSecondaryAction;
  /** 不可关闭（如启动开库阶段的数据模型不兼容） */
  critical?: boolean;
  /** 原始技术错误文本（供排障展示） */
  rawError?: string;
}

export interface UpgradeRequiredMatch {
  reason: UpgradePromptReason;
  minAppVersion?: string;
  rawMessage: string;
}

const KNOWN_REASONS = new Set<UpgradePromptReason>([
  "calendar-timezone-write",
  "calendar-timezone-drag",
  "whiteboard-readonly",
  "collaboration-incompatible",
  "plugin-min-version",
  "db-model-incompatible",
  "content-source-unsupported",
  "generic",
]);

/** 未来服务端 / 数据库 / 插件约定的统一升级前缀：UPGRADE_REQUIRED:<reason>[@<version>]: <detail> */
const STRUCTURED_UPGRADE_RE =
  /\bUPGRADE_REQUIRED:([a-z0-9-]+)(?:@v?([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?))?/i;

const VERSION_IN_TEXT_RE = /\bv?([0-9]+\.[0-9]+\.[0-9]+)\b/;

export function extractUpgradeErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

/**
 * 识别需要升级客户端才能继续的错误。
 * 兼容现有 SQLite Trigger、主进程、协作端与插件宿主文案，并支持结构化 UPGRADE_REQUIRED 前缀。
 */
export function parseUpgradeRequiredError(error: unknown): UpgradeRequiredMatch | null {
  const rawMessage = extractUpgradeErrorMessage(error).trim();
  if (!rawMessage) return null;

  const structured = rawMessage.match(STRUCTURED_UPGRADE_RE);
  if (structured) {
    const candidate = structured[1].toLowerCase() as UpgradePromptReason;
    return {
      reason: KNOWN_REASONS.has(candidate) ? candidate : "generic",
      minAppVersion: structured[2],
      rawMessage,
    };
  }

  if (
    rawMessage.includes("CALENDAR_TIMEZONE_UPGRADE_REQUIRED") ||
    rawMessage.includes("该日程包含时区，请升级 Tau") ||
    rawMessage.includes("请升级 Tau 后再写入带时区的日程")
  ) {
    return { reason: "calendar-timezone-write", rawMessage };
  }

  if (
    rawMessage.includes("DB_MODEL_INCOMPATIBLE") ||
    rawMessage.includes("数据库模型版本不受支持")
  ) {
    return { reason: "db-model-incompatible", rawMessage };
  }

  if (rawMessage.includes("由更新版本的应用创建") || rawMessage.includes("由更新版本的应用保存")) {
    return { reason: "whiteboard-readonly", rawMessage };
  }

  if (
    rawMessage.includes("协作端需要更新版本的应用") ||
    rawMessage.includes("collaboration requires a newer app") ||
    rawMessage.includes("collaboration service requires a newer app")
  ) {
    return { reason: "collaboration-incompatible", rawMessage };
  }

  if (rawMessage.includes("不支持的内容来源，请升级客户端")) {
    return { reason: "content-source-unsupported", rawMessage };
  }

  if (rawMessage.includes("需要 Tau") && rawMessage.includes("更新版本")) {
    const version = rawMessage.match(VERSION_IN_TEXT_RE)?.[1];
    return { reason: "plugin-min-version", minAppVersion: version, rawMessage };
  }

  return null;
}

export function isUpgradeRequiredError(error: unknown): boolean {
  return parseUpgradeRequiredError(error) !== null;
}

/** 官网下载兜底地址（应用内更新不可用或当前通道未检出更高版本时使用） */
export const APP_DOWNLOAD_URL = "https://taunote.app";
