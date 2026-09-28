/**
 * content 正文里可能出现的业务元素类型——各端编辑器的**覆盖清单**。
 *
 * 为什么需要它：同一条 content（卡片、文章、日记、项目文档）会在 desktop 编辑、
 * 同步到 mobile、发布到 blog、在浏览器插件里查看。哪一端少注册一个类型，那个块
 * 在那一端就渲染成「无法识别的类型 X」。清单 + 各端的 parity 测试把这件事钉住。
 *
 * 注意区分（ER-016）：本清单只管**跨端同一用途**（content 正文）的覆盖。
 * 同一端内不同用途的 kit 该窄就窄——描述输入存在业务记录的 JSON 列里、不跨端，
 * 不受本清单约束。
 *
 * 实现不要求共享：各端可以有自己的实现（mobile 的内容链接要跳移动端路由，
 * blog 的要生成静态站点链接）。清单只要求「有」，不要求「同一份代码」。
 */

/** 各端都必须能渲染的业务元素类型 */
export const CONTENT_ELEMENT_TYPES = [
  "content-link",
  "file-attachment",
  "whiteboard",
  "database",
] as const;

export type ContentElementType = (typeof CONTENT_ELEMENT_TYPES)[number];

/**
 * 私有块：数据不在 content 里，而在 desktop 本机数据库。
 * 其他端拿不到数据，所以只需一个只读占位，不必真渲染（ER-017）。
 */
export const PRIVATE_BLOCK_TYPES: readonly ContentElementType[] = ["whiteboard", "database"];

/** 占位文案：各端占位扩展统一用它，免得三处各写一句 */
export const privateBlockPlaceholderText = (type: ContentElementType): string =>
  type === "whiteboard" ? "白板内容请在桌面端查看" : "数据库内容请在桌面端查看";
