# UI 专家开工任务

```text
请在 /Users/t.xiong/.codex/worktrees/plugin-system/editor 工作区实现 Tau 插件发布门户第一期前端。

先读：
1. apps/plugin-portal/AGENTS.md
2. apps/plugin-portal/docs/协议.md
3. apps/plugin-portal/contracts/index.ts
4. docs/plugin-system/36-C19发布门户第一期.md

你只修改 apps/plugin-portal/web/。后端agent负责contracts/api/infra、包根配置、依赖锁文件与部署。不要修改桌面应用或共享UI包。需要增加依赖、修改协议时先列出需求，不自行修改双方边界。

技术栈已确定：React19.2、TypeScript、Vite7、Tailwind4、React Router6、TanStack Query5；复用workspace @tau/ui/@tau/themes公共入口，禁止antd。依赖已在apps/plugin-portal/package.json中声明。

请创建web/vite.config.ts、HTML入口、web/tsconfig.json与页面代码；Vite root是web，端口5173，产物web/dist。根脚本pnpm --filter @tau/plugin-portal dev:web和build:web已约定。提供Pages SPA fallback。VITE_API_BASE_URL用于后端地址；VITE_MOCK_API=true显式模拟，真实失败不得回退模拟，生产构建不得启用模拟。

只做四页：/login、/submissions、/submissions/new、/submissions/:id。
流程：GitHub登录→上传ZIP与图片→填写介绍和源码信息→查看静态校验结果→保存→提交→待审核。
登录按钮顶层跳转后端/v1/auth/github；不要实现OAuth回调，不接触GitHub token。
所有请求credentials:include；写操作从session取CSRF令牌。上传按服务返回的uploadUrl进行XHR PUT，withCredentials=true并显示进度、支持abort。接口与类型以协议为准。

设计覆盖空列表、加载失败、上传取消/失败、校验失败、会话过期、旧revision冲突、提交失败、刷新恢复草稿和待审只读。上传100%但响应未到是校验中；取消后可能服务端已经完成，需查询确认。包信息只读，介绍字段由作者填写。Markdown不得执行原始HTML。

你负责布局与交互，不要等待后端完成：根据DTO提供模拟适配器和状态样本。前端不直接访问R2/数据库，上传地址与资料预览地址由后端提供。
本期不做审核后台、GitHub讨论、插件中心、下载安装、在线更新或统计。终点仅为待审核，不出现批准/发布成功的假结果。

交付可构建代码、前端行为测试、模拟模式说明及未决协议问题。视觉由用户验收；无需自行截图走查。不部署、不推送主仓库。布局由你决定，遵循现有Tau设计系统。
```
