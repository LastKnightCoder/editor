# macOS 代码签名、公证与发布

本手册适用于桌面 Developer ID 分发。iOS 的 Apple Distribution 证书、描述文件与 TestFlight 流程见 [iOS 手册](/docs/guides/ops-ios-signing.md)，两套签名不可混用。

## 准备签名与公证凭据

1. 在打包 Mac 的钥匙串中安装有效的 Developer ID Application 证书及对应私钥。执行 `security find-identity -v -p codesigning`，确认该身份存在；未显式写 identity 不等于 ad-hoc，electron-builder 可自动选择有效身份。
2. 新机器需要证书时，在钥匙串访问中生成 CSR，交 Apple Developer Certificates 创建 Developer ID Application 证书后导入。已有可用证书时复用，不无故创建或撤销。私钥备份保存在私有位置，不提交证书私钥、密码或凭据。
3. 使用本机已配置的 notarytool 钥匙串凭据。本项目本地发行使用 tau-notary profile；profile 名不是密码，其他机器必须先由账号持有人配置。需要创建凭据时先查 `xcrun notarytool store-credentials --help`，按 Apple 认证流程录入，不把密码写进仓库或日志。
4. 在构建终端设置：

   ```sh
   export APPLE_KEYCHAIN_PROFILE="tau-notary"
   ```

5. 保留 electron-builder.yml 的双架构目标、带 arch 的文件名及原生资源配置；不要复制旧单架构配置覆盖它，也不要为通过公证临时添加未经确认的 entitlements 豁免。

判据：签名身份具有私钥，公证 profile 在当前钥匙串可用。系统请求私钥访问、账号验证或协议确认时由用户本人处理。

## 构建与验证

在仓库根执行：

```sh
pnpm --filter desktop build
```

入口执行 schema 准备、tsc/Vite、原生打包及 verify-native-runtime。默认 macOS 双架构流程串行构建并签名 Intel/Apple 芯片应用，再并行公证；全部公证与附票完成后才生成 DMG、ZIP 和更新清单。缺少签名、公证凭据或公证失败会阻止该流程生成发行产物，不从失败后残留目录取旧包交付。

对实际输出的两个 app 分别检查，路径以本次日志为准：

```sh
codesign --verify --deep --strict --verbose=2 "apps/desktop/release/mac-arm64/Tau.app"
codesign -dv --verbose=4 "apps/desktop/release/mac-arm64/Tau.app"
spctl --assess --type execute -v "apps/desktop/release/mac-arm64/Tau.app"
xcrun stapler validate "apps/desktop/release/mac-arm64/Tau.app"
```

判据：正式 Developer ID 签名与团队匹配、Gatekeeper accepted、票据验证成功、原生运行时检查通过。对 Intel 产物重复检查，不以一种架构代替另一种；记录 DMG/ZIP 的版本、架构、大小与 SHA-256。签名与公证成功不能代替安装和自动更新行为验收。

## 发布到客户端更新服务器

仅构建或交付测试安装包时到此为止。需要正式更新发行时：

1. 在 `apps/desktop/release-notes/<版本>.md` 准备升级公告。核对根目录和 apps/desktop 两处 package.json 的版本。
2. 默认目标是 R2，客户端更新源为 `https://dl.taunote.app/desktop`。通过私有环境配置 R2_ACCOUNT_ID、R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY；不在聊天或仓库保存取值。
3. 先执行本地发布预检：

   ```sh
   pnpm publish:desktop --skip-build --dry-run
   ```

   该命令不上传，但会校验产物并把公告写入本地 latest*.yml，不是完全只读。确认版本、摘要与产物集合匹配。

4. 在已批准的发行范围内发布已验产物：

   ```sh
   pnpm publish:desktop --skip-build
   ```

   需要先改版本再重新构建时使用 `pnpm publish:desktop --version x.y.z`。脚本上传成功后尝试创建版本 tag，不自动推送；核对日志与 tag 结果，不能把上传成功当作 Git 已推送。不要用 `--force` 覆盖已发布版本来修复客户端。

## 安装、更新与失败处理

- 首次安装或手动升级按 [客户端安装手册](/docs/guides/ops-client-build-install.md)选择架构并替换应用。
- 更新验收使用低于目标版本的正式签名包，进入“设置 → 关于 → 检查更新”，下载并重启安装，确认应用退出、重启后版本正确且原工作区数据保留。仅交付本地 DMG 不会让线上更新服务器自动出现新版本。
- 缺少公证凭据时，确认当前终端已设置 profile 且该机器有相应钥匙串项；不要关闭公证来发布。
- 公证失败保留请求 ID 与失败日志，排查辅助可执行文件签名及实际权限需求；不要把“构建成功”或“已提交公证”记成“公证通过”。
- 原生依赖/架构或包大小异常按 [构建检查](/docs/guides/ops-build-size.md)处理，不跳过 verify-native-runtime。
- 自动更新失败先检查新旧包签名、更新源和清单摘要；原 ad-hoc 包可引导用户手动安装已验证正式包，不清除用户数据库或绕过系统安全校验。
