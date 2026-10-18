# 同步与MCP整合验收

## 任务阶段

- COMPLETE：Investigate/Triage/Understand the problem。审查四种同步拆分与master的MCP改动，核对进程边界、生命周期、迁移、安装更新、CLI退役与公开SDK版本。
- COMPLETE：将master的3ee2a49ac合入codex/plugin-renderer-boundary，保留同步与MCP注册，处理冲突和版本声明，完成整合回归。
- COMPLETE：SDK0.11.0已发布且公开可下载；模板已通过SSH更新至a777f8a，包含公开依赖、锁文件与MCP说明，GitHub干净克隆冻结安装和构建通过。

## 审查与整合边界

未发现四种拆分中需要阻断本次整合的P0/P1问题。复核了条件写入、失败后提交确认、配置与资源账本迁移、明确启停意图、窗口归属与退出清理、在途任务的更新保护、旧同步消费者退役。S3条件写入服务商兼容问题和codec的既有Node执行仍按原TODO处理；不将隔离服务测试等同于真实生产存储验收。

master的MCP在渲染进程注册本地工具；stdio/HTTP传输复用宿主现有MCP能力。保留本分支的context.sync与MCP的context.mcp，不恢复manifest.sync、sync-host、sync-leases或CLI同步。PluginProvider唯一文本冲突是两个新增导入，均保留。同步与MCP同插件共存的成功/失败激活新增回归，防止资源回收遗漏。

npm0.10.0已公开用于渲染端同步纠偏，master的MCP草稿恰好也写为0.10.0，不能覆盖已发布版本。统一新增SDK0.11.0，仅发布tau-plugins；UI公共接口未变，不重复发布tau-ui。模板更新到公开0.11.0并包含MCP文档，现有同步插件继续使用兼容的0.10.0，不为整合强制重发插件包。

仅合并已提交的master。主工作区未提交的pnpm-lock.yaml、宣传视频、网页草稿等不参与，不修改或暂存。master本身不移动；仍在独立分支交付。新增网站页面与构建修复按master原样合入，不进行视觉验收。

## 验证记录

- SDK类型检查与82项测试通过，包括新增的同步/MCP共存及激活失败回收测试；公开声明包包含MCP.md与mcp.d.ts，保留sync导出，不包含撤回的sync-host/sync-leases入口。
- 桌面类型检查、renderer/main/preload正式构建通过；相关测试分组运行共204项通过。首轮主题测试夹具缺少window.electron，补齐测试IPC替身后7项复测通过，未在生产代码添加绕过分支。真实MCP stdio子进程与本机HTTP握手、调用、退出清理通过。
- 门户API及包格式48项测试通过；CLI命令退役2项测试与CLI构建通过。
- S3、OSS、WebDAV、GitHub的真实Electron四阶段共16阶段通过，覆盖安装/重启/迁移/迁移后重启、条件提交、响应丢失确认、资源转发、启停保护及窗口清理。
- 本地0.11.0 tarball安装至独立作者目录，模板构建、MCP.md完整示例与同步/MCP组合示例类型检查通过。
- npm发布结果为@xiongtao.xt/tau-plugins@0.11.0，注册表integrity为sha512-fP368GJQIp82dZzRajgvmiE1GK53wPoJrNqR2vBDm/XbDVTIDu7VGyOH4Q/1gEWj1UJ4s1gyrhGHhUb41LjY+w==。
- 公开模板提交a777f8a；从GitHub经SSH干净克隆后，pnpm install --frozen-lockfile和pnpm build通过，依赖来自npm公开0.11.0，无本地SDK快照。MCP与同步组合示例使用该公开包验证。

未做视觉验收、真实存储目标访问、桌面安装包上传或生产门户部署；旧S3服务商条件写入兼容问题不混入此次整合。
