# iOS 正式签名与打包

依赖安装、跨端安装和插件验收入口见 [客户端构建与安装](/docs/guides/ops-client-build-install.md)。本手册只写可重复执行的流程；具体构建号、产物摘要和每次发行的验证结果记在对应发行任务中。

## 准备签名

1. 在 macOS 安装 Xcode 与 iOS 平台组件，确认 `xcode-select -p` 指向 Xcode 的 Developer 目录。
2. 在 Xcode 菜单栏的 Settings → Apple Accounts 登录开发者账号，确认账号有项目开发团队的访问权限。账号、验证码与钥匙串密码只在系统界面输入。
3. 打开 `apps/mobile/src-tauri/gen/apple/Tau.xcodeproj`，选 Tau_iOS → Signing & Capabilities。保留正式 Bundle ID，选择与 `bundle.iOS.developmentTeam` 一致的团队；开发测试可用自动签名，正式 release 按下节设置手动分发签名。
4. 首次没有生成工程时，在 apps/mobile 执行 `pnpm exec tauri ios init`。已有工程不因签名错误直接删除；重新生成前备份原生自定义配置。

判据：账号和团队可用。开发设备运行使用 Apple Development 与包含设备的描述文件；App Store Connect 导出使用分发证书和对应描述文件。缺账号、描述文件或证书时按具体错误处理，不能把 macOS Developer ID 当作 iOS 分发证书。

若自动签名提示团队没有设备、缺少 iOS App Development profile，先通过 USB 连接并解锁 iPhone，在手机确认信任此电脑，再让 Xcode 完成设备注册并重试。该要求来自开发签名构建阶段，不表示 App Store 分发必须绑定设备。手机的信任、开发者模式或账号验证提示由用户本人处理。

## 无测试设备的分发签名

1. 在 Xcode 的 Apple Accounts → 团队 → Manage Certificates 中创建或选择 Apple Distribution 证书，确认本机具有对应私钥，不撤销现有证书。
2. 登录 Apple Developer 的 Certificates, Identifiers & Profiles，确认正式 Bundle ID 对应的显式 App ID 存在。
3. 在 Profiles 创建 App Store Connect 类型，选择该 App ID 和本机分发证书，生成后下载并安装描述文件；该类型不选择设备。
4. 在 Tau_iOS 的 Signing & Capabilities 选择 release 配置，关闭该配置的自动签名，选择团队、Apple Distribution 和 Tau App Store 描述文件；debug 保持开发签名。用 `xcodebuild -showBuildSettings` 确认 CODE_SIGN_STYLE、CODE_SIGN_IDENTITY、PROVISIONING_PROFILE_SPECIFIER 已生效。生成工程被重新初始化时，须重新配置。
5. 本仓库 `apps/mobile/src-tauri/ios-export.plist` 保存正式导出映射，构建入口将其复制到生成工程。描述文件改名、团队或 Bundle ID 改变时同步该文件；不要提交私钥或 mobileprovision。当前 Tauri 2.10.0 不依靠 XCODE_XCCONFIG_FILE 传递签名覆盖。
6. 再运行正式构建并核对最终产物签名。归档构建本身就要使用分发签名；仅指定导出 app-store-connect 不会替代先前的开发签名配置。

网页登录和 Xcode 账号登录可能分别要求验证。证书私钥保留在钥匙串，不为了本机打包创建额外 API 密钥或公开导出私钥。步骤依据 [Apple 描述文件说明](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile/)。

## 正式构建

从仓库根执行：

```sh
export pnpm_config_verify_deps_before_run=warn
pnpm --filter mobile build:ios:release
```

入口明确选择 aarch64 真机目标、release 构建与 app-store-connect 导出。前端构建和数据库 schema 校验随构建运行；`prebuild:ios:release` 先运行 `check:rust`（Rust 格式检查、clippy 与单元测试，rustc 级 warning 即失败）；版本读取移动项目配置，上传新构建前递增 `bundle.iOS.bundleVersion`。输出路径以本次 CLI 完成信息为准，不拿模拟器 .app 或旧目录里的 IPA 代替本次结果。

`prebuild:ios:release` 和 `predev:ios` 会运行 `sync:ios:icons`，按生成工程 `AppIcon.appiconset/Contents.json` 从已提交的 `src-tauri/icons/ios` 同步全部图标，缺图即失败。同步使用 Xcode 自带 Swift / ImageIO，按现有白色背景合成为不含透明通道的 PNG，不新增图像处理依赖；品牌背景变化时同步调整该合成步骤。品牌源图 `src-tauri/app-icon.png` 须为满铺正方形（不带圆角、阴影或透明边，圆角由系统裁切），否则主屏图标会多出一圈白边。修改源图后先运行 `pnpm --filter mobile icon:regen` 并提交图标资源：生成工程存在时 `tauri icon` 只写入 `gen/apple`，该命令末尾由 `collect-ios-icons.mjs` 回收到 `src-tauri/icons/ios`，单独调用 `tauri icon` 会让新图在下次同步时被旧图覆盖；重新初始化工程后也须同步，避免使用 Tauri 模板图标。直接调用 Tauri CLI 或 Xcode 构建时，先手动运行 `pnpm --filter mobile sync:ios:icons`。

codesign 请求钥匙串私钥访问时，由用户在系统窗口输入 Mac 登录密码并授权；构建与归档可能分别触发。不要读取、代填或通过修改钥匙串策略绕过该授权。命令最终成功退出后再交付 IPA。

典型归档为 `apps/mobile/src-tauri/gen/apple/build/Tau_iOS.xcarchive`，IPA 为该 build 目录下的 `arm64/Tau.ipa`。成功后复制到本地 output 的独立版本/构建号目录，同时保存日志与摘要，避免下一次构建覆盖。保留对应归档供 Organizer 上传，不将另一次构建的归档与本次 IPA 混用。

生成工程 `gen/apple` 不在 Git 中。换机器或重新 init 后，按前文重新配置 release 手动签名；构建入口会同步图标与 ExportOptions，但不会恢复钥匙串私钥、描述文件或 Xcode 工程的签名设置。不要将生成工程、描述文件或私钥强制加入版本控制。

## 产物核验

1. 确认归档和 IPA 导出均成功；如果只有归档成功，保留归档并处理导出错误。
2. 检查归档或解压后 Payload 中 app 的 Info.plist：Bundle ID 与配置一致，CFBundleShortVersionString 为目标版本，CFBundleVersion 为本次构建号。再次上传同版本时使用新的构建号。
3. 对 app 执行 `codesign --verify --deep --strict`，检查签名团队、证书与 embedded.mobileprovision；核对分发方式和 entitlements 相符。
4. 对交付 IPA 执行 `shasum -a 256` 并保留结果。描述文件、证书私钥及账号凭据不得提交仓库或公开输出。
5. 构建前逐项检查 AppIcon 清单引用文件：与 `icons/ios` 在白底合成后的像素一致且没有透明通道；归档后检查 Info.plist 的 CFBundleIconName 为 AppIcon，并核对编译后图标像素与同步后的资源一致。压缩后的 PNG 字节可不同，应解码后比较，不以文件存在或文件名正确作为图标内容已核验。

从仓库根检查本次 IPA 的最小命令如下；如 CLI 输出路径不同，先调整源文件路径。临时目录与既有解包结果隔离：

```sh
tau_ipa_check_dir=$(mktemp -d)
ditto -x -k apps/mobile/src-tauri/gen/apple/build/arm64/Tau.ipa "$tau_ipa_check_dir"
plutil -extract CFBundleIdentifier raw "$tau_ipa_check_dir/Payload/Tau.app/Info.plist"
plutil -extract CFBundleShortVersionString raw "$tau_ipa_check_dir/Payload/Tau.app/Info.plist"
plutil -extract CFBundleVersion raw "$tau_ipa_check_dir/Payload/Tau.app/Info.plist"
codesign --verify --deep --strict "$tau_ipa_check_dir/Payload/Tau.app"
codesign -dv --verbose=4 "$tau_ipa_check_dir/Payload/Tau.app"
shasum -a 256 apps/mobile/src-tauri/gen/apple/build/arm64/Tau.ipa
```

这些命令只覆盖标识、版本、签名与摘要；仍需核对前述描述文件和图标。可用 `sips -g hasAlpha` 检查同步后的 PNG，用 `xcrun assetutil --info <App路径>/Assets.car` 检查归档内 AppIcon 的 1024 营销图标及不透明属性。签名核验不能替代图标内容核验。

## 分发与功能验收

上传与打包分开执行。获得上传授权后，使用 Xcode Organizer 或对应上传工具提交 App Store Connect，处理完成后经 TestFlight 验证；App Store Connect 用途的 IPA 不等于任意设备可直接侧载的安装包。

插件中心的 iOS 平台分发开关独立于签名。开关未开放时，成功安装 APP 也不会获得中心安装资格；开放操作按[门户运维手册](/apps/plugin-portal/infra/运维手册.md)执行。真实插件行为按[宿主验收指南](/docs/guides/plugin-portability-hosts.md)检查，签名成功不能代替真机与 D 专项验收。

## TestFlight 本人内部测试

1. 先确认 iOS 平台分发已开放，并用实际客户端版本/能力请求生产目录、精确选版与下载，核对 ZIP 摘要。
2. 在 App Store Connect 创建或选择匹配 Bundle ID 的应用记录；首次服务条款由用户本人确认。不要点击正式分发页的“添加以供审核”。
3. 使用对应的已验归档在 Xcode Organizer 选择 TestFlight Internal Only 上传；核对版本和构建号。该方式由 Xcode 处理上传包，不宣称与独立导出的 IPA 归档字节完全相同；不重新编译业务代码。
4. 等待 Apple 处理完成。若缺少出口合规信息，按代码及第三方库实际使用的加密填写，发行地区由用户确认；不能把包含 Rustls 的构建说成只使用 Apple 系统加密，也不能为跳过问卷直接写入未经核实的 Info.plist 豁免值。
5. 优先复用现有内部测试群组，按授权添加本人账号及指定构建；自动分发关闭时，新上传构建必须手动加入群组。核对构建“正在测试”、群组中的构建和测试员数量、账号“已邀请”或“已接受”。
6. 用户在设备上安装 TestFlight 并接受邀请。后台可测试不等于设备已安装；真机结果单独记录。只有明确授权正式发行时才进入 App Store 上架流程。

## iPhone 安装与更新

1. 在 iPhone 的 App Store 安装 TestFlight，打开本次内部测试账号对应的 Apple 邀请并接受，进入 Tau 测试页面。
2. 核对目标版本与括号内构建号，点击安装或更新。不要只看版本号相同就认为拿到了最新包；同一个版本可有多个构建。
3. 启动 Tau，检查版本、工作区和应用图标，再进入“我的 → 插件中心”安装兼容插件；待生效时完整退出重开。安装步骤和功能验收分别记录。
4. 本轮不需要连接电脑、注册 UDID 或使用开发描述文件，也不需要把 App Store Connect IPA 通过文件管理器侧载。只对开发签名运行流程处理设备注册，不把其错误套用到 TestFlight。
5. 更新测试包优先用 TestFlight 的更新按钮，不卸载或清除旧应用数据。设备看不到新构建时先核对账号、邀请、内部组、目标构建与状态；构建过期后需提供新的有效构建。

## 常见失败处理

| 现象                          | 排查与恢复                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| No Accounts / 缺少描述文件    | Xcode Settings → Apple Accounts 检查账号团队；确认本机分发证书具有私钥、profile 匹配 Bundle ID 与证书。              |
| 团队没有注册设备              | 检查是否误走开发签名；TestFlight 使用 release 的 Apple Distribution 和 App Store Connect profile，无需为此添加设备。 |
| 图标仍为 Tauri / 图标含 alpha | 确认通过 build:ios:release 入口同步；检查归档中实际 AppIcon，不能只看仓库源图。修复后递增构建号重新上传。            |
| 上传成功但不能安装            | 分别检查 Apple 是否仍在处理、是否缺出口合规回答、构建是否加入内部组、测试员是否接受邀请。                            |
| 同版本上传被拒                | 检查最终 IPA 的 CFBundleVersion 是否递增；仅修改文件名不能生成新的构建身份。                                         |
| IPA 无法直接安装              | 确认这是 App Store Connect 分发包，通过 TestFlight 安装，不改用开发 profile 来绕过分发流程。                         |
| Apple 提示最低系统要求变化    | 区分当前警告和上传失败，记录具体要求并在后续发行前处理；不要把声明支持的最低系统当作已经实机验收。                   |

图标或业务问题采用新构建修复；已上传构建不能原地替换。旧归档与日志留作排查，不自动扩大测试群组、开启公开测试或提交正式上架。
