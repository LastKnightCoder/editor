import type { CustomElement } from "./types.ts";

export interface SerializerOutput {
  output: string;

  // children 内容相对于 output 的起始位置
  childrenStart?: { line: number; ch: number };

  // 每行的额外偏移（用于 blockquote "> ", list "- " 等）
  perLineOffset?: number;

  // 从指定子元素索引起，额外插入行导致的行号偏移
  childLineShifts?: Array<{ startIndex: number; lineDelta: number }>;

  // 是否跳过子元素映射（void 元素）
  skipChildren?: boolean;

  // void 元素的属性位置映射
  propertyMappings?: {
    [propName: string]: {
      start: { line: number; ch: number };
      multiline: boolean;
    };
  };
}

export interface MarkdownSerializer {
  type: string;
  isBlock?: boolean;
  toMarkdown: (element: any, childrenStr: string, parentElement?: any) => string;

  // 新增：带位置信息的序列化（可选）
  toMarkdownStructured?: (
    element: any,
    childrenStr: string,
    parentElement?: any
  ) => SerializerOutput;
}

/**
 * 导出端序列化器注册表：元素类型 → Markdown 文本的唯一出处。
 * 框架不自带任何序列化器，全部经 createMarkdownProcessor({ codecs }) 注入（各扩展的 markdown.ts）。
 */
export class MarkdownSerializerRegistry {
  private serializers: MarkdownSerializer[] = [];
  private blockTypes: Set<string> = new Set();
  private footnoteCounter = 0;
  private footnoteDefinitions: Map<number, string> = new Map();
  private readonly resolve?: (element: CustomElement) => MarkdownSerializer | undefined;

  constructor(
    serializers: MarkdownSerializer[] = [],
    resolve?: (element: CustomElement) => MarkdownSerializer | undefined
  ) {
    this.resolve = resolve;
    this.registerMany(serializers);
  }

  resetFootnotes(): void {
    this.footnoteCounter = 0;
    this.footnoteDefinitions.clear();
  }

  captureFootnotes() {
    return { counter: this.footnoteCounter, definitions: new Map(this.footnoteDefinitions) };
  }

  restoreFootnotes(snapshot: ReturnType<MarkdownSerializerRegistry["captureFootnotes"]>): void {
    this.footnoteCounter = snapshot.counter;
    this.footnoteDefinitions = new Map(snapshot.definitions);
  }

  getFootnoteCount(): number {
    return this.footnoteCounter;
  }

  addFootnote(content: string): number {
    this.footnoteCounter++;
    this.footnoteDefinitions.set(this.footnoteCounter, content);
    return this.footnoteCounter;
  }

  getFootnoteDefinitions(): string {
    if (this.footnoteDefinitions.size === 0) {
      return "";
    }
    const definitions = Array.from(this.footnoteDefinitions.entries())
      .map(([id, content]) => `[^${id}]: ${content}`)
      .join("\n");
    return `\n\n${definitions}`;
  }

  register(serializer: MarkdownSerializer): void {
    const existingIndex = this.serializers.findIndex(s => s.type === serializer.type);
    if (existingIndex >= 0) {
      this.serializers[existingIndex] = serializer;
    } else {
      this.serializers.push(serializer);
    }

    if (serializer.isBlock) {
      this.blockTypes.add(serializer.type);
    }
  }

  registerMany(serializers: MarkdownSerializer[]): void {
    serializers.forEach(serializer => this.register(serializer));
  }

  getSerializer(type: string, element?: CustomElement): MarkdownSerializer | undefined {
    if (element && this.resolve) return this.resolve(element);
    return this.serializers.find(s => s.type === type);
  }

  isBlock(element: CustomElement): boolean {
    if (this.resolve) return Boolean(this.resolve(element)?.isBlock);
    return this.blockTypes.has(element.type);
  }
}
