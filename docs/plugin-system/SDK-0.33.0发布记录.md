# SDK 0.33.0 发布记录

日期：2026-10-21。

## 范围

PS-047 媒体资源与富块能力（方案见 82）的对外发布：`@xiongtao.xt/tau-plugins@0.33.0`、`@xiongtao.xt/tau-ui@0.3.0`，以及首个使用这些能力的独立插件 `tau.image-gallery` 0.1.0。

发布基于 `claude/media-resource-plan` 分支，不含 master 上并行推进的问题管理接口（PluginContentInput、宿主对象接口、`app.run` 返回结果等），那批接口随下一版 SDK 发布，合并本分支时 CHANGELOG 的「未发布」小节需排在 0.33.0 之上。`@xiongtao.xt/tau-blog` 与客户端未发布，客户端仍为 0.59.0。

## 变更

- 媒体：`MediaImage` / `MediaVideo` / `MediaAudio`、`useResource`、`useResourceUpload`、`useMediaAppearance`。
- 节点：`resources` 资源声明、`frame` void 块外框。
- 块组件：`useElement`、`useMediaViewer`、`BlockToolbar` / `BlockToolbarButton` / `BlockToolbarGap`。
- `@tau/ui`：`Sortable`。

## 验证与回执

- 发布前：SDK 185 项测试；`verify-editor-author.mjs` 以本地 SDK 归档在独立目录完成作者插件安装、测试与构建；两个包 `npm publish --dry-run` 通过。npm 两步验证由用户在浏览器中完成。
- npm 回读，与本地归档逐字节一致：
  - tau-plugins 0.33.0 `sha512-GLcUTVzr57wWgkp4zX9WXVxzDlgV+ZrrJqGEhUz1UZuI/iM1dZlgain2V6IhVRolRSc1fQRtFRqdseM1s5CkCw==`
  - tau-ui 0.3.0 `sha512-tJJvMPf9gZDivwMy/FcB5rxN3GWaeRvU0AwSw8BiklcBlgi7QYTDhgyrj8Iry37Q8+OAhpFRGR0lHNio6AV20g==`
- 图册插件 [tau-plugin-image-gallery](https://github.com/LastKnightCoder/tau-plugin-image-gallery) 改用公开依赖，以全新 pnpm store 安装后测试与构建通过；`1bd7b4a` / `v0.1.0` 的[发布工作流](https://github.com/LastKnightCoder/tau-plugin-image-gallery/actions/runs/39620800533)在 GitHub 干净环境中冻结安装、测试、构建并创建 [v0.1.0 Release](https://github.com/LastKnightCoder/tau-plugin-image-gallery/releases/tag/v0.1.0)。
- 正式 ZIP 47,600 字节，SHA-256 `e0b9e1df36641fd0c8f1af9c715940cd2b15f9602b9bfaf193b639f993fbbc2c`，与本地构建逐文件一致；已用 `pin-test-fixture.mjs` 固定为测试夹具（源码提交 `1bd7b4a71d1582685870973abf217fcb8341919f`）。
- 正式 ZIP 通过 `apps/desktop/scripts/verify-image-gallery-plugin.mjs` 的 Electron 四阶段（initial / restart / disabled / restored）：插件中心同一套包检查、版本门槛、外框渲染、属性条切换布局、Enter 打开编辑弹窗、方向键排序写回、Delete 删除留段落、导出打包按资源声明收集图片、Markdown 与 HTML 导出、只读单击打开图片查看器；停用阶段节点原样保留、相邻编辑不改写、占位不露出类型名。四阶段均无外部资源请求，渲染进程无告警。报告在 `output/image-gallery-plugin/741c123a-0e59-4ea2-a0cb-516b7b613d3e/`。
- 插件中心：工作流的自动提交返回「插件尚未在门户首次提交」，需在 https://plugins.taunote.app 网页完成首次提交以绑定仓库，之后打 tag 即自动提交。

## 过程记录

- 新仓库创建后立即推送的 tag 没有触发工作流（GitHub 尚未登记工作流文件），重新推送 tag 后才运行；首次推送已生成的 Release 因 tag 被删而变为草稿，已重新关联 `v0.1.0` 并公开。
- 首次 Electron 验收在「切换布局」写回节点后立即按 Enter，外框仍持有渲染前的节点，命令未命中；改为等属性条反映新布局后再按键。属于测试时序，不是用户可触发的问题。
- 沿用的 HTML 验收脚本里 `@tau/editor` 指向包目录的别名已与当前包结构不符，图册脚本改为按各包 `exports` 解析。

## 未完成

- `@xiongtao.xt/tau-blog` 未发布：发布站要渲染图册需要包含 `elementRuntime` 与媒体运行时的新版，并同步官方博客模板。
- 公共作者模板仓库 `tau-plugin-template` 未同步；本地模板已改为 0.33.0 / 0.3.0。
- 视觉验收由用户完成。
