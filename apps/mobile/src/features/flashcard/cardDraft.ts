// 建卡侧的轻量 id 工具。Slate JSON 的读写均由 @tau/editor 原生完成
// （桌面端 utils/flashcard/index.ts 的纯文本转换链路未随移动端迁移）。

export const genId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);
