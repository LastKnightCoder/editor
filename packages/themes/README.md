# @tau/themes

主题的唯一归属：token 契约、主题定义协议、内置主题、偏好解析、DOM 应用与 React 运行时。编辑器和各应用都只依赖本包，不经 `@tau/ui` 转出。

| 入口                       | 内容                                                                                                                                  | 依赖                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `@tau/themes`              | `tokenContract`（`--tau-*` 词汇表）、`defineTheme` 与注册表、内置主题、存储键、`resolveThemePreference`、`createThemeBootstrapScript` | 无，Node 可用       |
| `@tau/themes/dom`          | `applyThemeToDom`                                                                                                                     | DOM                 |
| `@tau/themes/react`        | `createThemeRuntime`、默认 `useThemeStore` / `initThemeRuntime`、`nextAppearance`                                                     | DOM、React、zustand |
| `@tau/themes/tokens.css`   | 尺度 `:root` + 各主题 `[data-theme][data-mode]` 数据块                                                                                | 无                  |
| `@tau/themes/tailwind.css` | `@theme inline` 语义类映射（`bg-page`、`text-ink-1`…）                                                                                | Tailwind v4         |

```css
@import "tailwindcss";
@import "@tau/themes/tokens.css";
@import "@tau/themes/tailwind.css";
```

- 根入口的 tsconfig 不含 DOM lib，vitest 默认 node 环境：用了 `document` / `HTMLElement` 直接编译失败。
- `initThemeRuntime()` 返回清理函数；包导入不读取存储、不启动 DOM 监听。多根宿主用 `createThemeRuntime({ storage, root, media, ... })` 隔离。
- 构建工具通过 `createThemeBootstrapScript()` 注入首帧脚本，与运行时共用主题清单和解析函数。
- 新增主题要同时写 `themes/<key>.theme.ts` 和 tokens.css 深浅两个数据块，`theme-parity.test.ts` 守护二者一致与 AA 对比度。
- `light.less` / `dark.less` 是 blog 在用的旧变量，P2 迁移后删除。
