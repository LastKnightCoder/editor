# 发布门户前端

页面（版式见 `../mockups/redesign/index.html` 方案A）：

- 公开：/plugins 插件中心（v2 目录；平台筛选 `?platform=desktop|android|ios`、分类、搜索防抖、排序菜单，卡片显示声明平台）、/plugins/:pluginId 插件详情（v2 版本历史；介绍/更新说明/平台支持/版本/评论，最新版本按SemVer取，`?platform=` 只突出该平台声明）。
- 网页没有真实宿主：目录不带 host 查询，兼容结论恒为未核验，只引导到应用内安装，不显示“当前设备可安装”；ZIP 经 v2 下载，下载不等于安装。上线须先部署 /v2 服务端，再发布本前端。
- 工作台（需登录，左侧栏）：/submissions 我的提交（一个插件一行，展开看各次提交；筛选与计数按每个插件最该处理的那次提交）、/submissions/new、/submissions/:id 提交编辑、/review 审核队列、/review/:id 审核、/moderation 评论管理；后三个仅审核者。

作者流程：上传ZIP → 核对包资料与README预览 → 右栏「提交前检查」（包校验、版本号高于已发布版本、仓库格式）全部满足后提交 → 在「沟通」里与审核者交流。要求修改时页顶直接显示审核意见与重新上传入口。

审核者从侧栏「审核队列」进入（scope=review&status=pending_review），审核页先给出与上一发布版本的manifest/文件清单对比（前端用GET /releases计算），右栏三选一决定：批准与拒绝需二次确认，要求修改直接退回；退回与拒绝必须写原因。决定绑定打开时的revision。处理完可直接跳下一条（进入时记下的队列顺序）。跨端包（格式 3）：包预览多一个只读「平台」标签展示包内 targets（修改须重新打包）；版本对比改用 v2 历史并列出平台声明变化；平台适配与测试由作者负责，审核者只做上架审核，不填写或确认平台验证记录。发布失败时审核仍有效，在结果卡点击“重试发布”；只有published才显示公开下载链接。

## 运行

```sh
pnpm --filter @tau/plugin-portal dev:web
VITE_MOCK_API=true pnpm --filter @tau/plugin-portal dev:web
pnpm --filter @tau/plugin-portal check:web
pnpm --filter @tau/plugin-portal test:web
```

生产构建必须注入VITE_API_BASE_URL=https://plugins-api.taunote.app，禁用模拟。统一部署入口见infra/ops.mjs和运维手册。web/dist包含Pages SPA fallback。

## 数据与界面

- 包的manifest.description作为简介，README.md作为介绍与使用说明，CHANGELOG.md可选。没有独立正文、图标、截图、commit或反馈地址表单。
- SubmissionView只允许选择包和修改仓库；资料预览使用既有Markdown组件，HTML只显示文本，不加载远程图片。
- 待审核内容冻结；反馈是作者/审核者私有文本交流。审核者会看到待审队列入口，服务器最终校验权限。
- GET session返回reviewer；所有请求带credentials，写操作带CSRF。登录回跳仍由sessionStorage记住原页面，无外部returnTo。
- 保存使用revision；冲突时保留本地输入、由用户选择最新或本地修改。只有保存成功的草稿会在刷新后恢复；删除了旧大表单的本地自动备份系统。
- 上传取消/中断后GET核对；ready不可覆盖。上传过期明确失败，重新选择ZIP；独立图片上传管线已删除。
- 反馈发送用clientRequestId幂等；修改文本创建新请求ID，原文重试复用ID。

## 模拟与测试

模拟模式仅开发服务器可用，页面显示“模拟模式”。数据只存在当前页面内存，刷新重置，提供假包资料用于展示；不把模拟ZIP解析或提交当作真实验收。真实失败不自动回退模拟。

测试包含HTTP凭据/CSRF、Markdown安全渲染、上传冲突与过期，以及真实组件的ZIP资料提交、只读、反馈、revision冲突交互。旧图片和介绍表单测试随消费者删除，不保留双模型。

喜欢按钮乐观更新：点击即改评论区与插件中心缓存的计数，同一插件的请求按mutation scope串行发出，失败回滚并提示，最后一个请求落定后再与服务端对齐。
