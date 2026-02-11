export type ParsedInvokeError = {
  code: string;
  message: string;
};

export function parseInvokeError(error: unknown): ParsedInvokeError {
  const raw = String(error ?? "")
    .trim()
    .replace(/^Error:\s*/, "");
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
  const mapping: Record<string, string> = {
    SETTING_INVALID: "setting.json 格式无效，请检查配置",
    DB_NAME_INVALID: "数据库名称不合法，仅支持字母数字、点、下划线和短横线",
    DB_OPEN_FAILED: "数据库打开失败，请检查数据库文件状态",
    CARD_NOT_FOUND: "卡片不存在，可能已被删除",
    SYNC_CONFIG_MISSING: "同步配置不完整，请先填写并保存同步参数",
    REMOTE_VERSION_PARSE_FAILED: "远端版本信息无法解析",
    VERSION_CONFLICT_UPLOAD: "远端版本更高，请先下载远端数据库",
    VERSION_CONFLICT_DOWNLOAD: "本地版本更高，请先上传本地数据库",
    REMOTE_FILE_NOT_FOUND: "远端数据库文件不存在",
    SYNC_UPLOAD_FAILED: "上传失败，请检查网络与凭证",
    SYNC_DOWNLOAD_FAILED: "下载失败，请检查网络与凭证",
    FTS_QUERY_FAILED: "FTS 检索失败，已自动切换为普通检索",
  };
  return mapping[code] ?? fallback;
}
