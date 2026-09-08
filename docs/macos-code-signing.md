# macOS 代码签名与公证指南

本文档说明如何为桌面端配置正式代码签名（Developer ID）与 Apple 公证（Notarization），这是 macOS 自动更新（electron-updater / Squirrel.Mac）能够正常工作的前提。

## 背景：为什么必须签名

- macOS 上 electron-updater 走 Squirrel.Mac（ShipIt）机制，**ShipIt 在安装更新前会校验新包的代码签名，且要求 app 持有正式的 Developer ID 签名**。这是 Electron 官方文档明确的机制限制，无法绕过。
- 当前 `electron-builder.yml` 的 `mac:` 段未配置 `identity`，构建产物为 **ad-hoc 签名**（`codesign -dv` 可见 `Signature=adhoc`）。表现为：下载更新后点"重启并安装"无任何反应——`quitAndInstall()` 静默死等，既不退出也不报错（已做 3 秒兜底提示 + 手动下载引导，见 `src-electron/main/modules/updater.ts`）。
- 签名 + 公证后，自动更新链路（下载 → 校验 → 重启安装）才能完整工作，同时用户从网上下载的 app 首次打开也不会被 Gatekeeper 拦截。

## 前提：Apple Developer 账号（99 美元/年）

注册地址：<https://developer.apple.com/programs/>

| 类型              | 要求                             | 区别                       |
| ----------------- | -------------------------------- | -------------------------- |
| 个人 Individual   | 仅 Apple ID                      | 当天可批，证书显示个人姓名 |
| 公司 Organization | D-U-N-S 编号（免费申请，1-2 周） | 证书显示公司名             |

两种类型在签名、公证、自动更新功能上**没有区别**，仅影响证书显示名。

> 没有付费账号就拿不到 Developer ID 证书，Squirrel.Mac 的签名校验没有绕过方式。

## 第一步：创建 Developer ID Application 证书

证书私钥生成并保存在打包用的 Mac 上。

1. 打开「钥匙串访问」→ 菜单栏「证书助理」→「从证书颁发机构请求证书…」；
2. 填写邮箱和常用名，选「**保存到磁盘**」，生成 `.certSigningRequest` 文件；
3. 到 [developer.apple.com → Certificates](https://developer.apple.com/account/resources/certificates/list) → 点 ➕ → 选择 **Developer ID Application** → 上传 CSR → 下载 `.cer` 文件；
   - 建议顺手把 **Developer ID Installer** 也创建一份（签 `.pkg` 时用）；
4. 双击 `.cer` 导入钥匙串（自动与第 2 步的私钥配对）；
5. 终端验证：

   ```bash
   security find-identity -v -p codesigning
   ```

   输出中出现 `Developer ID Application: 你的名字 (TEAMID)` 即成功。**记下 TEAMID（10 位字母数字），公证环节要用。**

私钥备份：在钥匙串访问中把证书连私钥导出为 `.p12` 文件妥善保存（换电脑、CI 打包都需要它）。**`.p12` 绝不能提交进仓库。**

## 第二步：配置 electron-builder

### 2.1 `apps/desktop/electron-builder.yml` 的 `mac:` 段

在现有配置基础上增加（保留原有的 `icon`、`artifactName`、`extendInfo`、`fileAssociations`）：

```yaml
mac:
  icon: "build/icon.icns"
  artifactName: "${productName}-v${version}-${platform}.${ext}"
  identity: "Developer ID Application: 你的名字 (TEAMID)" # 也可省略，证书唯一时自动匹配
  hardenedRuntime: true # 公证的硬性要求
  notarize: true # electron-builder 24+ 内置公证流程
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  extendInfo:
    NSCameraUsageDescription: "Tau 需要访问摄像头，用于白板演示录制时显示摄像头画中画。"
    NSMicrophoneUsageDescription: "Tau 需要访问麦克风，用于白板演示录制时保存讲解声音。"
  fileAssociations:
    - ext: md
      name: Markdown
      role: Editor
      isPackage: false
```

### 2.2 新建 `apps/desktop/build/entitlements.mac.plist`

开启 Hardened Runtime（公证要求）后，Electron 必须带以下豁免才能正常运行：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key><true/>
</dict>
</plist>
```

> 摄像头/麦克风权限（`NSCameraUsageDescription` 等）属于 Info.plist 层面，与 entitlements 不冲突，保持原样即可。

## 第三步：公证凭据（环境变量）

`notarize: true` 需要向 Apple 证明身份，两种方式二选一。

### 方式 A：Apple ID + 应用专用密码（本地打包推荐）

1. 到 [appleid.apple.com](https://appleid.apple.com/) → 登录 →「登录与安全」→「App 专用密码」→ 生成（形如 `abcd-efgh-ijkl-mnop`）；
2. 打包前设置环境变量：

   ```bash
   export APPLE_ID="你的AppleID邮箱"
   export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
   export APPLE_TEAM_ID="你的TEAMID"
   ```

### 方式 B：App Store Connect API 密钥（CI 推荐）

App Store Connect → 用户和访问 → 集成 → 新建密钥（角色至少 App Manager），下载 `.p8` 文件后设置：

```bash
export APPLE_API_KEY="密钥ID"
export APPLE_API_KEY_PATH="/path/to/AuthKey_XXXX.p8"
export APPLE_API_ISSUER="发行商ID"
```

CI（GitHub Actions）用这种方式，避免暴露 Apple ID 密码；密钥文件放 Secrets。

## 第四步：打包与验证

```bash
cd apps/desktop
pnpm build
```

electron-builder 会在打包末尾自动完成：签名 → 压缩 zip → 上传 Apple 公证 → 轮询结果 → 装订票据（staple）。公证需要等待几分钟，失败原因会打印在日志中。

产物验证（**每次正式发布前都建议跑一遍**）：

```bash
# 1. 签名校验（路径按实际产物调整）
codesign --verify --deep --strict --verbose=2 "release/mac-arm64/Tau.app"

# 2. Gatekeeper 校验——公证成功的标志，输出 "accepted"
spctl --assess --type execute -v "release/mac-arm64/Tau.app"
```

> electron-builder 在找不到证书时会**静默回退为 ad-hoc 签名**，所以不要只看构建成功，务必跑上面的两条验证命令。

## 第五步：发布

签名版打包通过后，走现有发布流程（上传 OSS 并更新 electron-updater 拉取的 `latest-mac.yml`）：

```bash
# 需要先设置阿里云凭据
export ALI_OSS_ACCESS_ID="..."
export ALI_OSS_ACCESS_KEY="..."

# 指定版本发布（回写两处 package.json → 构建 → 上传 → 打 tag）
pnpm publish:desktop --version x.y.z

# 构建已完成时跳过构建重试
pnpm publish:desktop --skip-build
```

更新源为 OSS generic provider：`https://release-bin.oss-cn-shanghai.aliyuncs.com/desktop`（`electron-builder.yml` 的 `publish` 配置，bucket/region 不可变更）。签名版发布后，Squirrel 链路即可正常工作。

## 发布后验证更新链路

1. 安装一个**低于发布版本**的签名版；
2. 打开 设置 → 关于 → 检查更新 → 下载更新 → 重启并安装；
3. 预期：应用退出 → ShipIt 安装新版本 → 自动重启进入新版本；
4. 若仍失败，查看日志 `~/.editor/notes.log`（electron-updater / Squirrel 的输出都写在这里）。

## 常见坑

1. **签名必须持续一致**：Squirrel 校验「新包签名 == 当前 app 签名」。同一个 Developer ID 证书要一直用下去；证书遗失需要先用新证书重发一版，老用户才能继续收到后续更新。
2. **存量的 ad-hoc 旧版本无法自动升级到签名版**：旧版的 ShipIt 校验不会通过。这批用户需要**手动下载一次签名版**，之后自动更新才恢复。建议首个签名版发布时推进版本号，并在更新说明中引导手动下载。
3. **公证失败常见原因**：Hardened Runtime 未开启、entitlements 缺失、 bundle 内嵌了未签名的辅助可执行文件（Python/ffmpeg 等运行时 electron-builder 会统一处理，若公证报 "unsigned executable" 需检查是否新增了二进制）。
4. **私钥安全**：`.p12`、`.p8`、App 专用密码只放本地钥匙串或 CI Secrets，通过环境变量传入，绝不提交仓库。
5. **Windows 不受影响**：本指南仅针对 macOS；Windows 的更新链路没有签名强制要求。
