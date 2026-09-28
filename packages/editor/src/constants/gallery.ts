// 用 as const 对象 + 同名联合类型代替 enum：只含可擦除语法，Node 可直接加载（@tau/markdown 依赖元素类型）
export const EGalleryMode = {
  Horizontal: 1,
  Vertical: 2,
  Inline: 3,
} as const;
export type EGalleryMode = (typeof EGalleryMode)[keyof typeof EGalleryMode];
