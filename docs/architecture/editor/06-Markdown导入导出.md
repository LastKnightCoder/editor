# 06 - Markdown 导入导出

> 本文档介绍 Markdown 导入导出机制，包括序列化器注册、导出流程、导入流程、自定义语法支持和如何为新元素添加 Markdown 支持。

[← 返回总览](./README.md) | `← 上一章：核心功能模块` | `下一章：性能优化 →`

---

## 6.1 序列化器注册机制

### MarkdownSerializerRegistry 类

**文件位置**: `apps/desktop/src/utils/markdownSerializerRegistry.ts:135`

```typescript
export class MarkdownSerializerRegistry {
  private serializers: MarkdownSerializer[] = [];
  private blockTypes: Set<string> = new Set();
  private footnoteCounter = 0;
  private footnoteDefinitions: Map<number, string> = new Map();

  constructor() {
    this.registerDefaultSerializers();
  }

  // 注册序列化器
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

  // 获取序列化器
  getSerializer(type: string): MarkdownSerializer | undefined {
    return this.serializers.find(s => s.type === type);
  }

  // 判断是否为块级元素
  isBlock(element: CustomElement): boolean {
    return this.blockTypes.has(element.type);
  }

  // 脚注管理
  resetFootnotes(): void {
    this.footnoteCounter = 0;
    this.footnoteDefinitions.clear();
  }

  addFootnote(content: string): number {
    this.footnoteCounter++;
    this.footnoteDefinitions.set(this.footnoteCounter, content);
    return this.footnoteCounter;
  }

  getFootnoteDefinitions(): string {
    if (this.footnoteDefinitions.size === 0) return "";
    const definitions = Array.from(this.footnoteDefinitions.entries())
      .map(([id, content]) => `[^${id}]: ${content}`)
      .join("\n");
    return `\n\n${definitions}`;
  }
}
```

---

## 6.2 导出流程（编辑器 → Markdown）

**文件位置**: `apps/desktop/src/utils/markdown-helper.ts:21`

```typescript
export const getMarkdown = (value: Descendant[]): string => {
  // 1. 重置脚注状态
  markdownSerializerRegistry.resetFootnotes();

  // 2. 遍历所有顶级元素,转换为 Markdown
  const content = value
    .map((element, index) => {
      const isBlockElement = markdownSerializerRegistry.isBlock(element as CustomElement);
      const str = elementToMarkdown(element as CustomElement, null);
      const isLast = index === value.length - 1;

      if (str) {
        return isBlockElement ? `${str}${isLast ? "\n" : "\n\n"}` : str;
      }
      return "";
    })
    .join("");

  // 3. 添加脚注定义
  const footnoteDefinitions = markdownSerializerRegistry.getFootnoteDefinitions();
  return content + footnoteDefinitions;
};
```

---

## 6.3 导入流程（Markdown → 编辑器）

**文件位置**: `apps/desktop/src/utils/markdown.ts:1596`

**使用的库**:

- unified v11.0.5 - 统一文本处理框架
- remark-parse - Markdown 解析
- remark-gfm - GitHub Flavored Markdown
- remark-cjk-friendly / remark-cjk-friendly-gfm-strikethrough - CJK 友好的加粗/倾斜与删除线解析
- remark-math - 数学公式支持
- remark-directive - 自定义指令语法
- remark-frontmatter - YAML front matter

```typescript
export const importFromMarkdown = (markdown: string, ignoreTypes: string[] = []): Descendant[] => {
  footnoteDefinitionsMap.clear();

  // 历史版本曾为绕过 CJK 加粗解析问题在 markdown 中驻留零宽空格，导入时剥离净化；
  // importFromMarkdownWithPositions 因位置映射绑定原始串，不做剥离
  const sanitized = markdown.replace(/\u200B/g, "");
  const parseResult = unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(remarkHtmlProcessor)
    .use(remarkGfm)
    .use(remarkCjkFriendly)
    .use(remarkCjkFriendlyGfmStrikethrough)
    .use(remarkMath)
    .use(remarkDirective)
    .use(remarkFrontmatter, ["yaml"])
    .parse(sanitized);

  collectFootnoteDefinitions(parseResult.children);

  const editor: Descendant[] = [];
  dfs(parseResult.children, editor, [...ignoreTypes, "footnoteDefinition"], parseResult);

  let afterNormalize = normalizeEditorContent(editor);

  if (afterNormalize.length === 0) {
    return [{ type: "paragraph", children: [{ type: "formatted", text: "" }] }];
  }

  return afterNormalize;
};
```

---

## 6.4 自定义语法支持

### Container Directive (容器指令)

语法: `:::name{attributes}...:::`

```markdown
:::note{title="重要提示"}
这是一个提示框
:::

:::video{src="video.mp4" width="800"}
:::
```

### Text Directive (文本指令)

语法: `:name[content]{attributes}`

```markdown
:color[彩色文本]{color=#ff0000 darkColor=#ff6666}
:highlight[高亮文本]{color=yellow}
:underline[下划线]{color=blue lineType=wavy}
```

### 特殊代码块

```markdown
\`\`\`mermaid
graph TD
A --> B
\`\`\`

\`\`\`tikz
\begin{tikzpicture}
\draw (0,0) circle (1);
\end{tikzpicture}
\`\`\`
```

---

## 6.5 如何为新元素添加 Markdown 支持

**步骤 1**: 注册序列化器

```typescript
// 在 markdownSerializerRegistry.ts 中添加
{
  type: "my-element",
  isBlock: true,
  toMarkdown: (element, childrenStr) => {
    return `:::my-element{prop="${element.prop}"}\n${childrenStr}\n:::`;
  }
}
```

**步骤 2**: 添加导入逻辑

```typescript
// 在 markdown.ts 的 markdownToDescendant() 中添加
if (node.type === "containerDirective" && node.name === "my-element") {
  return {
    type: "my-element",
    prop: node.attributes.prop || "",
    children: [],
  };
}
```

---

[← 返回总览](./README.md) | `← 上一章：核心功能模块` | `下一章：性能优化 →`
