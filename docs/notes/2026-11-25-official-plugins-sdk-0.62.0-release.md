# 官方插件 SDK 0.62.0 升级发行记录

用户授权五个官方插件升级依赖、发新版本、打 tag，并确认自动发布指插件中心。

五仓库均使用正式 npm SDK 0.62.0/UI 0.6.0，锁文件来自真实 registry；冻结安装、类型检查、现有测试与构建通过后，按同一提交原子推送 main 和注解 tag。体重既有导航测试夹具的 placement 修正包含在发版提交，FakeLink 开发说明改为引用 package.json 的固定版本。没有更改数据模型、权限或业务行为。

实际 ZIP 由各项目原有格式 3 构建入口生成；保留原平台和最低客户端声明，没有因 SDK 版本号提升而迁移包格式或抬高运行门槛。包内声明、更新说明及完整性已核对。GitHub Actions 正常完成 GitHub Release 和插件中心 CI 提交，没有手工绕开工作流上传，也没有移动已发布 tag。

| 插件     | 版本与标签                                                                            | 提交                                       | Actions                                                                                  | 中心 releaseId                         | ZIP SHA-256                                                        |
| -------- | ------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| 记账本   | [v0.2.7](https://github.com/LastKnightCoder/tau-plugin-expense/releases/tag/v0.2.7)   | `36c23ffcb69c3f7922cee8b4fa56cbea95c050a3` | [成功](https://github.com/LastKnightCoder/tau-plugin-expense/actions/runs/45553164897)   | `1af65ad8-ac9f-4b29-afdc-3eecc3138525` | `7e2d52aee4f5a55f668518e05051b40f7a6399a040189e99fcc361ef4f449be9` |
| 减重     | [v0.2.11](https://github.com/LastKnightCoder/tau-plugin-weight/releases/tag/v0.2.11)  | `08a980a8bb5e919171123b01ec915da244755f19` | [成功](https://github.com/LastKnightCoder/tau-plugin-weight/actions/runs/45553166944)    | `f2380f39-14ff-4f1d-a392-c1b74bba24dd` | `385f964a5305d38f18f07e411dc70da8eb37d9bb440906b69ce9f25385f112e2` |
| 问题管理 | [v0.1.7](https://github.com/LastKnightCoder/tau-plugin-questions/releases/tag/v0.1.7) | `99f1d21239b58e91a3ccd4222ba11011f37ca0cf` | [成功](https://github.com/LastKnightCoder/tau-plugin-questions/actions/runs/45554023381) | `2f14e992-2e54-427e-ad21-b0a6ee7da275` | `40f2149aa70284bb3c32cd4425dfb647c32ee638c6becbb303d09364fc02a5e5` |
| 播客     | [v0.3.4](https://github.com/LastKnightCoder/tau-plugin-podcast/releases/tag/v0.3.4)   | `28c8a039c55f3c5d20f47381fc6d671faff14824` | [成功](https://github.com/LastKnightCoder/tau-plugin-podcast/actions/runs/45553164526)   | `beffa203-25a9-4873-a052-87fad1ed019d` | `6e1d7923c678e1bb98e0a89a2a37ee270fe9d457fff7bb27417d674c18a0df24` |
| FakeLink | [v0.1.2](https://github.com/LastKnightCoder/tau-plugin-fakelink/releases/tag/v0.1.2)  | `9a7a50586c68bebd408a4b1ce8ae970f26df737d` | [成功](https://github.com/LastKnightCoder/tau-plugin-fakelink/actions/runs/45553165165)  | `c56ed9d6-7cfa-4fca-8201-f4ffa26f3519` | `0be2eb790528b124d737cea11ed30887518be13203016907a1a479bf930a022f` |

五个桌面发行记录均已公开，publishedAt 非空。每个中心下载字节与 GitHub ZIP 完全相同，SHA-256 与中心记录一致；记账本、减重的 Android/iOS 目录也已核对为同一 releaseId 和摘要。问题管理推送及播客下载遇到瞬时网络停滞，重试后已完成核验，没有重复发版。

机器结果 `/tmp/tau-official-062-published-report.json`；工作流与版本提交状态 `/tmp/tau-official-062-release-state.json`；下载证据 `/tmp/tau-official-062-artifacts/`。五个子仓库本地均干净，tag 指向本次提交；父仓库指针变化保留在工作区，其他任务未并入插件发行提交。未执行本机插件安装或客户端自动更新体验排查。
