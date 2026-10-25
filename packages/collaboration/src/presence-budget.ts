import { WHITEBOARD_LIMITS } from "./model-limits";

/** 状态 JSON 按 UTF-8 编码计量，避免中文与 emoji 绕过字节限制。 */
export function assertPresenceBudget(states: ReadonlyMap<number, unknown>): void {
  if (
    states.size > 16 ||
    new TextEncoder().encode(JSON.stringify([...states])).byteLength >
      WHITEBOARD_LIMITS.presenceBytes
  )
    throw new Error("在线状态超过限制");
}
