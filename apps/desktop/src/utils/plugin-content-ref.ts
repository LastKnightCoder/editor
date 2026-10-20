/** 正文身份包含创建时间，避免旧引用指向另一个正文。 */
export const encodeContentRef = (contentId: number, createdAt: number) =>
  `${contentId}:${createdAt}`;

export function decodeContentRef(ref: string): { contentId: number; createdAt: number } | null {
  if (typeof ref !== "string") return null;
  const match = /^(\d+):(\d+)$/.exec(ref);
  if (!match) return null;
  const contentId = Number(match[1]);
  const createdAt = Number(match[2]);
  return Number.isSafeInteger(contentId) && contentId > 0 && Number.isSafeInteger(createdAt)
    ? { contentId, createdAt }
    : null;
}
