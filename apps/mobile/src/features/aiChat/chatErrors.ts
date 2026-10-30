/** 运行错误 → 说人话的标题 + 下一步；鉴权、额度、限流、断网各给对应动作 */
export type ChatErrorAction = "settings" | "retry" | "model";

export function describeChatError(error: { code: string; message: string }): {
  title: string;
  detail: string;
  action?: ChatErrorAction;
} {
  const text = `${error.code} ${error.message}`;
  if (/401|403|unauthori[sz]ed|invalid.*api.?key|incorrect api key|认证|鉴权/i.test(text))
    return {
      title: "API Key 无效",
      detail: "服务商拒绝了这次请求，检查 Key 是否过期或填错。",
      action: "settings",
    };
  if (/402|insufficient|quota|balance|余额|欠费/i.test(text))
    return { title: "账户余额不足", detail: "到服务商控制台充值后再试。", action: "model" };
  if (/429|rate.?limit|too many|限流/i.test(text))
    return { title: "请求太频繁", detail: "服务商限流了，稍等片刻再试。", action: "retry" };
  if (error.code === "AI_TRANSPORT_FAILED" || /network|fetch|timeout|断网|网络/i.test(text))
    return { title: "网络连接失败", detail: "检查网络后重试。", action: "retry" };
  if (error.code === "AI_MODEL_UNAVAILABLE" || error.code === "AI_MODEL_METADATA_INCOMPLETE")
    return { title: "模型不可用", detail: error.message, action: "model" };
  if (error.code === "AI_LIBRARY_CHANGED" || error.code === "AI_LIBRARY_BUSY")
    return { title: "数据库正在同步或已切换", detail: "同步完成后再继续对话。", action: "retry" };
  return { title: "对话失败", detail: error.message, action: "retry" };
}
