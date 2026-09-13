// 协作不可用期间的本地兜底改动标记：重连后据此提示作者选择「保留本机 / 采用云端」。
// 落 localStorage：app 被杀后重进详情页仍能提示，不会静默丢弃本地改动。
// 标记在作者做出选择（或采用云端）后清除。
const KEY_PREFIX = "tau-collab-local-fallback:";

function storageKey(contentId: number) {
  return `${KEY_PREFIX}${contentId}`;
}

export function markLocalFallbackEdit(contentId: number) {
  try {
    localStorage.setItem(storageKey(contentId), String(Date.now()));
  } catch {
    // 存储不可用（隐私模式等）：本次会话内不再提示，但内容已落本地库
  }
}

export function hasPendingLocalFallback(contentId: number | undefined): boolean {
  if (!contentId) return false;
  try {
    return localStorage.getItem(storageKey(contentId)) !== null;
  } catch {
    return false;
  }
}

export function clearPendingLocalFallback(contentId: number) {
  try {
    localStorage.removeItem(storageKey(contentId));
  } catch {
    // 忽略：清理失败不影响编辑，下次重连会再次提示
  }
}
