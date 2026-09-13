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
  const mapping: Record<string, string> = {
    SETTING_INVALID: "setting.json 格式无效，请检查配置",
    DB_NAME_INVALID: "数据库名称不合法，仅支持字母数字、点、下划线和短横线",
    DB_OPEN_FAILED: "数据库打开失败，请检查数据库文件状态",
    CARD_NOT_FOUND: "卡片不存在，可能已被删除",
    CARD_CREATE_FAILED: "卡片创建失败，请稍后重试",
    CARD_UPDATE_FAILED: "卡片更新失败，请稍后重试",
    CARD_DELETE_FAILED: "卡片删除失败，请稍后重试",
    CARD_CATEGORY_INVALID: "卡片类型无效，请选择正确的类型",
    CARD_CONTENT_INVALID: "卡片内容格式无效，请重试",
    CONTENT_CREATE_FAILED: "内容创建失败，请稍后重试",
    CONTENT_INVALID: "内容格式无效，请检查后重试",
    CONTENT_NOT_FOUND: "引用内容不存在，可能已被删除",
    TODO_NOT_FOUND: "任务不存在，可能已被删除",
    TODO_GROUP_NOT_FOUND: "任务分组不存在，可能已被删除",
    TODO_RECURRENCE_NOT_FOUND: "周期规则不存在，可能已被删除",
    TODO_GROUP_INVALID: "任务分组操作不合法，请检查分组状态",
    TODO_INVALID_PAYLOAD: "任务参数无效，请检查输入后重试",
    TODO_CALENDAR_SYNC_FAILED: "任务与日历联动失败，请稍后重试",
    TODO_GROUP_INIT_FAILED: "任务系统分组初始化失败，请稍后重试",
    TODO_GROUP_CREATE_FAILED: "任务分组创建失败，请稍后重试",
    TODO_GROUP_UPDATE_FAILED: "任务分组更新失败，请稍后重试",
    TODO_GROUP_ARCHIVE_FAILED: "任务分组归档失败，请稍后重试",
    TODO_GROUP_REORDER_FAILED: "任务分组排序失败，请稍后重试",
    TODO_QUERY_FAILED: "任务数据读取失败，请稍后重试",
    TODO_STATS_FAILED: "任务统计读取失败，请稍后重试",
    TODO_CREATE_FAILED: "任务创建失败，请稍后重试",
    TODO_UPDATE_FAILED: "任务更新失败，请稍后重试",
    TODO_ARCHIVE_FAILED: "任务归档失败，请稍后重试",
    TODO_DELETE_FAILED: "任务删除失败，请稍后重试",
    TODO_REORDER_FAILED: "任务排序失败，请稍后重试",
    TODO_COMPLETE_FAILED: "任务完成状态更新失败，请稍后重试",
    TODO_RECURRENCE_INVALID: "周期规则配置无效，请检查后重试",
    TODO_RECURRENCE_QUERY_FAILED: "周期任务数据读取失败，请稍后重试",
    TODO_RECURRENCE_CREATE_FAILED: "周期规则创建失败，请稍后重试",
    TODO_RECURRENCE_UPDATE_FAILED: "周期规则更新失败，请稍后重试",
    TODO_RECURRENCE_DELETE_FAILED: "周期规则删除失败，请稍后重试",
    TODO_RECURRENCE_COMPLETE_FAILED: "周期任务打卡状态更新失败，请稍后重试",
    SYNC_CONFIG_MISSING: "同步配置不完整，请先填写并保存同步参数",
    REMOTE_VERSION_PARSE_FAILED: "远端版本信息无法解析",
    VERSION_CONFLICT_UPLOAD: "远端版本更高，请先下载远端数据库",
    VERSION_CONFLICT_DOWNLOAD: "本地版本更高，请先上传本地数据库",
    SYNC_CHECK_FAILED: "同步状态刷新失败，请检查同步配置或网络",
    REMOTE_FILE_NOT_FOUND: "远端数据库文件不存在",
    SYNC_UPLOAD_FAILED: "上传失败，请检查网络与凭证",
    SYNC_DOWNLOAD_FAILED: "下载失败，请检查网络与凭证",
    RESOURCE_CONFIG_MISSING: "资源存储配置不完整，请先填写并保存资源参数",
    RESOURCE_UPLOAD_FAILED: "资源上传失败，请检查网络与凭证",
    RESOURCE_WRITE_FAILED: "本地资源写入失败，请检查目录权限",
    RESOURCE_SYNC_CONFIG_MISSING: "资源同步配置不完整，请先填写并保存同步参数",
    RESOURCE_SYNC_ALREADY_RUNNING: "资源同步正在进行中，请稍候",
    RESOURCE_SYNC_REMOTE_LIST_FAILED:
      "资源远端列表读取失败，已回退本地同步计划",
    RESOURCE_SYNC_LOCAL_IO_FAILED: "资源本地读写失败，请检查目录权限",
    RESOURCE_SYNC_CANCELLED: "资源同步已取消",
    RESOURCE_SYNC_FAILED: "资源同步失败，请检查网络与配置",
    GITHUB_TOKEN_INVALID: "Github Token 不能为空",
    GITHUB_CONFIG_INVALID: "Github 配置不完整，请补齐 Token、用户名和仓库信息",
    GITHUB_AUTH_FAILED: "Github 验证失败，请检查 Token 是否正确",
    GITHUB_REPO_LIST_FAILED:
      "Github 仓库列表获取失败，请检查 Token、网络或仓库权限",
    GITHUB_BRANCH_LIST_FAILED:
      "Github 分支列表获取失败，请检查 Token、网络或仓库权限",
    S3_CONFIG_INVALID: "S3 配置不完整，请先补齐凭证与 Bucket/Region",
    S3_VERIFY_FAILED: "S3 验证失败，请检查凭证、区域、端点或桶权限",
    WEBDAV_CONFIG_INVALID: "WebDAV 配置不完整，请检查地址和凭证",
    WEBDAV_VERIFY_FAILED: "WebDAV 验证失败，请检查地址、网络或凭证",
    ALIOSS_CONFIG_INVALID: "AliOSS 配置不完整，请补齐凭证与 Bucket/Region",
    ALIOSS_VERIFY_FAILED: "AliOSS 验证失败，请检查凭证、区域或桶权限",
    TAURI_COMMAND_NOT_FOUND:
      "当前移动端内核版本过旧（缺少新命令），请重启 dev 并重新安装应用",
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
    COLLAB_ASSET_UNSUPPORTED: "移动端暂不支持协作附件",
    COLLABORATION_WRITE_REQUIRED: "这段内容正在协作，请在协作编辑页修改，或先结束共享",
    COLLAB_UNSYNCED: "改动尚未同步完成，请稍后再试",
    COLLAB_PRIVATE_BLOCK_CONFLICT: "本地内容与协作房间已不一致，请结束共享后重新发起",
    COLLAB_PROJECT_FAILED: "协作内容同步到本地失败，请稍后重试",
    COLLAB_INVALID_CODE: "协作码无效或已过期",
    COLLAB_INVALID_FIELD: "请求参数不正确",
    COLLAB_MEMBER_LIMIT: "该房间成员已达上限",
    COLLAB_FORBIDDEN: "你没有该操作的权限",
  };
  return mapping[code] ?? fallback;
}
