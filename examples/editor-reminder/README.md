# 公开扩展示例：提醒块

这个独立 workspace 示例使用与内部扩展相同的公开协议，包含可编辑提醒块、状态命令、手柄菜单、复制/空态/退出规则、纯 Markdown codec 和可运行宿主。产品场景不会自动安装它。

从仓库根目录运行：

```sh
pnpm --filter @example/editor-reminder dev
pnpm --filter @example/editor-reminder check
pnpm --filter @example/editor-reminder check:markdown
pnpm --filter @example/editor-reminder test
pnpm --filter @example/editor-reminder build
```

开发服务器地址以 Vite 输出为准。页面可编辑正文、插入提醒、点击左侧手柄菜单切换状态、切换只读，并观察及重新载入 Markdown。

| 文件                           | 职责                                                 |
| ------------------------------ | ---------------------------------------------------- |
| src/extension/model.ts         | 自有节点模型，不引用核心实现                         |
| src/extension/augmentations.ts | 通过 @tau/editor/api 的 ExtensionElementMap 登记类型 |
| src/extension/index.tsx        | 节点声明、渲染、命令、菜单、复制/空态/退出和插入     |
| src/extension/markdown.ts      | 纯 codec，运行时不加载渲染入口                       |
| src/host/markdown.ts           | 通过公开包显式组合段落与提醒 codec，可供 Node 使用   |
| src/host/App.tsx               | 创建并复用 Kit，接线 Editor、只读和内容回调          |

命令调用有两个层次：命令的 run 接收 `(editor, context)`，绑定在编辑器上的入口是 `editor.commands.execute(id, payload, element, path)`。第二个参数仅传领域参数，目标节点单独传入；例如：

```ts
editor.commands?.execute("example.reminder.toggle", undefined, element);
```

直接调用也需要验证当前目标；示例使用 getCommandElementPath 拒绝只读或陈旧节点。插入使用核心 createParagraph，不要求宿主配置默认段落。部分复制由本扩展决定解包，核心负责片段遍历和错误隔离。

宿主显式装配示例扩展和 codec。渲染扩展缺失时保留已加载的节点数据；缺少专用 codec 时，可将现有节点保存为通用 tau-node 载体后恢复。没有 codec 就无法保证读懂未知的专用 directive 语法，二者不可混为一谈。

类型与 Vite/Vitest 配置独立，没有仓库私有配置继承或源码解析别名。源包在 monorepo 中需要对 React/Slate/DnD 去重，避免跨包产生不同上下文；生产与测试配置保持一致。CSS 仅导入公开主题入口，并扫描 node_modules 中的依赖包根。Less 用于处理当前依赖组件已有的样式，不是插件实现要求。

check:markdown 只启用 ES/Node 类型，没有 DOM lib；Node 子进程验证公开 codec 入口。行为测试使用真实 Editor、菜单和宿主页面，并检查渲染错误不会被忽略。构建验证包含主题和核心菜单样式；视觉验收由用户完成。

该示例验证当前公开源码入口的可用性，包发布、动态加载和插件市场不在本次范围内。
