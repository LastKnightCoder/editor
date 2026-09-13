// 协作码本地缓存：服务端只保存哈希，明文仅在生成/轮换时返回一次，
// 因此需要在本地留存才能让「成员管理」反复展示同一个码（与桌面端 invitation:<id> 缓存同义）。

const STORAGE_PREFIX = "tau-collab-invitation:";

export type CachedInvitation = {
  code: string;
  expiresAt: number;
};

export function readCachedInvitation(documentId: string): CachedInvitation | undefined {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${documentId}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<CachedInvitation>;
    if (typeof parsed.code !== "string" || typeof parsed.expiresAt !== "number") return undefined;
    if (parsed.expiresAt <= Date.now()) return undefined;
    return { code: parsed.code, expiresAt: parsed.expiresAt };
  } catch {
    return undefined;
  }
}

export function writeCachedInvitation(documentId: string, invitation: CachedInvitation) {
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${documentId}`,
      JSON.stringify(invitation)
    );
  } catch {
    // 存储不可用时退化为仅本次会话可见，不影响协作功能
  }
}

export function clearCachedInvitation(documentId: string) {
  try {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${documentId}`);
  } catch {
    // 忽略
  }
}
