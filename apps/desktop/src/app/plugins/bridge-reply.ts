/**
 * 插件桥回执直接走原生 invoke（不属于业务命令作用域，任务取消后仍须释放等待方），
 * 因此不经过 `@/electron` 的失败留痕；回执送不到时主进程侧的等待方不会有任何结果。
 */
export async function deliverPluginReply(
  kind: "sync" | "images" | "tts" | "video" | "embeddings" | "publish" | "upload",
  requestId: string,
  reply: unknown
): Promise<void> {
  await window.electron
    .invoke(`plugin-local:${kind}-reply`, reply)
    .catch(error => console.warn("[plugin-bridge] 回执送达失败", { kind, requestId }, error));
}
