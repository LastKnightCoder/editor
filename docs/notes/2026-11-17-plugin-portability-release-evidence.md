# 跨端插件 B–C–D 发行证据快照

plugin-portability-bcd 任务收尾归档（任务目录已删除，详细过程见 git 历史）。以下为当时的发行产物与验收结论，仅作证据保全，不是当前状态。

## SDK 与插件中心

- SDK `@xiongtao.xt/tau-plugins` 0.37.0 已正式发布 npm；24 个官方插件仓库 main 快进到该 SDK 验证提交，发布工作流全部成功，生产目录 24 个新版本的公开 ZIP 摘要逐一匹配。来源 / 版本 / 发布 ID / 摘要 / CI 记录在当时的 `output/production-closeout/`（plugin-inputs.json、published-packages.json、release-ci.json）。
- 生产开关开放 desktop / android，iOS 分发后续开放（Worker 6d504ef2 上线后 iOS 0.2.3 可选版并下载，摘要与统一包一致）。

## 客户端产物（SHA-256）

| 产物                                                               | 摘要                                                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Tau-0.2.3-android-arm64.apk（versionCode 2003）                    | `537ea1bf60e6e4be2f82502368bf996cfde929f070720a65f44447d1d4f95103`（签名证书 `9fb5a0fb…048fe`） |
| Tau-v0.59.2-darwin-arm64.dmg                                       | `3702a75f201d283f675716294113b0c2e134064d4e0aa7d46fc5fc90ab14bdc0`                              |
| Tau-v0.59.2-darwin-x64.dmg                                         | `be6788b3a1e359ab76e7e22137684266ad61ceae54b8fbad5f927b7bd7064830`                              |
| Tau-0.2.3-ios-app-store.ipa（Build 1，29,714,215 字节）            | `79647f558a026c256801d97a3afc2b82dce976cffb7648b65a2cfff06806525a`                              |
| Tau-0.2.3-2-ios-app-store.ipa（Build 2 图标修复，30,245,767 字节） | `12259a86c5a41bf788afdf8c88c923f74605b388339826ab9e5f852104c94b0b`                              |

桌面 0.59.2 双架构公证与完整原生运行时检查通过；当时只交付文件、未上传 APP 更新服务器。

## iOS 签名与 TestFlight

- Apple Distribution：Tao Xiong（团队 DFJV94JC29），签名身份 SHA-1 `9AD7AF73E7A94BE28F6C9840B33FFEC4069D4D8A`，私钥留在钥匙串未导出。
- App Store Connect：Apple ID 6826237467，Bundle ID `com.txiong.tau-mobile`，SKU `com.txiong.tau-mobile`，主要语言简体中文。
- Build 2（构建 ID `e98f6a68-aac5-4004-b722-f4002d0a6e8b`）2026-10-23 上传，加入 Tau 本人内部测试组（1 名测试员），状态「正在测试」；出口合规按 rustls 标准加密回答、法国分发为「否」；未提交 App Store 正式上架。

## 用户验收结论

2026-10-23 用户按桌面与 Android 简短测试清单反馈「测好了，没问题」，记为功能验收通过（桌面四个剩余编辑器交互与重启保真；Android 键盘/浮层、图册本地照片授权、渲染交互、强停恢复、下载取消重试）。未提供设备型号与系统版本，不外推最低系统、全部桌面芯片、iOS、平板、长性能或云同步专项。
