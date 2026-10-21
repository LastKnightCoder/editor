# Skill

Skill 是给 Tau 的 AI 助手看的使用说明。当你的插件提供了需要特定写法的块、需要按某种规范调用的工具时，可以随插件附带一份 Skill，告诉 AI 什么时候该用、怎么用。

插件启用后，Skill 出现在 Tau 的 Skill 页面，标明来自你的插件；插件停用时自动移除。用户可以调整它的调用方式、停用它，或者复制一份到自己的 Skill 目录。

## 声明

在插件定义的 `skills` 中声明：

```ts
import { definePlugin } from "@tau/plugins";
import guide from "./SKILL.md";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

export default definePlugin({
  ...__PLUGIN_META__,
  skills: [
    {
      id: "authoring",
      name: "计数块写作指南",
      description: "用户要在文档中插入计数器时加载，说明计数块的用法和参数",
      content: guide,
    },
  ],
});
```

| 字段          | 说明                                                                |
| ------------- | ------------------------------------------------------------------- |
| `id`          | 插件内唯一的 ID。AI 以 `插件ID:技能ID` 引用它                       |
| `name`        | Skill 页面显示的名称                                                |
| `description` | AI 根据它判断什么时候加载这份 Skill，写清楚适用的场景               |
| `content`     | Skill 正文，即完整的 SKILL.md 内容                                  |
| `invocation`  | 可选。`auto`（默认）由 AI 自行判断加载；`manual` 只在用户点名时加载 |

## 把正文写在单独的文件里

正文通常较长，写在单独的 `SKILL.md` 里更方便维护。在 `build.mjs` 的 esbuild 配置中加上 Markdown 的文本加载器：

```js
loader: { ".svg": "dataurl", ".md": "text" },
```

并在 `src` 中添加类型声明（如 `src/assets.d.ts`）：

```ts
declare module "*.md" {
  const content: string;
  export default content;
}
```

之后就可以像上面的例子一样 `import guide from "./SKILL.md"`。

## 写好一份 Skill

- `description` 决定 AI 会不会在合适的时候用它。写"在什么情况下加载"，而不是"这份文档是什么"。
- 正文写给 AI 看：说明什么时候用、具体步骤、参数含义、正确与错误的例子。
- 只写和你的插件相关的内容。通用的写作建议对 AI 没有帮助，反而占用上下文。
- 目前每个 Skill 只有一份正文，不支持附带脚本和其他文件。
