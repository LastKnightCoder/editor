import { localizedErrorMessage } from "./errors.i18n";
export type ParsedInvokeError = {
  code: string;
  message: string;
};

export function parseInvokeError(error: unknown): ParsedInvokeError {
  const raw = String(error ?? "")
    .trim()
    .replace(/^Error:\s*/, "");
  if (/^Command\s+.+\s+not found$/i.test(raw)) {
    return {
      code: "TAURI_COMMAND_NOT_FOUND",
      message: raw,
    };
  }
  if (raw.includes(":")) {
    const [code, ...rest] = raw.split(":");
    return {
      code: code.trim(),
      message: rest.join(":").trim(),
    };
  }
  return {
    code: raw.trim(),
    message: raw.trim(),
  };
}

export function mapErrorToMessage(code: string, fallback: string): string {
  const localized = localizedErrorMessage(code);
  if (localized !== undefined) return localized;
  const mapping: Record<string, string> = {
    DB_NAME_INVALID: "数据库名称不合法，仅支持字母数字、点、下划线和短横线",
    CARD_NOT_FOUND: "卡片不存在，可能已被删除",
    CARD_UPDATE_FAILED: "卡片更新失败，请稍后重试",
    CARD_DELETE_FAILED: "卡片删除失败，请稍后重试",
    CARD_CONTENT_INVALID: "卡片内容格式无效，请重试",
    CONTENT_CREATE_FAILED: "内容创建失败，请稍后重试",
    CONTENT_INVALID: "内容格式无效，请检查后重试",
    CONTENT_NOT_FOUND: "引用内容不存在，可能已被删除",
    TAURI_COMMAND_NOT_FOUND: "当前移动端内核版本过旧（缺少新命令），请重启 dev 并重新安装应用",
    FTS_QUERY_FAILED: "FTS 检索失败，已自动切换为普通检索",
  };
  return mapping[code] ?? fallback;
}
