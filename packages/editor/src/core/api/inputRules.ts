/**
 * 行内输入规则：输入成对定界符的收尾字符时，把两段定界符之间的文字转成标记（`**粗体**`）
 * 或行内元素（`$公式$`）。只在键入（含输入法上屏）时触发，粘贴不触发；转换单独成一个撤销步，
 * 撤销回到原始符号。
 */
interface InputRuleBase {
  /** 全局唯一，冲突在 kit 创建时报错 */
  id: string;
  /** 由同一字符重复组成的定界符，如 `**`、`~~`；末字符即触发字符 */
  delimiter: string;
  /** 定界符外侧不能紧邻字母或数字（`_` 写法，避免把 snake_case 当成斜体） */
  wordBoundary?: boolean;
  /** 光标所在文本已带这些标记时不触发（如行内代码里的原样文本） */
  excludeMarks?: readonly string[];
}

export interface MarkInputRule extends InputRuleBase {
  /** 匹配后给定界符之间的文字加的标记字段，必须由已安装扩展的 marks 声明 */
  marks: Readonly<Record<string, unknown>>;
  inline?: never;
}

export interface InlineInputRule extends InputRuleBase {
  /**
   * 匹配后把定界符连同其间文字替换成行内元素；`type` 必须是已安装扩展声明的 inline 元素，
   * `create` 由定界符之间的文字给出元素的其余字段（children 由内核补空文本）。
   */
  inline: { type: string; create(text: string): Readonly<Record<string, unknown>> };
  marks?: never;
}

export type InputRule = MarkInputRule | InlineInputRule;

export interface RegisteredInputRule {
  readonly owner: string;
  readonly rule: InputRule;
}
