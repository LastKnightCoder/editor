# ABC 插件完整拆分

## 任务

- COMPLETE：Investigate/Triage/Understand the problem。确认现有 SDK 可覆盖节点、源码编辑、Markdown 和静态导出，无需增加 API；已创建隔离 worktree，核实 GitHub 仓库权限及模板。
- COMPLETE：建立独立插件仓库，迁移完整 ABC 能力并完成作者侧验证。公开仓库 tau-plugin-abc 已创建，9 项单测、类型检查及自包含 ZIP 构建通过。
- COMPLETE：移除主项目内置 ABC 与依赖，接入真实包回归和缺包保护。diagram 30 项、桌面真实包 5 项及宿主接线 26 项测试通过，客户端版本保持 0.59.0。
- COMPLETE：完成隔离 Electron、各端构建、GitHub Release 与干净克隆验证。正式附件逐文件匹配本地产物，四端类型与生产构建通过，宿主清理和交接记录提交在 codex/abc-plugin 分支。后续由用户完成视觉验收及正常产品发布。

## 消费者迁移与保留

| 消费者                                                   | 处理                                                      |
| -------------------------------------------------------- | --------------------------------------------------------- |
| diagram ABC 节点、预览、插入、codec、类型增强及 abc-html | 完整迁入独立插件，原实现及导出删除                        |
| 四端 diagram 扩展与 Markdown 集合                        | 只保留 Mermaid、PlantUML；ABC 由已安装包提供              |
| 桌面 HTML/EPUB                                           | 已启用插件输出静态 SVG；缺包或渲染异常保留转义源码        |
| 桌面、博客                                               | 使用同一插件静态贡献和资源；不依赖 activate/context       |
| 移动端、浏览器扩展                                       | 不加载插件，未知节点 JSON 保真；abc 围栏按普通代码保留    |
| 协作 content 字段、复习合并、CLI                         | 仍消费历史数据，保留                                      |
| 微信 abc-notation 样式                                   | 仍服务插件导出，保留                                      |
| 测试包                                                   | tests/fixtures/plugins 固定源码提交与摘要，生产构建不使用 |

渲染通过容器 DOM 引用直接调用 abcjs，不再依赖 UUID。预览捕获异常、清空和卸载清理图形，继续汇总 warnings；导出隐藏容器在 finally 回收。使用当前已验证的 abcjs 6.7.0，不同时升级上游依赖。

## 发布与验证记录

- 独立仓库：[tau-plugin-abc](https://github.com/LastKnightCoder/tau-plugin-abc)，源码提交 `b1d72c86333cbad9023eac6d183c834a58d25f6d`，模板基线 `dcb356fdb632a5f1c10c7b2c1d6b58beb0426e79`。
- [v0.1.0 Release](https://github.com/LastKnightCoder/tau-plugin-abc/releases/tag/v0.1.0)、[构建 CI](https://github.com/LastKnightCoder/tau-plugin-abc/actions/runs/39182050705) 和 [发布工作流](https://github.com/LastKnightCoder/tau-plugin-abc/actions/runs/39182190339) 均成功。
- 正式附件 `tau.abc-0.1.0.zip` 为 160,236 字节，展开 530,785 字节，共 8 个文件；SHA-256 为 `bb0364c35cdc4bf51b89474e0066f5eba158073f6eb553f015fa454294256955`，与 GitHub 返回的附件摘要一致，逐文件匹配本地产物。测试清单记录正式 Release 摘要。
- 从 GitHub 标签干净克隆后，公共 npm 冻结安装、9 项单测、类型检查和构建通过，不依赖 workspace 或主项目源码。
- 正式下载包通过独立 Electron 进程的 initial/restart/disabled/restored 四阶段。报告：`output/abc-plugin/3979896b-055c-4693-9b64-e57ffeadca2d/report.json`。覆盖真实 SVG 路径、预览不写文档、CodeMirror 编辑回写、拖拽/插入声明、Markdown 往返、静态 SVG 导出、警告、博客同包 JS/CSS、清空卸载和缺包 JSON/HTML 源码保留；没有外部资源请求。
- 主项目：diagram 30 项、桌面宿主接线 26 项、ABC 真实包 5 项、博客 6 项、移动端与浏览器扩展各 6 项相关测试通过。新边界测试覆盖两端未知 ABC 节点及普通 abc 围栏保留。
- 固定包读取和篡改检查 2 项测试通过，测试清单中 10 个包的文件及摘要校验通过。
- 桌面、博客、移动端、浏览器扩展类型检查及生产构建通过。桌面按项目既有 8 GB Node 堆配置构建，未生成或发布客户端安装包。
- 编辑器扩展、数据库、白板和 antd 边界检查通过；变更 ESLint 无错误，保留现有测试风格中的非空断言警告。未新增 SDK API，不发布新 SDK。
- 扫描四端生产目录及桌面主进程的 1,588 个 JS/CSS 文件，没有 abcjs 标识或 tau.abc 插件代码；插件只保留于独立仓库和测试夹具，不进入客户端生产构建。

客户端仍为 0.59.0，未合并主分支，未操作用户真实插件目录，未提交插件中心审核或部署博客模板。正式用户安装及客户端/配套博客模板发布另走既有发布流程。遵循项目分工，不进行视觉验收，外观由用户后续确认。

## 已确认边界

ABC 节点、源码编辑、乐谱预览、Markdown codec、静态 SVG 导出及 abcjs 依赖一起迁入独立 `tau-plugin-abc` 仓库，插件 ID 沿用 `tau.abc`，节点保留 `{ type: "abc", content, children }`。不修改数据库 schema，不增加宿主编译服务或 SDK API。

客户端尚未发布，按用户要求保持 0.59.0，不为本次拆分修改版本号。插件最低版本为 0.59.0，需使用已完成 ABC 迁出的构建；同号旧开发构建不能靠版本号区分，不在其中同时装配内置 ABC 与插件。

桌面正式安装走插件中心，博客发布携带同版本插件包。移动端与浏览器扩展遵循 D-166，不加载插件，原节点按通用未知节点保护保留；CLI 继续显示源码。缺插件时 HTML 导出保留转义源码回退。固定插件包只用于测试。
