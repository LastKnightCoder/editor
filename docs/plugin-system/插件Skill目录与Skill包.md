# 插件 Skill 目录与 Skill 包

## 任务列表

- COMPLETE：Investigate/Triage/Understand the problem。插件 Skill 只能以 `definePlugin({ skills })` 内联一份正文，不支持附件与脚本，文档挂在编辑器扩展下；桌面原生 Skill 已是目录模型（SKILL.md + 文件 + scripts/，含脚本运行器与 ZIP 导入），门户与安装链路已有模板这种无代码分发包的先例。
- COMPLETE：SDK 协议。manifest.skills 列出 `skills/<id>/` 目录，目录内文件进入 integrity；无 main、只声明 skills 的为 `SkillPackageManifest`；`requiresSystemReview` 统一覆盖本机后台与带脚本的 Skill；分类新增 `skill`；移除 `PluginDefinition.skills` 与 `PluginSkill`，宿主按 manifest 计 skill 贡献。SDK 0.32.0。
- COMPLETE：桌面端。包读取与扫描识别 Skill 包并校验摘要；安装、恢复与中心下载对带脚本版本核对 systemReviewed；skill 模块列出插件目录声明的 Skill 并只放行这些目录的读取与脚本执行；渲染端按插件启停过滤插件 Skill，Skill 包常驻；插件页以 `packageKind` 展示模板与 Skill 包；`$` 点名的磁盘 Skill 注入前读取 SKILL.md。
- COMPLETE：门户。上传校验每个 SKILL.md 的 front matter description；带脚本版本禁止 CI 自动批准，审核页列出脚本文件并要求系统审核确认；文件页展示 Skill 目录与 Skill 包格式；协议文档补充 Skill 扩展。无迁移。
- COMPLETE：作者模板与文档。build.mjs 自动打包 `skills/` 并写入 manifest.skills 与摘要，无 main 时构建 Skill 包；install-local 按 integrity 校验全部文件；重写 `docs/skills.md`，同步 plugin-basics、release、AGENTS。
- 下一步：发布 SDK 0.32.0 与模板同步；custom-block、abc、html、tikz 把内联 Skill 正文移到 `skills/<id>/SKILL.md` 后重新发布；部署门户 API 与网页；发布包含此能力的客户端。

## 约束

- Skill 元信息只取 SKILL.md front matter（name、description、disable-model-invocation、allowed-tools），manifest 不重复声明；description 缺失时构建与门户上传失败。
- Skill 包与模板一样不进入 PluginHost、不参与启停；用户在 Skill 页逐个调整调用方式。插件 Skill 随插件启停，标识沿用 `pluginId:skillId`，个人偏好不丢失。
- 主进程只读取 manifest 收集 Skill 目录，不重复哈希；文件完整性由插件扫描与安装事务负责。读取、目录树与脚本执行只放行已声明目录，未声明子目录与包内其他文件拒绝。
- 带脚本的判定：`skills/<id>/scripts/` 下任意文件，或 Skill 目录中的 .js/.mjs/.cjs/.ts/.py/.sh 文件，与桌面脚本运行器的解释器映射一致。脚本执行沿用 run_skill_script 的 execute 确认；现有 Skill 脚本没有单独的执行审计，本次未新增。
- 开发台（仅开发构建）登记的插件目录不提供 Skill；正式安装目录 `~/.editor/plugins` 为唯一来源。

## 验证

- `@tau/plugins` 35 个文件 183 项测试与类型检查通过；门户 API 86 项、网页 68 项测试与两端类型检查通过。
- 桌面类型检查通过；全量 3547 项中 7 项失败，均在改动前的基线提交上同样失败（插件设置页 onlineVideo 夹具、plugin-provider 的 platform 模拟、每周回顾打开原处、源码预览块工作台），与本次改动无关。新增主进程 Skill 包列出/读取/脚本执行/越界拒绝、扫描摘要校验、中心下载审核闸门与渲染端启停过滤测试。
- 模板实际构建两个包：带 `skills/guide`（含 references 与 scripts）的计数器插件、只含 `skills/writing` 的 Skill 包；`install-local` 安装后经桌面 `discoverPlugins` 分别识别为插件（skills: guide）与 Skill 包。
- 新打包的 SDK 0.32.0 在仓库外安装，作者文档示例全部通过类型检查，包内携带 `docs/`。
- 未做视觉走查与真实客户端启用验收，由用户完成。
