# 移动端正文字体

状态：字体已上线，待真机验收
目标：移动端正文可选系统默认之外的阅读字体，界面字体保持苹方 / 系统默认不变。

## 需求

- 只改「读的内容」：编辑器正文（`.mobile-card-editor-content` 覆盖的全部场景：卡片列表预览、详情页、速记、日程描述、Markdown 导入预览等）与详情页文档标题；导航栏、按钮、设置项等界面文字不变。
- 首次安装包体积不变；不选新字体的用户零成本。
- iOS / Android 同一套字体、同一观感。
- 设置按设备生效，不跨设备同步（字体文件是本机下载的）。

## 方案

| id              | 字体                      | 上游                                          | 发布体积（WOFF2） | 授权    |
| --------------- | ------------------------- | --------------------------------------------- | ----------------- | ------- |
| `system`        | 系统默认                  | —                                             | —                 | —       |
| `lxgw-wenkai`   | 霞鹜文楷 Screen           | `LXGWWenKaiScreen.ttf` v1.530，26.1MB，常规体 | 10.3MB            | OFL-1.1 |
| `noto-serif-sc` | 思源宋体（Noto Serif SC） | `NotoSerifSC-VF.otf` Serif2.003，22.6MB，可变 | 10.4MB            | OFL-1.1 |

- 按需下载、不打包：两款全量打包约 +49MB，现有安装包约 44MB。
- 全量字库、不裁剪：发布时只做无损 WOFF2 压缩，实测每款约 10MB。
- 发布：`pnpm publish:fonts` 拉固定 tag 的上游字体与许可、核对上游摘要、转 WOFF2、传 R2 `fonts/` 并写清单；操作步骤见 [客户端构建与发布](/docs/guides/ops-client-build-install.md)。
- 客户端：Rust 命令下载 / 校验 / 读取 / 移除，前端读字节注册 FontFace 后切换根上 `--mobile-reading-font`；结构与边界见 [移动端架构 · 正文字体](/docs/architecture/mobile.md)。
- 入口：「我的 → 外观 → 正文字体」BottomSheet；未下载显示「下载 X MB」，下载中显示进度可取消，下载完成自动选中，已下载未选中可移除，线上有新版本显示「更新」。

## 决策

- 字体候选：霞鹜文楷 Screen + 思源宋体两款。
- 字库不裁剪：全量字形，生僻字风格统一。
- 作用范围：编辑器正文 + 详情页文档标题，界面文字不变。
- 文楷粗体：合成效果不影响观感就用合成，影响就多下载粗体文件。判据：加粗句、标题、粗体与常规混排里出现笔画糊、粗细不够分明或混排发虚任一项。备选：上游没有 Screen 版粗体，只有非 Screen 版 `LXGWWenKai-Medium.ttf`（25.8MB），可当粗体接在 Screen 常规体后，或整款换成非 Screen 版 Regular + Medium；清单已支持一款字体多个字重文件，追加只改 `scripts/reading-fonts.mjs`。
- 加载方式：不走 asset 协议 + `@font-face url()`（Android WebView 的 asset 协议加载不稳定，媒体已因此改走二进制 IPC），两端统一读字节注册 FontFace。
- 未下载字体的样张：不发布样张图片，只显示风格说明；下载后样张用字体本身渲染。
- 授权：霞鹜文楷有保留字体名（「霞鹜」「LXGW」等），作者附加许可允许为网页字体分发转 WOFF2 后沿用原名、不作为可安装桌面字体提供，本功能在此范围内；思源宋体无保留字体名。

## 进度

- [x] 调研与方案草案、用户确认
- [x] 发布脚本 + dry-run（产物在 `apps/mobile/release/fonts/`）
- [x] Rust 下载 / 列表 / 读取 / 移除 / 取消命令
- [x] 设置页 + 生效链路 + 测试
- [x] 正式上传 R2：`https://dl.taunote.app/fonts/manifest.json`，公网下载的两款字体大小与 sha256 均与清单一致，`font/woff2` + 长缓存
- [ ] 真机验收：iOS 与 Android 各下载一款、切换生效、移除；文楷合成粗体达标与否
- [ ] 收尾：删除本文件，更新 docs/README

## 验证

- `node --test scripts/reading-fonts.test.mjs`：5 项通过；`pnpm publish:fonts --dry-run` 通过。
- `cargo test --lib`：144 项通过（含新增 5 项）；`cargo fmt --check`、`cargo clippy -D warnings` 通过。
- 移动端 `npx tsc --noEmit` 通过（仅剩未入库 tts 测试目录的既有报错）；`pnpm build` 通过；新增前端测试 12 项通过，全量 873 项中 2 项失败在 `pluginCenter.test.ts`（「客户端版本低于插件要求」，与本功能无关）。
