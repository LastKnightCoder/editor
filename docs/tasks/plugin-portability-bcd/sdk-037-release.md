# SDK 0.37.0 发布与正式依赖验证

目标：发布已验证的 SDK 0.37.0，使用正式 npm 包完成统一模板与全部官方插件的仓库外构建，恢复三个远端 CI。

## 需求与边界

- 用户授权发布 @xiongtao.xt/tau-plugins@0.37.0，重跑自定义组件、火柴人、微信读书的分支 CI。
- 模板和插件仍由 plugins/ 子模块维护；如需修复，先提交、推送子仓库，再更新主仓库固定提交。
- 不发布 UI 包、博客包、插件版本或 APP，不部署中心；平板、真机、最低系统和 iOS 签名等 D 待验收项保留。
- 发布已核验的精确 tarball，不重建后直接替换已验证字节，不修改已发布版本。

## 任务列表

当前工具集没有任务列表工具，以本文件维护单一进行中步骤。

| 任务                                      | 状态     | 结果与下一步                                                                              |
| ----------------------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| Investigate/Triage/Understand the problem | COMPLETE | 当前源码重建与候选包字节一致，24 仓锁文件摘要一致；npm 登录有效，0.37.0 未占用。          |
| 发布 SDK 并核对 npm 摘要                  | COMPLETE | 用户完成 npm 浏览器认证，发布成功；从正式 registry 下载的字节及元数据均与候选包摘要一致。 |
| 正式依赖构建与远端 CI                     | COMPLETE | 24 仓正式 npm 冻结安装与构建通过，模板专项通过，三个修正提交的 CI 成功。                  |
| 文档、提交与子模块指针                    | COMPLETE | 24 仓修复与使用说明已提交、推送，主仓库固定提交与发行记录同步；D 保留。                   |

## 发布输入与结果

- 主仓库基线：c250fd581，分支 codex/mobile-plugin-spike。
- 发布包：output/author-contract/final-sdk/xiongtao.xt-tau-plugins-0.37.0.tgz。
- npm shasum：3e537af2810379427ee0cf91ef03f1dd99c261d1。
- integrity：sha512-z8qZIFDd9A4nD4LjkykTl25QxdMtjol5hv5aEHdUfen+40sjAKy7RIwWrNCJ9tN30zyNQpFXo+XRvpXeHTIdSg==。
- npm 的 latest 为 0.37.0；版本元数据与重新下载的 tarball 均匹配上述摘要。24 仓锁文件不需要重新解析或更换摘要。

## 修复与验证

- 初次正式 npm 验证中，ABC 和模板通过；其余 22 仓的 minimumReleaseAgeExclude 仍包含旧 SDK 版本，阻止安装新发布版本。已将例外精确更新为 @xiongtao.xt/tau-plugins@0.37.0，没有全局关闭发布龄策略，也没有修改 CI 来跳过冻结安装。
- 24 仓均在主仓库之外复制源码，使用全新 pnpm store 和正式 npm registry，保留 package.json 与锁文件执行冻结安装、构建。未执行 use-local-sdk，也未注入本地 tarball；安装后的包身份与版本逐仓检查。
- 22 仓已定义测试共 176 项通过，Typst 原有 2 个网络用例默认跳过。火柴人与模板没有独立测试脚本；模板另以 --published --frozen-template 完成作者契约专项，页面和编辑器构建、类型闭包、包摘要与声明校验通过。
- 24 个子仓库的构建配置和已发布 SDK 使用说明已提交并推送到 codex/author-contract；主仓库固定提交同步，完整清单见 [子模块记录](submodules.md)。插件版本未递增，没有创建发布标签。
- 原失败运行的第二次尝试因旧配置继续失败；修正提交触发相同工作流的新运行，以下结果均核对了 headSha，不以其他提交的成功替代：

| 仓库       | 修正提交                                 | CI                                                                                          |
| ---------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| 自定义组件 | 44d52c8debd8657fd738b0b4f3b42f2fa51409b5 | [成功](https://github.com/LastKnightCoder/tau-plugin-custom-block/actions/runs/39937062028) |
| 火柴人     | dfad022b193aef4acf20f5ee98b1a9c775f442fc | [成功](https://github.com/LastKnightCoder/tau-plugin-stickman/actions/runs/39937068126)     |
| 微信读书   | e811ac9f8030fb6ab0e40a74a802df3570f66b2c | [成功](https://github.com/LastKnightCoder/tau-plugin-weread/actions/runs/39937073926)       |

报告为 output/sdk-037-release 下的 registry.json、final-authors.json、template-report.json、ci.json、pushed.json。已发布包保持原字节，源码发行说明与模板使用指南更新为正式 npm 流程，不覆盖 npm 版本。

## 验证与退出条件

npm 返回已发布版本与匹配摘要；24 仓在仓库外以正式 npm 依赖冻结安装、构建和执行已有测试；三个远端 CI 成功；必要的子模块提交与主仓库指针同步；更新文档与交接记录。报告放 output/sdk-037-release。父任务 D 尚未完成，本文件随父任务收尾沉淀、退役。
