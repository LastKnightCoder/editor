# 快速开始

这一篇带你跑通模板自带的计数器插件，再把它改成你自己的插件。全程大约十分钟。

## 准备环境

- Node.js 22 或更高版本
- pnpm 11.9.0（模板通过 `packageManager` 字段锁定，用 `corepack enable` 可以自动获得对应版本）
- Tau 桌面客户端 0.59.0 或更高版本

## 跑通示例

在 GitHub 上打开 [tau-plugin-template](https://github.com/LastKnightCoder/tau-plugin-template)，点击 **Use this template** 创建你自己的仓库，克隆到本地后执行：

```sh
pnpm install
pnpm build
pnpm install:local
```

- `pnpm build` 检查类型并打包，生成 `dist/<插件ID>-<版本>.zip`。
- `pnpm install:local` 把这个 ZIP 解压到 Tau 的插件目录 `~/.editor/plugins/<插件ID>/`。

然后在 Tau 中：

1. 打开侧边栏的「插件」页，点右上角的「⋯ → 重新扫描」，列表里会出现「计数器示例」。
2. 启用它。
3. 点击侧边栏「日常」分组下的「计数器」，或按 Ctrl+K 搜索「打开计数器」。
4. 点「增加并保存」。重启 Tau 后再打开，计数还在。

到这里，你已经完成了一次完整的开发、安装和运行。

## 模板里有什么

| 文件                              | 作用                                                      |
| --------------------------------- | --------------------------------------------------------- |
| `manifest.json`                   | 插件的身份证：ID、名称、版本、需要的权限等                |
| `src/index.tsx`                   | 插件入口，计数器的页面、设置和命令都在这里                |
| `src/styles.css`                  | 插件样式，构建时打包成 `main.css`                         |
| `src/CounterIcon.tsx`             | 侧边栏图标示例                                            |
| `README.md`                       | 给使用者看的插件说明，显示在插件详情的「说明」里          |
| `CHANGELOG.md`（需要时自己创建）  | 给使用者看的更新日志，显示在插件详情的「更新日志」里      |
| `build.mjs` / `install-local.mjs` | 打包和本地安装脚本，一般不用改                            |
| `.github/workflows/release.yml`   | 推送版本 tag 后自动构建、发布到 GitHub Release 和插件中心 |
| `AGENTS.md`                       | 给 AI 编程助手的项目指引                                  |
| `docs/`                           | 本开发文档，不会打进插件包                                |

打开 `src/index.tsx` 看一下，核心只有这么多：

```tsx
export default definePlugin({
  ...__PLUGIN_META__,
  create: () => ({
    activate(context) {
      const page = context.pages.register({ id: "counter", title: "计数器", component: Page });
      context.sidebar.registerItem({
        id: "counter",
        title: "计数器",
        icon: CounterIcon,
        group: SIDEBAR_GROUPS.daily,
        page,
      });
      context.settings.register({ id: "preferences", title: "计数设置", component: Settings });
      context.commands.register({
        id: "open",
        title: "打开计数器",
        run: async () => {
          await page.open();
          return null;
        },
      });
    },
  }),
});
```

插件启用时，Tau 调用 `activate`，你在里面注册页面、入口、设置和命令；插件停用时，这些注册会被自动撤销。具体机制见[插件的组成](plugin-basics.md)。

## 改成你自己的插件

1. **改身份**。编辑 `manifest.json`：
   - `id` 换成你自己的唯一名称，例如 `yourname.water-tracker`。ID 发布后不要再改，改了会被当成另一个插件，用户已保存的数据也找不回来。
   - `name`、`description` 改成插件的名称和一句话简介（160 字以内）。
   - `version` 从 `1.0.0` 开始即可。
   - `categories`、`keywords` 决定插件在插件中心的分类和搜索词，含义见[插件的组成 · manifest](plugin-basics.md#manifest)。
2. **改项目名**。把 `package.json` 的 `name` 改成你的项目名，`version` 与 manifest 保持一致。
3. **写功能**。在 `src/index.tsx` 里实现你的功能，样式写在 `src/styles.css`。
4. **写说明**。把 `README.md` 改成给使用者看的介绍：插件能做什么、怎么开始用、常见问题。不要写开发过程或内部实现，它会原样显示给用户。
5. **构建并安装**，按下一节的方法在 Tau 中测试。

## 日常开发循环

改完代码后：

```sh
pnpm build
```

`pnpm install:local` 只负责首次安装，目标目录已存在时会拒绝覆盖，以免误删。更新已安装的开发版本时：

1. 在 Tau 的插件页停用你的插件。
2. 删除旧目录 `~/.editor/plugins/<插件ID>/`，再执行 `pnpm install:local`。
3. 在插件页点「⋯ → 重新扫描」，然后重新启用。

插件保存的数据在笔记库里，不在这个目录中，删除目录不会丢数据。

带有[编辑器扩展](editor.md)或[白板扩展](whiteboard.md)的插件在 Tau 启动时装配，更新代码后需要完全退出并重新打开 Tau 才会生效。

## 常用命令

| 命令                 | 作用                            |
| -------------------- | ------------------------------- |
| `pnpm check`         | 只检查 TypeScript 类型          |
| `pnpm build`         | 检查类型并生成插件 ZIP          |
| `pnpm install:local` | 把最近构建的 ZIP 首次安装到 Tau |

依赖用 pnpm 管理，添加依赖执行 `pnpm add <包名>`，并提交 `pnpm-lock.yaml`。普通 npm 包会被打进插件，React、`@tau/plugins`、`@tau/ui` 由 Tau 提供，不要改动 `build.mjs` 里的 external 列表，也不要升级模板锁定的 React 版本。

## 排错

| 现象                   | 处理                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| 插件列表里没有我的插件 | 点「重新扫描」；确认解压后的目录是 `~/.editor/plugins/<插件ID>/manifest.json`，没有多套一层 |
| 提示目标目录已存在     | 按上面「日常开发循环」先删除旧目录                                                          |
| 改了代码没有变化       | 确认重新构建并安装了；编辑器、白板插件需要重启 Tau                                          |
| 启用失败               | 看插件卡片上的错误信息，通常是 `activate` 里抛了异常                                        |
| 提示需要重启           | 完全退出 Tau 再打开                                                                         |

类型检查通过只说明代码能编译。每次改完，至少在 Tau 中试一遍：启用、使用功能、保存数据、停用、重启后再用。

## 下一步

- 读[插件的组成](plugin-basics.md)，理解生命周期和 `context`。
- 回到[文档首页](README.md)，按你要做的功能找到对应文档。
