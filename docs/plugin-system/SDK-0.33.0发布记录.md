# SDK 0.33.0 发布记录

日期：2026-10-21。

## 范围

PS-047 媒体资源与富块能力（方案见 82）的对外发布：`@xiongtao.xt/tau-plugins@0.33.0`、`@xiongtao.xt/tau-ui@0.3.0`，以及首个使用这些能力的独立插件 `tau.image-gallery` 0.1.0。

发布基于 `claude/media-resource-plan` 分支，不含 master 上并行推进的问题管理接口（PluginContentInput、宿主对象接口、`app.run` 返回结果等），那批接口随下一版 SDK 发布，合并本分支时 CHANGELOG 的「未发布」小节需排在 0.33.0 之上。客户端未发布，仍为 0.59.0；tau-blog 0.5.0 随后同日发布，见下文。

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
- 插件中心：0.1.0 的自动提交返回「插件尚未在门户首次提交」；用户网页首次提交绑定仓库后，0.1.1 打 tag 即自动提交并自动批准（见下节）。

## 发布站、图册 0.1.1 与模板同步（同日）

- 范围：`@xiongtao.xt/tau-blog@0.5.0`（发布站接入 `elementRuntime` 与发布站媒体运行时），图册 0.1.1，官方博客模板 1.4.0，起步仓库 1.1.0，插件作者模板同步 SDK 0.33.0 / UI 0.3.0。
- 发现：把正式图册插件接入官方模板端到端验收后，含图册的文章页宽屏导航消失。图册 Tailwind 产物里误扫出的 `.hidden` 与模板 `md:flex` 同在 `utilities` 层且注入更晚，覆盖了模板的响应式写法。修复在插件侧：Tailwind 用 `prefix(ig)`，类名全部改为 `ig:*`，构建时发现不带前缀的工具类即报错；作者文档新增「用 Tailwind 时加前缀」。改前后按去前缀的类选择器集合对比，只少了从字段名误扫出的 `block`、`shadow`、`container`、`!shadow`。
- 图册 [v0.1.1](https://github.com/LastKnightCoder/tau-plugin-image-gallery/releases/tag/v0.1.1)：源码 `b2c7bb8c1609fdeaca72649bfe9173fc6c49db88`，CI 构建发布，插件中心 approved（自动批准）。正式 ZIP 47,642 字节，SHA-256 `1a2466d439f01bf0c3bac1a50db9795ed924e7a06492a52e7d79682e4151fa27`，与本地构建逐文件一致；夹具改固定为 0.1.1，正式 ZIP 重跑 Electron 四阶段通过（`output/image-gallery-plugin/77ed1ffd-16aa-4f1f-8856-a2de63b040ac/`）。
- tau-blog 0.5.0：博客 12 项测试；候选归档先在官方模板副本中完成类型检查、40 项测试、构建与端到端验收，再发布。npm 两步验证由用户完成（第一次网页验证超时未发布，重发成功）。回读 integrity `sha512-yl263WATxCeNqc053PRM+sgh3scxRIxa99FQTr68c2WjyUtL/69OZsvMUJOOq/tMxFqQrogq4PysIuUn10J3Eg==`，与本地归档逐字节一致。
- 官方博客模板 `913f518` / [v1.4.0](https://github.com/LastKnightCoder/tau-blog-template/releases/tag/v1.4.0)：按公开 npm 更新锁文件，类型检查、40 项测试、构建与端到端验收通过；CI 发布 Release，插件中心 approved（自动批准）。
- 端到端验收（`verify-blog-template.mjs` + Electron 浏览器）13 项全过、无渲染告警，新增图册用例：正式插件显示图片与样式、只读无属性条、单击打开图片查看器，以及同页图册样式不覆盖模板断点。脚本此前已随协议漂移失效，一并修正：生成器需注入搜索索引构建、协议夹具改用 `site.fields`、源码块全屏工作台退役后改为检查只读只有「复制源码」。
- 起步仓库 `9d36933`：由 0.2.0 升级到 0.5.0（0.2.0 的数据客户端读不了 0.31 起的 `site.fields` 站点数据），样式指南补充插件样式一问；`scripts/blog/verify-author.mjs` 以公开 npm 冻结安装、类型检查与构建通过。
- 插件作者模板 [`527504c`](https://github.com/LastKnightCoder/tau-plugin-template/commit/527504c)：依赖改为 0.33.0 / 0.3.0，锁文件按公开 npm 重新解析（仅 SDK、UI 与传递依赖 slate-dom 变化），全新 store 冻结安装与构建通过；维护源 3 项测试通过。文档补充博客中各接口的行为、图册完整示例与 Tailwind 前缀。

## 过程记录

- 新仓库创建后立即推送的 tag 没有触发工作流（GitHub 尚未登记工作流文件），重新推送 tag 后才运行；首次推送已生成的 Release 因 tag 被删而变为草稿，已重新关联 `v0.1.0` 并公开。
- 首次 Electron 验收在「切换布局」写回节点后立即按 Enter，外框仍持有渲染前的节点，命令未命中；改为等属性条反映新布局后再按键。属于测试时序，不是用户可触发的问题。
- 沿用的 HTML 验收脚本里 `@tau/editor` 指向包目录的别名已与当前包结构不符，图册脚本改为按各包 `exports` 解析。

## 未完成

- `tau-plugin-custom-block`、`tau-plugin-weread` 同样用不加前缀的 Tailwind，待各自发版时加前缀。
- 视觉验收由用户完成。
