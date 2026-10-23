# Android 正式签名保护

目标：保留已有正式密钥，签名资料缺失或验证失败时停止构建，避免换机生成不同签名的 APK。

## 需求与用户决策

- 用户平时在 master 打包；本轮在 codex/mobile-plugin-spike 修改、测试并提交，后续再合并 master，不直接修改主分支。
- 禁止自动生成、替换或导入密钥；现有密钥和私有凭据文件保持不变。失败必须退出非零，不通过卸载应用规避签名问题。
- 私钥与密码不提交、不输出。测试只使用临时密钥；本机已有签名只执行校验和摘要对比。
- 本轮不发布新 APK、不改应用 ID/版本或 iOS 分发，D 原专项保留。

## 技术方案

prepare-android-signing.mjs 从环境、私有 credentials.env 和已有 keystore.properties 读取配置；验证工程、密钥、四项配置与 keytool 后，先检查密钥库密码，再使用只输出 CSR 的 certreq 校验别名和私钥。PKCS12 的不同私钥密码会被 keytool 忽略，因此显式拒绝该配置；JKS 可保留不同密码。密码仅经子进程环境传递，不放命令参数或日志。

所有签名校验通过后才写工程 keystore.properties 与 Gradle 配置，不修改私有签名目录。Gradle 缺少签名配置会立即失败。依赖安装不再调用签名准备；Android release、test 与 dev 入口继续执行校验。删除前已核对生成/导入代码消费者，没有额外流水线依赖自动生成密钥。

## 任务列表

当前环境没有任务列表工具，在本文件记录任务状态。

| 任务                                      | 状态     | 结果与下一步                                                                                   |
| ----------------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| Investigate/Triage/Understand the problem | COMPLETE | 找到缺失/密码错误自动换密钥、缺 keytool 跳过验证和 postinstall 写凭据的问题。                  |
| 实现严格校验与无损失败                    | COMPLETE | 删除自动生成/导入/替换及私有凭据回写；校验前不改工程，依赖安装与签名准备分开。                 |
| 临时密钥测试与实际资料保护核验            | COMPLETE | 14 项临时密钥测试、本机私有资料摘要、Gradle 正常验证与缺签名失败检查通过。                     |
| 运维文档、检查与提交                      | COMPLETE | 恢复流程、测试入口及索引已更新；ESLint、格式和 171 篇文档检查通过，同批提交供后续合并 master。 |

## 验证

- pnpm --filter mobile test:android:signing：14 项通过。覆盖 JKS/PKCS12、缺工程/目录/文件/配置、密码与别名错误、损坏文件、缺 keytool、只有公开证书的别名、环境覆盖、CLI 退出码与密码不泄漏、失败文件不变、重复执行以及 Java properties 路径/密码转义。
- 本机运行签名准备成功，私有签名目录文件集合与全部文件 SHA-256 均未改变；未输出密码或私钥，未提交签名资料。
- 在现有 Android 工程执行 validateSigningArm64Release --rerun-tasks --offline：5 个任务实际执行，构建配置及签名检查成功。临时设置空密钥路径再次运行，按预期在 Gradle 配置阶段失败，未回退到未签名 release。
- Gradle 日志位于 output/android-signing-guard；未重新打包 APP。macOS 本机 JDK 验证通过，不将其当作 Windows 主机实跑记录。

## 交接与退出条件

操作步骤沉淀到 [客户端构建与安装](/docs/guides/ops-client-build-install.md)，测试入口放 mobile README。本项已随 [主分支集成](master-integration.md) 合并到 master；合并代码不携带密钥，master 与 worktree 在同一系统用户下默认读取同一个仓库外目录。验证有效密钥不等于锁定发行身份，发行前仍需与原 APK 的证书指纹比较。

本项代码和文档同批提交；父任务 D 尚未结束，本记录随父任务收尾退役。
