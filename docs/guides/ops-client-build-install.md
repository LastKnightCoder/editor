# 客户端构建与安装

以下命令除特别注明外均在仓库根执行。只构建和安装测试包时，不执行发布脚本；客户端发布、插件发布和插件中心部署分别操作。

## 准备工作区

1. 用 `git status --short` 确认修改归属，记录 `git rev-parse HEAD`。构建日志、产物和摘要放本地 output 目录，不提交二进制与签名凭据。
2. 需要官方插件或模板源码时执行 `git submodule update --init --recursive`，检出主仓记录的提交；不要用 `--remote` 将未经验证的新提交带入发行。
3. 使用根 package.json 的 packageManager 指定版本执行 `pnpm install --frozen-lockfile`。依赖安装不准备 Android 签名，不要求开源贡献者持有项目正式密钥；正式 Android 构建前单独恢复私有签名资料。
4. 安装 Node.js、Rust 和目标平台工具链。Node 需支持 schema 校验使用的 `node:sqlite`；Android 使用 Android Studio 的 SDK/NDK/JDK，iOS 使用完整 Xcode。以仓库锁文件与平台工程要求为准。
5. 核对版本：桌面为根与 apps/desktop 的 package.json；移动为 apps/mobile/package.json、src-tauri/tauri.conf.json 及 Cargo.toml/Cargo.lock 中移动包版本。iOS 同版本重传还须递增 bundle.iOS.bundleVersion；最终以安装包内版本为准。

判据：依赖冻结安装成功，已有签名资料可用，源码提交、版本及目标架构明确。开发服务器或浏览器构建成功不能代替原生安装包成功。

## 桌面 macOS

签名、公证、构建与发布命令统一见 [macOS 手册](/docs/guides/ops-macos-code-signing.md)，产物体积排查见 [构建检查](/docs/guides/ops-build-size.md)。

1. 根据“关于本机”选择 arm64（Apple 芯片）或 x64（Intel）DMG。
2. 完全退出旧 Tau，打开 DMG，将 Tau 拖入“应用程序”，确认替换后从“应用程序”启动；不要在 DMG 挂载目录作为日常应用运行。
3. 核对版本、原工作区和数据，再验证插件。遇到 Gatekeeper 拦截先检查签名、公证和下载来源，不通过清除安全属性掩盖发行问题。
4. macOS 交付不代表 Windows/Linux 已出包或已验收；各平台独立构建和记录结果。

## Android 构建与覆盖安装

1. 设置 `JAVA_HOME`、`ANDROID_HOME`、`NDK_HOME`，将 JDK bin、SDK platform-tools 加入 PATH；使用符合生成工程要求的版本。`adb devices -l` 应识别指定设备，手机信任授权由用户完成。
2. 恢复正式签名目录（默认 `~/.editor-mobile-signing`）中的 keystore 与 credentials.env，或通过现有 `TAURI_ANDROID_*` 环境变量提供同一证书。备份存私有位置，不打印密码、不入库。
3. 没有生成工程时才执行 `pnpm --filter mobile exec tauri android init`。已有工程不要因签名错误直接删除；备份原生自定义配置后再决定是否重建。
4. 可先执行 `pnpm --filter mobile prepare:android:signing` 检查已有签名，再执行 `pnpm --filter mobile build:android:release`。正式构建、调试包和 Android dev 入口都会先校验签名，成功才更新工程签名配置并继续 Tauri。典型产物为 `apps/mobile/src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk`，以本次 CLI 输出为准。
5. 用 SDK build-tools 的 `apksigner verify --print-certs <APK路径>` 核对签名，将证书 SHA-256 与上一正式包比较；用 `aapt dump badging <APK路径>` 核对应用 ID、版本及架构。正式 Android ID 为 `com.txiong.tau_mobile`，与 iOS 的连字符标识不同，不手工改成同一字符串。
6. 记录 APK 的 SHA-256，在确认的目标设备执行 `adb -s <设备序列号> install -r <APK路径>` 覆盖安装，不卸载旧应用、不清除数据。也可将已核验 APK 传到手机，由用户从文件管理器打开安装，并仅对实际安装来源授予所需授权。
7. 核对系统应用信息中的版本、原工作区和数据。`pnpm --filter mobile apk` 会构建后立即安装，且未指定 adb 序列号；只构建交付文件或连接多台设备时使用前面的分步命令。

签名准备只使用已有密钥：缺少工程、密钥、配置、可用 keytool，或密码/别名验证失败时退出非零；不创建签名目录、不生成/导入/替换密钥、不备份重命名原文件、不回写 credentials.env。签名校验全部通过后才修改工程的 keystore.properties 和 Gradle 签名块；Gradle 的签名配置缺失也会失败，不退回未签名 release。

### 私有签名配置与恢复

配置按环境变量 → 私有 credentials.env → 已有工程 keystore.properties 的顺序读取；密钥路径均未提供时使用私有目录中的 editor-mobile-release.jks。建议保存绝对路径，避免换工作目录产生歧义。

| 配置       | 环境变量                        | 私有 credentials.env 字段 |
| ---------- | ------------------------------- | ------------------------- |
| 密钥库路径 | TAURI_ANDROID_KEYSTORE_PATH     | KEYSTORE_PATH             |
| 密钥库密码 | TAURI_ANDROID_KEYSTORE_PASSWORD | STORE_PASSWORD            |
| 密钥别名   | TAURI_ANDROID_KEY_ALIAS         | KEY_ALIAS                 |
| 私钥密码   | TAURI_ANDROID_KEY_PASSWORD      | KEY_PASSWORD              |

四项使用原值，不生成示例密码或猜测默认别名。JKS 支持不同的密钥库/私钥密码；当前 keytool 校验流程要求 PKCS12 两个密码一致，不会自动覆盖为同一值。密钥恢复由持有人在构建前完成，再指定恢复文件路径，构建不负责导入密钥。

1. 换电脑或丢失配置时，恢复原 keystore 及其凭据的加密备份；文件只放仓库外，限制本机访问权限。未找回原密钥前停止正式发行，不生成替代密钥。
2. 密码错误时先检查环境变量是否覆盖了正确文件配置，再核对原别名和密码；缺 keytool 时配置 JDK/JAVA_HOME。不要删除密钥或卸载用户应用解决签名错误。
3. 同一系统用户下，master 与 worktree 默认共享仓库外的签名目录；脚本改动需合并到实际打包分支后才生效。Git 合并不携带私钥或密码。
4. 恢复后运行签名准备命令，再核对 APK 证书指纹是否匹配原安装包。脚本验证密钥可用性，不负责判断另一份有效密钥是否属于同一个已发行应用。
5. 修改签名脚本后运行 `pnpm --filter mobile test:android:signing`，需要 JDK keytool。测试只在临时目录创建一次性 JKS/PKCS12 密钥，检查成功、错误密码/别名、缺失、损坏、无 keytool、失败不改文件和重复执行；不会读取个人正式密钥。

出现 `INSTALL_FAILED_UPDATE_INCOMPATIBLE` 时恢复原证书/密码并重建，不卸载用户应用来绕过；出现 `INSTALL_FAILED_VERSION_DOWNGRADE` 时核对最终 versionCode，不强制降级。新 keystore 不能恢复旧证书签名身份。

## iOS 构建与安装

按 [iOS 签名、构建和 TestFlight 手册](/docs/guides/ops-ios-signing.md)执行。App Store Connect 分发 IPA 不能像 APK 一样直接点开安装；本人测试通过 TestFlight，不要求先注册测试设备。

分开记录：归档/IPA 成功、Apple 上传与处理成功、内部群组可测试、真机实际安装及插件行为通过。前一项不能代替后一项。

## 插件下载安装与交付检查

1. 桌面进入“插件”，移动进入“我的 → 插件中心”，按本机平台选择可安装版本。桌面安装后检查启用状态；待生效时完整退出并重开应用。
2. 页面插件检查入口、保存与重启恢复；编辑器插件在正常卡片/文章检查插入、预览、保存、取消与重启后的正文保真。细项见 [正式宿主验收](/docs/guides/plugin-portability-hosts.md)。
3. 有入口但不能安装时，检查客户端版本/能力、生产平台开关、插件平台声明/最低版本和发布状态。协议见 [跨端插件架构](/docs/architecture/plugin-portability.md)，部署与回退按 [门户运维手册](/apps/plugin-portal/infra/运维手册.md)，不要通过调试来源覆盖修正正式包。
4. 交付记录保留源码提交、版本/构建号、平台/架构、产物路径、SHA-256、签名身份、发布范围和验证结果。最低系统、平板、性能、云同步等未测项目明确保留，不因打包或基础功能验收自动关闭。
5. 不用不同字节覆盖已发布版本；修复后生成新的平台发行版本或 iOS 构建号，重新核验并分发。上传更新服务器、发布插件和提交 App Store 上架分别按对应发行范围操作。
