# 随客户端分发的插件

`distribution.json` 是产品分发清单。运行 `node scripts/plugins/build-distribution.mjs` 后，产物位于 `apps/desktop/build/bundled-plugins/`。桌面端首次遇到随包插件时安装到约定目录；不覆盖用户已经更新的版本，不重新安装用户已卸载的插件。用户的启用/禁用选择仍由插件管理保存。

所有业务插件统一在公开 GitHub 仓库维护，主项目只保存固定版本快照 `releases/<id>/<version>/`，不在客户端构建时访问作者目录或重新编译插件源码。

| 插件         | 源码与版本                                                                                                         | 默认随客户端安装   |
| ------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------ |
| 微信读书     | [tau-plugin-weread · v1.0.4](https://github.com/LastKnightCoder/tau-plugin-weread/releases/tag/v1.0.4)             | 否，用户主动安装   |
| 自定义组件块 | [tau-plugin-custom-block · v1.0.2](https://github.com/LastKnightCoder/tau-plugin-custom-block/releases/tag/v1.0.2) | 是                 |
| 火柴人       | [tau-plugin-stickman · v0.1.1](https://github.com/LastKnightCoder/tau-plugin-stickman/releases/tag/v0.1.1)         | 是                 |
| S3 同步存储  | [tau-plugin-s3 · 0.1.1](https://github.com/LastKnightCoder/tau-plugin-s3)                                          | 是，接管旧 S3 同步 |

清单中的 `repository`、`sourceRevision`、`version` 对应源码仓库、提交及版本；`bundled:false` 的包保留用于集成验证，不自动安装。SDK 0.8.0 已发布，三个源码仓库均可用公开 npm 依赖独立构建。不使用 submodule。

S3 是后续新增的同步插件，使用尚未发布的同步 SDK 开发快照；当前作者项目仍依赖本地 SDK 打包文件。客户端只消费已固定的0.1.1产物，不受作者构建环境影响。CLI、旧配置迁移和维护说明见 `docs/plugin-system/52-C30CLI与S3旧实现退役.md`。

固定快照的所有文件（包括说明和许可证）均记录 SHA-256。构建检查完整文件清单、文件摘要以及 manifest 身份/版本，任何漂移都失败。`archiveSha256` 记录导入的 ZIP 摘要，`sourceRevision` 记录作者提交用于追溯；构建直接校验解包后的文件，不需要原 ZIP。固定快照不参与 ESLint/Prettier，禁止手改 main.js 或格式化 manifest。

## 更新独立插件版本

1. 在独立作者仓库修改、验收并提升版本，提交源码后执行 `pnpm build`，创建对应 GitHub Release 并上传 ZIP。
2. 在本仓库导入作者 ZIP，并记录准确的源码提交：

   ```sh
   node scripts/plugins/pin-distribution.mjs /path/to/plugin.zip <作者完整提交SHA> https://github.com/LastKnightCoder/<仓库名>
   node scripts/plugins/build-distribution.mjs
   ```

   微信读书等不默认安装的包追加 `--not-bundled`。脚本验证包内摘要，生成版本目录与清单。已存在的版本拒绝覆盖；修复包应提升版本。仓库清单不记录本机绝对路径。

3. 验证固定产物。火柴人的行为验收命令：

   ```sh
   NODE_OPTIONS=--max-old-space-size=8092 node apps/desktop/scripts/verify-whiteboard-plugin.mjs --bundled
   ```

   使用临时插件目录和 Electron profile，验证默认安装、重启、停用、缺包及恢复，不操作真实用户目录。报告位于 `output/whiteboard-plugin/<运行ID>/`。

4. 提交对应版本目录和 distribution.json。旧版本目录在不再有清单消费者后可删除；撤回默认分发版本时使用 Git 恢复旧清单与旧产物，不修改现有版本的字节。

客户端的首次随包安装不承担用户已有插件的自动升级。已有安装升级走插件管理的 ZIP 更新流程；发布新版本的市场/下载地址与 SDK npm 发布另行执行，不由固定快照脚本隐式完成。

便携编辑器的 `portablePluginBuild` 只装配声明 `editor:true` 的包；白板专用包不会因此进入博客、移动端或浏览器扩展的正文渲染。

## 火柴人的维护边界

火柴人的姿态数据、笔画、文字、属性控件组合与缩略图投影均在独立作者仓库。白板包只保留通用元素/交互/服务接口。旧内置人物及专用分支已经删除，不提供旧 stickman 格式转换。

验收夹具中的 `stickman-baseline.json` 是迁移前逐项等价比较得到的摘要，不包含第二份人物实现。外观有意调整时先检查变化、由用户验收，再更新基线；不得为了让测试通过而盲目刷新摘要。源码出处与阶段记录见 `docs/plugin-system/43-C25白板插件M0契约与里程碑.md`。
