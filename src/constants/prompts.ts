export const WEB_CLIP_PROMPT = `
你是一位格式转化大师，你将接收一篇 HTML 或者 Markdown，你需要提取 HTML 或 Markdown 中的内容，将其转化为指定的 JSON 格式。

输出的格式为一个 Descendant[]，相关类型定义如下：

\`\`\`ts
type Descendant =
  | ParagraphElement
  | CodeBlockElement
  | HeaderElement
  | BulletedListElement
  | NumberedListElement
  | ListItemElement
  | ImageElement
  | BlockquoteElement
  | LinkElement
  | InlineMathElement
  | BlockMathElement;

type InlineElement = FormattedText | LinkElement | InlineMathElement;
export type BlockElement = Exclude<Descendant, InlineElement>

interface ParagraphElement {
  type: 'paragraph';
  children: InlineElement[];
}

interface CodeBlockElement {
  type: 'code-block';
  language: string;
  code: string;
  uuid: string;
  children: Descendant[];
}

interface HeaderElement {
  type: 'header';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: InlineElement[];
}

interface ListItemElement {
  type: 'list-item';
  children: BlockElement[];
}

interface BulletedListElement {
  type: 'bulleted-list';
  children: ListItemElement[];
}

interface NumberedListElement {
  type: 'numbered-list';
  children: ListItemElement[];
}

interface ImageElement {
  type: 'image';
  url: string;
  alt?: string;
  children: Descendant[];
}

interface BlockquoteElement {
  type: 'blockquote';
  children: BlockElement[];
}

interface FormattedText {
  type: 'formatted';
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  color?: string;
}

interface LinkElement {
  type: 'link';
  url: string;
  children: FormattedText[];
}

interface InlineMathElement {
  type: 'inline-math';
  tex: string;
  children: FormattedText[];
}

interface BlockMathElement {
  type: 'block-math';
  tex: string;
  children: Descendant[];
}
\`\`\`

下面是一个注意事项：

1. 注意嵌套关系，不要嵌套错误，行内元素不能嵌套块级元素
2. 一些不可编辑的块级元素，如 Image，BlockMath，CodeBlock 等，他们虽然没有可编辑的文本内容，但是 children 不能为空数组，可以加上空内容 { type: "formatted", text: "" }
3. link、inline-math、formatted 需要被放在 paragraph 中
4. 仔细检查，保证 JSON 数据一定是合法的，比如所有的字段都需要以双引号括起来
5. 如果是块级代码使用 code-block，不要使用多个行内代码拼接
6. 如果可以的话，删去一些和文章主体无关的内容，一般出现在文章的头部和尾部，比如广告，推荐等
7. 保证生成内容完整，是可以解析的 JSON 数据
`

export const CONVERT_PROMPT = `
你将接收一段 HTML 代码，请你把它解析为 Markdown，**不要进行任何的总结**，提取出所有内容即可，你需要保证图片、代码、数学公式，引用，链接等重要内容不要丢失。

如果给你的是一篇文章，请尽可能只提取和文章有关的部分，例如一个广告，推荐就不要提取了。
`;

export const SPLIT_PROMPT = `
你将接收一段 Markdown 文本，你需要把它分割为两段 Markdown 文本，这两段文本长度接近，长度不要相差太大，分割处不能破坏结构，比如一个列表就不适合拆分为两段，一段代码也不适合拆分为两段，等等。

不需要任何说明，直接给出结果，以数组的形式返回，输出结构为

["xxx xxx", "xxx xxx"]
`
