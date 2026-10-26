/**
 * 编辑器：嵌入真正的 Tau 编辑器（与文档正文同一套 kit），可以直接打字试 Markdown 语法、斜杠菜单、
 * 悬浮工具栏与拖拽排块。内容不保存，点「还原」或刷新即恢复。
 */
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import type { Descendant } from "slate";
import { Editor } from "@tau/editor";
import { getDocsKit } from "../../editorKit.ts";
import { docsMarkdown } from "../../editorMarkdown.ts";

const SAMPLE = `## Deep Work 读书笔记

在行首输入 \`##\` 加空格变成标题，输入 \`-\` 加空格变成列表；在空行输入 \`/\` 打开插入菜单。选中一段文字，上方会出现**悬浮工具栏**。

> 深度工作是在无干扰的状态下专注进行职业活动，使个人的认知能力达到极限。

- [x] 读完第一部分「理念」
- [ ] 把「拥抱无聊」整理成卡片
- [ ] 试一周固定的深度工作时段

:::tip{title="小技巧"}
鼠标移到任意一块左侧，会出现拖拽手柄：按住拖动可以调整顺序，点一下打开块菜单。
:::

| 练习方式 | 每天时长 | 难度 |
| -------- | -------- | ---- |
| 禁欲主义 | 全天     | 高   |
| 节奏式   | 2 小时   | 中   |
| 新闻记者式 | 随时插空 | 高   |

:::highlight-block{color=blue}
**核心公式**：高质量产出 = 时间 × 专注强度
:::

:::detail{title="展开看推导"}
如果专注强度翻倍，同样的产出只需要一半的时间。
:::

\`\`\`ts
const focus = (hours: number, intensity: number) => hours * intensity;
\`\`\`

行内公式 $E = mc^2$，回车前输入 \`$$\` 可以插入单独成行的公式。
`;

/** 标签页没有 Markdown 语法，示例里直接给出节点 */
const TABS = {
  type: "tabs",
  activeKey: "rules",
  children: [
    {
      type: "tab-pane",
      tabKey: "rules",
      title: "四条准则",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "formatted",
              text: "工作要深入 · 拥抱无聊 · 远离社交媒体 · 摒弃浮浅",
            },
          ],
        },
      ],
    },
    {
      type: "tab-pane",
      tabKey: "quote",
      title: "金句",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "formatted",
              text: "专注力像肌肉，越练越强，也会因为长期不用而萎缩。",
            },
          ],
        },
      ],
    },
  ],
} as unknown as Descendant;

const initialValue = (): Descendant[] => [...docsMarkdown.importFromMarkdown(SAMPLE), TABS];

export default function EditorDemo() {
  const [round, setRound] = useState(0);
  return (
    <div className="border-line-1 bg-surface shadow-card relative rounded-[16px] border px-7 pt-5 pb-6 max-sm:px-4">
      <div className="text-ink-3 text-tau-tiny mb-2 flex items-center gap-2">
        <span className="bg-ok size-1.5 rounded-full" />
        可以直接编辑 · 内容不会保存
        <button
          type="button"
          onClick={() => setRound(value => value + 1)}
          className="hover:bg-hover hover:text-ink-1 ml-auto flex items-center gap-1 rounded-[7px] px-2 py-1"
        >
          <RotateCcw className="size-3" strokeWidth={1.75} />
          还原
        </button>
      </div>
      <div className="select-text">
        <Editor key={round} kit={getDocsKit()} initValue={initialValue()} readonly={false} />
      </div>
    </div>
  );
}
