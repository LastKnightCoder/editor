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
    COLLAB_INVALID_URL: "协作服务器地址无效，请使用 HTTPS 地址",
    COLLAB_INVALID_NICKNAME: "协作昵称需为 1-40 个字符",
    COLLAB_NETWORK: "无法连接协作服务器，请检查网络或服务器地址",
    COLLAB_TIMEOUT: "协作服务器响应超时，请稍后重试",
    COLLAB_REQUEST_FAILED: "协作请求失败，请稍后重试",
    COLLAB_IDENTITY_READ_FAILED: "读取协作身份失败，请重试",
    COLLAB_IDENTITY_WRITE_FAILED: "保存协作身份失败，请重试",
    COLLAB_IDENTITY_INVALID: "协作服务器返回的身份数据无效",
    COLLAB_NOT_FOUND: "协作文档不存在或已失去访问权限",
    COLLAB_CONTENT_NOT_FOUND: "内容不存在，无法发起协作",
    COLLAB_BIND_FAILED: "建立协作绑定失败，请重试",
    COLLAB_BIND_READ_FAILED: "读取协作绑定失败",
    COLLAB_UNBIND_FAILED: "解除协作绑定失败",
    COLLABORATION_WRITE_REQUIRED: "这段内容正在协作，请在协作编辑页修改，或先结束共享",
    COLLAB_UNSYNCED: "改动尚未同步完成，请稍后再试",
    COLLAB_PROJECT_FAILED: "协作内容同步到本地失败，请稍后重试",
    COLLAB_INVALID_CODE: "协作码无效或已过期",
    COLLAB_INVALID_FIELD: "请求参数不正确",
    COLLAB_MEMBER_LIMIT: "该房间成员已达上限",
    COLLAB_FORBIDDEN: "你没有该操作的权限",
  };
  return mapping[code] ?? fallback;
}
