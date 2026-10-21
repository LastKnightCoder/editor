/**
 * 行内输入规则：输入成对定界符的收尾字符时，把两段定界符之间的文字转成标记（`**粗体**`）。
 * 只在键入（含输入法上屏）时触发，粘贴不触发；转换单独成一个撤销步，撤销回到原始符号。
 */
export interface MarkInputRule {
  /** 全局唯一，冲突在 kit 创建时报错 */
  id: string;
  /** 由同一字符重复组成的定界符，如 `**`、`~~`；末字符即触发字符 */
  delimiter: string;
  /** 匹配后给定界符之间的文字加的标记字段，必须由已安装扩展的 marks 声明 */
  marks: Readonly<Record<string, unknown>>;
  /** 定界符外侧不能紧邻字母或数字（`_` 写法，避免把 snake_case 当成斜体） */
  wordBoundary?: boolean;
  /** 光标所在文本已带这些标记时不触发（如行内代码里的原样文本） */
  excludeMarks?: readonly string[];
}

export interface RegisteredInputRule {
  readonly owner: string;
  readonly rule: MarkInputRule;
}
