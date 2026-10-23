# iOS 正式签名与打包

目标：使用已登录的 Apple 开发者账号，为当前移动端 0.2.3 配置正式签名，生成并核验 iOS 归档和 IPA。

## 范围与决策

- 用户授权配置签名并打包；账号验证、钥匙串或需要本人操作的系统提示交由用户处理。
- 沿用正式身份 com.txiong.tau-mobile 和团队 DFJV94JC29，使用当前 SDK 与插件契约，不扩展 API。
- 本轮先生成 App Store Connect 分发用途的产物，不自动上传、提交审核或开放 iOS 插件中心分发。
- 用户选择不连接 iPhone，改用 Apple Distribution 证书与 App Store 描述文件完成分发签名；不再等待开发设备注册。
- 桌面和 Android 用户验收结论保持；iOS 真机与其他 D 专项不因打包成功自动通过。

## 任务列表

当前环境没有任务列表工具，在本文件维护任务状态。

| 任务                                      | 状态     | 结果与下一步                                                                                                                      |
| ----------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Investigate/Triage/Understand the problem | COMPLETE | Xcode 已登录，团队与 Bundle ID 正确，自动签名已开启；开发 profile 因未注册设备报错，正式打包明确选择 App Store Connect 分发方式。 |
| 正式签名与归档导出                        | COMPLETE | 用户完成钥匙串授权后，release 构建、真机归档和 app-store-connect 导出全部成功；不依赖注册设备。                                   |
| 产物核验与文档收尾                        | COMPLETE | 版本、架构、证书、描述文件、entitlements、完整性和 SHA-256 全部核对；操作指南与索引同步，真机和中心分发仍单独验收。               |

## 验证与退出条件

正式归档与导出成功，核对 Bundle ID、版本、签名和产物摘要；记录实际阻塞与需要用户操作的位置。签名或归档失败时不交付为成功 IPA。完成后将稳定步骤沉淀到操作指南，本记录随父任务 D 收尾。

## 构建处理记录

- Xcode 已识别开发者账号及团队，Tau_iOS 的自动签名已开启，Apple Development 身份已可用。
- 已增加 build:ios:release 入口并固定团队；正式 CLI 使用 aarch64 / app-store-connect。前端类型检查与生产构建通过，CFBundleShortVersionString 更新为 0.2.3。
- 最初自动开发签名构建以 code 65 失败：团队没有注册设备，Xcode 无法生成 com.txiong.tau-mobile 的 iOS App Development provisioning profile。仅选择 app-store-connect 导出没有改变该构建阶段；后续已改为手动分发签名并完成导出。
- 原自动开发签名流程暂停后，用户明确改走无需注册设备的分发签名。继续创建或选择 Apple Distribution 与 App Store profile，归档阶段也使用分发签名，不只更换导出方式。
- 发现原生成工程保留 CFBundleVersion 0.2.1，已在 bundle.iOS 显式设置初始构建号 1 并同步生成工程；最终归档与 IPA 均确认 0.2.3 / Build 1。同版本再次上传前须递增。原生生成工程已备份到 output/ios-release/generated-before，失败日志为 output/ios-release/build.log。
- iOS 中心开关继续关闭，不自动上传 App Store Connect；D 专项保留。
- 按用户选择的无设备路径，已通过 Xcode 创建 Apple Distribution: Tao Xiong (DFJV94JC29)，钥匙串中签名身份可用，SHA-1 指纹为 9AD7AF73E7A94BE28F6C9840B33FFEC4069D4D8A。私钥留在钥匙串，未导出。
- 用户完成 Apple Developer 网页登录。账号原先只有 XC Wildcard，已注册显式 App ID Tau / com.txiong.tau-mobile，没有启用额外应用服务。
- 已创建 Tau App Store 描述文件，UUID 527fd1c6-67ab-4f5a-b7dc-4e604e2ac160；核对团队/App ID、分发证书摘要、get-task-allow=false、beta-reports-active=true，无 ProvisionedDevices。证书与描述文件没有提交仓库。
- Tauri 2.10.0 的子进程未继承尝试的 XCODE_XCCONFIG_FILE 覆盖，仍请求开发 profile；已删除该无效覆盖，直接在生成工程的 release buildSettings 与 project.yml 中设置 Manual / Apple Distribution / Tau App Store。xcodebuild -showBuildSettings 已确认三项实际生效，debug 保持原开发签名。
- ios-export.plist 保存 app-store-connect、manual、团队、证书类型与 Bundle ID → 描述文件名称映射；prebuild:ios:release 将其复制到生成工程供 CLI 合并，避免导出沿用初始化时的 debugging 配置。只包含签名配置元数据，不包含描述文件或私钥。
- 用户已完成钥匙串授权；手动分发构建返回 BUILD SUCCEEDED，归档完成，CLI 导出成功并以 0 退出。日志为 output/ios-release/manual-build.log；无需连接 iPhone。

## 交付与核验结果

- 交付 IPA：output/ios-release/Tau-0.2.3-ios-app-store.ipa，29,714,215 字节，SHA-256 为 79647f558a026c256801d97a3afc2b82dce976cffb7648b65a2cfff06806525a。
- 原始输出：apps/mobile/src-tauri/gen/apple/build/arm64/Tau.ipa；归档为同一 build 目录下的 Tau_iOS.xcarchive。交付文件是原输出的直接副本，不重新压缩或修改签名内容。
- 版本 0.2.3，构建号 1，Bundle ID com.txiong.tau-mobile，架构 arm64，平台 iPhoneOS，声明最低 iOS 14.0；最低系统未因此视为已测。
- codesign --verify --deep --strict 通过；签名证书 SHA-1 9ad7af73e7a94be28f6c9840b33ffec4069d4d8a，与本机 Apple Distribution 及嵌入描述文件相符。团队为 DFJV94JC29，application-identifier 精确匹配。
- 描述文件为 Tau App Store，UUID 527fd1c6-67ab-4f5a-b7dc-4e604e2ac160，get-task-allow=false、beta-reports-active=true，无设备列表和全设备分发标志。导出方法 app-store-connect，destination=export，未上传。
- 核验报告为 output/ios-release/verification.json。前端类型与生产构建、schema 校验、实际原生构建/归档/导出、plist 格式与文档检查通过；没有重复运行未涉及的 SDK 或 Android 测试。
- 签名配置和步骤已沉淀到 [iOS 操作指南](/docs/guides/ops-ios-signing.md)，任务与文档索引同步。证书私钥、mobileprovision、构建包不提交 Git。

本轮仅完成正式包交付；未创建 App Store Connect App 记录、未上传 TestFlight 或提交审核，iOS 插件中心开关仍关闭。用户拿到 iPhone 后，设备安装、真实插件下载和交互继续验收；D 其余专项保留，父任务不退役。
