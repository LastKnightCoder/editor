import type { workspaceT } from "./workspace.binding";
/** 运行错误 → 说人话的标题 + 下一步；鉴权、额度、限流、断网各给对应动作 */
export type ChatErrorAction = "settings" | "retry" | "model";

export function describeChatError(
  error: { code: string; message: string },
  t: typeof workspaceT
): {
  title: string;
  detail: string;
  action?: ChatErrorAction;
} {
  const text = `${error.code} ${error.message}`;
  if (/401|403|unauthori[sz]ed|invalid.*api.?key|incorrect api key|认证|鉴权/i.test(text))
    return {
      title: t("error.authTitle"),
      detail: t("error.authHint"),
      action: "settings",
    };
  if (/402|insufficient|quota|balance|余额|欠费/i.test(text))
    return { title: t("error.balanceTitle"), detail: t("error.balanceHint"), action: "model" };
  if (/429|rate.?limit|too many|限流/i.test(text))
    return { title: t("error.rateTitle"), detail: t("error.rateHint"), action: "retry" };
  if (error.code === "AI_TRANSPORT_FAILED" || /network|fetch|timeout|断网|网络/i.test(text))
    return { title: t("error.networkTitle"), detail: t("error.networkHint"), action: "retry" };
  if (error.code === "AI_MODEL_UNAVAILABLE" || error.code === "AI_MODEL_METADATA_INCOMPLETE")
    return { title: t("error.modelTitle"), detail: error.message, action: "model" };
  if (error.code === "AI_LIBRARY_CHANGED" || error.code === "AI_LIBRARY_BUSY")
    return { title: t("error.libraryTitle"), detail: t("error.libraryHint"), action: "retry" };
  return { title: t("error.chatTitle"), detail: error.message, action: "retry" };
}
