# 编译与转换服务

需要在插件里编译 Tailwind、Typst，转换 Markdown，或处理音视频时，可以使用这些服务。通过 `context.services` 调用，类型从 `@tau/plugins` 导入，需要 Tau 0.59.0 或更高版本及实现相应能力的客户端构建。本文对应 SDK 0.23.0。TikZ 编译属于独立绘图插件，不再提供宿主服务。

所有服务都是异步方法，只处理传入数据并返回结果，不读写笔记、不选择或保存文件、不自动注入样式。

## API 一览

| 方法                                     | 输入                                              | 返回                                    |
| ---------------------------------------- | ------------------------------------------------- | --------------------------------------- |
| `tailwind.compile(input, options?)`      | `{ source, language?: "html" \| "tsx" \| "jsx" }` | `{ css }`                               |
| `typst.compile(input, options?)`         | `{ source, format?: "html", inputs?, files? }`    | `{ html }`                              |
| `markdown.deserialize(source, options?)` | Markdown 字符串                                   | `{ nodes: Descendant[], warnings }`     |
| `markdown.serialize(nodes, options?)`    | `Descendant[]`                                    | `{ markdown, warnings }`                |
| `markdown.render(source, options?)`      | Markdown 字符串                                   | `{ html, css, warnings }`               |
| `ffmpeg.run(input, options?)`            | `{ files, args, outputs }`                        | `{ files, log }`                        |
| `videoExtractor.probe(url, options?)`    | 视频页面地址，可选 `proxy`（SDK 0.22.0）          | `{ title, cover?, duration?, formats }` |
| `git.publishSnapshot(input, options?)`   | 当前发布快照、HTTPS 仓库、分支与认证              | `void`                                  |
| `git.selectCacheDirectory({}, options?)` | 打开宿主缓存目录选择器                            | `{ id, label } \| null`                 |

Git 服务自 SDK 0.21.0 提供，完整参数与发布会话约束见 [PUBLISH.md](PUBLISH.md)。视频解析与播放源协议见 [VIDEO.md](VIDEO.md)。

## 在静态组件中获取服务

SDK 0.16.0 的 `usePluginServices()` 返回当前插件可用的同一组服务，类型为 `PluginServices | undefined`。服务由插件运行时提供，独立编辑窗口无需 activate；博客和未包裹的普通组件返回 undefined，组件应显示已保存结果或源码。它不属于源码块或 EditorKit，不要将服务存入模块全局变量。

组件需用自己的 AbortSignal 取消过期或卸载的调用，宿主同时处理窗口与工作区失效。内容插件的启停按现有重启生效规则处理；写入启停意图不会提前拆掉当前窗口已生效的贡献。

## 取消与错误

第二个参数均支持 `{ signal: AbortSignal }`。插件停用会自动取消本实例的任务，不必重复传入 `context.signal`。用户主动取消可使用单次任务的 `AbortController`。

```ts
const controller = new AbortController();
try {
  const { html } = await context.services.typst.compile(
    { source: "= 阅读报告\n本周阅读记录" },
    { signal: controller.signal }
  );
  // 将 html 用于插件自己的预览。
} catch (error) {
  if (error instanceof Error && error.name === "AbortError") return;
  throw error;
}
// 对应取消按钮：controller.abort();
```

失败通过 Promise 拒绝返回 `Error`，`message` 包含可展示的错误信息；不要匹配内部错误文本决定业务流程。Markdown 同步解析/序列化只能在调用前后检查取消，不能中断正在执行的 JavaScript。HTML 转换内部已开始的渲染可能继续完成，但取消后不会交回结果。

## Tailwind

```ts
const { css } = await context.services.tailwind.compile({
  source: '<section class="p-4 rounded-tau-md bg-surface text-ink-1">Hello</section>',
  language: "html",
});
```

使用 Tailwind 4，支持 Tau 语义类。返回 theme/utilities，不重复提供 preflight。源码只用于提取完整类名，不执行 TSX/JSX，也不编译 React。动态拼接类名不能保证被提取。Tau 语义类依赖 Tau 提供的 `--tau-*` 变量，离开 Tau 的页面需要自行提供相应主题变量。

固定插件界面通常在打包时编译样式；此服务主要用于运行时生成内容。返回 CSS 由插件自行使用并在停用时清理。

## Typst

目前只输出 HTML 正文片段，不支持 PDF 和 SVG。`inputs` 对应 Typst 的 `sys.inputs`：

```ts
const { html } = await context.services.typst.compile({
  source: '#include "parts/intro.typ"\n#sys.inputs.at("title")',
  inputs: { title: "阅读报告" },
  files: [{ name: "parts/intro.typ", data: new Blob(["本周阅读记录"]) }],
});
```

附件名是本次编译中的相对路径，不能使用绝对路径、`..` 或反斜杠。图片和包含文件等需显式通过 `files` 提供。可用字体依赖客户端运行环境；不承诺任意宏包或排版效果均可导出为 HTML。公式需要使用 Typst 相应的 HTML 写法，不能把 PDF 能力等同于 HTML 支持。

## Markdown 与编辑器节点

```ts
import type { Descendant } from "@tau/plugins";

const parsed = await context.services.markdown.deserialize("# 标题\n\n* [x] 已完成");
const nodes: Descendant[] = parsed.nodes;
const result = await context.services.markdown.serialize(nodes);
const preview = await context.services.markdown.render(result.markdown, { theme: "light" });
```

使用与 Tau 客户端一致的语法，包括标题、段落、列表和任务列表、表格、代码、数学公式、图片与媒体、Tau directive 等。`Descendant[]` 是数据，不关联某篇笔记，不写入编辑器。转换可能生成新的节点 UUID，不要依靠反复解析保留节点身份。

优先处理解析得到的节点。Tau 文本节点包含 `type: "formatted"`，不是只写 `{ text: "..." }`；直接构造节点时遵循 SDK 类型。

自定义节点可通过单次调用的 `codecs` 提供编解码器：

```ts
const result = await context.services.markdown.serialize(nodes, {
  codecs: [
    {
      type: "example.note",
      serializer: { toMarkdown: (_node: unknown, children: string) => `> ${children}` },
    },
  ],
});
```

`codecs` 类型为 `EditorMarkdownCodec[]`；同类型替换本次转换的默认 codec，调用结束不保留。编辑器贡献的 codec 不隐式加入服务，需明确传入。仅声明序列化器不会自动得到反序列化规则；需要往返时还需提供相应的 directive 或解析规则。

`warnings` 每项包含 `code`、`message` 和可选节点 `path`。当前报告未识别节点和 HTML 已知降级，不是任意语法、属性的完整无损审计。未知节点序列化可能保留为 Tau 扩展编码，其他 Markdown 工具未必理解。

HTML 渲染不自动执行 TikZ、Typst、Mermaid 编译器；相关节点可能显示源码并返回 `DISPLAY_FALLBACK`，音视频可能显示链接。原始 HTML 和远程资源按客户端导出规则保留，输出不是经过净化的 HTML。`css` 是本次生成内容附带的样式，不包含完整 Tau 页面主题，也不打包图片附件。

## FFmpeg

SDK 0.23.0 已移除 `ffmpeg.probe` 和 `MediaInfo`，客户端不再随包分发 FFprobe。已有插件应删除对应调用与类型依赖；需要本地媒体元数据时由插件自行实现。`videoExtractor.probe` 只查询视频页面，不能接收本地文件。

`ServiceFile` 为 `{ name: string, data: Blob }`；文件名仅在任务内使用，不是客户端路径。输入输出名称不得重复，目录使用 `/`。文件整体经内存传输，适合可以放进内存的素材，不支持大文件流式处理。

```ts
const input = { name: "input.wav", data: audioBlob };
const result = await context.services.ffmpeg.run(
  {
    files: [input],
    args: ["-i", "input.wav", "-c:a", "pcm_s16le", "output.wav"],
    outputs: [{ name: "output.wav", mimeType: "audio/wav" }],
  },
  {
    onProgress: ({ time }) => console.log("已处理秒数", time),
  }
);
const outputBlob = result.files[0].data;
```

`args` 不包含程序名；含空格的参数作为一个数组元素，不额外加 shell 引号。服务设置非交互、覆盖临时输出和进度通道，不要覆盖 `-progress` 或依赖交互 stdin。`outputs` 声明要取回的产物，名称与参数中的输出一致；文件未生成会报错，退出非零不会返回部分成功结果。

`onProgress.time` 是已处理媒体时间（秒），不是百分比。首次使用 FFmpeg 时 Tau 可能需要联网下载，之后会复用；取消任务不会删除已下载的 FFmpeg。`log` 保留最后 64 KiB 诊断输出。返回 MIME 类型由 `outputs.mimeType` 指定，调用者须确保与实际格式一致。
