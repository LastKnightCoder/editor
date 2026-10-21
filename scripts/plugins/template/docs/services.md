# 编译与转换服务

`context.services` 提供几种由 Tau 执行的编译与转换能力：

| 服务                     | 用途                                                               |
| ------------------------ | ------------------------------------------------------------------ |
| `tailwind.compile`       | 从源码中提取 Tailwind 类名，生成 CSS                               |
| `markdown.deserialize`   | Markdown → 编辑器节点                                              |
| `markdown.serialize`     | 编辑器节点 → Markdown                                              |
| `markdown.render`        | Markdown → HTML                                                    |
| `ffmpeg.run`             | 用 FFmpeg 处理音视频                                               |
| `videoExtractor.probe`   | 查询视频网页的标题与可下载格式，见[视频提供方](providers/video.md) |
| `git.publishSnapshot` 等 | 博客发布用的 Git 服务，见[发布提供方](providers/publish.md)        |

这些服务只处理你传入的数据并返回结果：不读写用户的笔记，不弹出文件选择，也不会自动把样式注入页面。

## 取消与错误

所有服务都是异步方法，最后一个参数可以传 `{ signal }`：

```ts
const controller = new AbortController();
try {
  const { css } = await context.services.tailwind.compile(
    { source: '<div class="p-4">Hello</div>', language: "html" },
    { signal: controller.signal }
  );
} catch (error) {
  if (error instanceof Error && error.name === "AbortError") return;
  throw error;
}
// 用户点击「取消」时：controller.abort()
```

- 插件停用时，进行中的任务会自动取消，不需要另外传 `context.signal`。
- 失败时抛出 `Error`，`message` 是可以展示给用户的错误信息。不要根据错误文字的内容决定程序流程。

## Tailwind

```ts
const { css } = await context.services.tailwind.compile({
  source: '<section class="p-4 rounded-tau-md bg-surface text-ink-1">Hello</section>',
  language: "html",
});
```

- 使用 Tailwind 4，支持 Tau 的语义类（如 `bg-surface`、`text-ink-1`）。
- `language` 可选 `html`、`tsx`、`jsx`。源码只用来提取类名，不会被执行或编译成 React。
- 返回的 CSS 只包含主题与工具类，不包含基础样式重置（preflight）。
- 类名要完整写在源码里，拼接出来的类名提取不到。
- Tau 语义类依赖 Tau 的 `--tau-*` 主题变量。在 Tau 之外的页面使用这些 CSS 时，需要自己提供这些变量。

插件自身固定的界面样式应该在构建时编译好。这个服务适合运行时才知道内容的场景，比如用户写的组件代码。返回的 CSS 由你自己挂到页面上，并在不需要时移除。

## Markdown 与编辑器节点

```ts
import type { Descendant } from "@tau/plugins";

const parsed = await context.services.markdown.deserialize("# 标题\n\n- [x] 已完成");
const nodes: Descendant[] = parsed.nodes;

const { markdown } = await context.services.markdown.serialize(nodes);
const { html, css } = await context.services.markdown.render(markdown, { theme: "light" });
```

- 语法与 Tau 编辑器一致：标题、列表与任务列表、表格、代码、数学公式、图片与媒体、Tau 的扩展语法等。
- 节点只是数据，与任何一篇笔记都没有关联，也不会写进编辑器。
- 每次解析可能生成新的节点 ID，不要依赖反复解析保留节点身份。
- 自己构造节点时按 SDK 的类型来：文本节点是 `{ type: "formatted", text: "..." }`，不是只有 `{ text }`。

### 转换结果中的警告

三个方法都返回 `warnings`，每项包含 `code`、`message` 和可选的节点路径 `path`。它报告无法识别的节点、HTML 中已知的降级等，但不是完整的无损检查。

### 自定义节点

服务默认只认识 Tau 内置的节点。要转换你自己的节点，在单次调用中传入 `codecs`（格式见[编辑器扩展 · Markdown 导入导出](editor.md#markdown-导入导出)）：

```ts
const result = await context.services.markdown.serialize(nodes, {
  codecs: [
    {
      type: "yourname.note",
      serializer: { toMarkdown: (_node: unknown, children: string) => `> ${children}` },
    },
  ],
});
```

`codecs` 只对这一次调用生效。插件 `editorCodecs` 中声明的 codec 不会自动加入，需要时显式传入。

### HTML 渲染

`render` 生成的 HTML：

- 不会执行图表、公式排版等需要编译的内容，这些节点可能显示为源码，并返回 `DISPLAY_FALLBACK` 警告；音视频可能显示为链接。
- 保留原始 HTML 和外部资源链接，**不是经过净化的安全 HTML**。展示来源不可信的内容前，自己做净化。
- `css` 是这段内容需要的样式，不包含完整的 Tau 页面主题，也不会打包图片附件。

## FFmpeg

```ts
const result = await context.services.ffmpeg.run(
  {
    files: [{ name: "input.wav", data: audioBlob }],
    args: ["-i", "input.wav", "-c:a", "pcm_s16le", "output.wav"],
    outputs: [{ name: "output.wav", mimeType: "audio/wav" }],
  },
  {
    onProgress: ({ time }) => console.log("已处理", time, "秒"),
  }
);
const output = result.files[0].data;
```

| 字段      | 说明                                                                          |
| --------- | ----------------------------------------------------------------------------- |
| `files`   | 输入文件，`{ name, data: Blob }`。`name` 只是这次任务内的文件名，不是本机路径 |
| `args`    | FFmpeg 参数，不包含程序名。含空格的参数作为一个数组元素，不要加 Shell 引号    |
| `outputs` | 要取回的输出文件，名称与 `args` 中的输出一致，`mimeType` 需要与实际格式相符   |

- 文件名不能重复，目录用 `/` 分隔。
- 文件全部经过内存传输，适合能放进内存的素材，不支持大文件流式处理。
- `onProgress` 的 `time` 是已经处理的媒体时长（秒），不是百分比。
- 不要覆盖 `-progress` 参数，也不要依赖交互式输入。
- 声明的输出文件没有生成，或 FFmpeg 以非零状态退出时，调用失败，不返回部分结果。
- 返回的 `log` 保留最后 64 KiB 的诊断输出，失败时可以帮助排查。
- 第一次使用时，Tau 可能需要联网下载 FFmpeg，之后会复用。

## 在编辑器块中使用服务

[编辑器块](editor.md)的渲染组件不在 `activate` 中，拿不到 `context`。在组件里用 `usePluginServices()` 获取同一组服务：

```tsx
import { useEffect, useState } from "react";
import { usePluginServices } from "@tau/plugins";

function Preview({ source }: { source: string }) {
  const services = usePluginServices();
  const [html, setHtml] = useState<string>();

  useEffect(() => {
    if (!services) return;
    const controller = new AbortController();
    services.markdown
      .render(source, { signal: controller.signal })
      .then(result => setHtml(result.html))
      .catch(() => undefined);
    return () => controller.abort();
  }, [services, source]);

  return html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <pre>{source}</pre>;
}
```

- 在博客等不运行插件的地方，`usePluginServices()` 返回 `undefined`。这时显示已保存的结果或源码。
- 组件卸载或输入变化时，用自己的 `AbortController` 取消过期的调用。
- 不要把服务对象存进模块级变量。
