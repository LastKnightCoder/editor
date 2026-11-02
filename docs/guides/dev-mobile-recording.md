# 移动端录音与转写验收

## 自动检查

在仓库根目录执行：

```sh
pnpm --dir apps/mobile exec tsc --noEmit
pnpm --dir apps/mobile exec vitest run --config vitest.config.ts src/features/cards/recording/__tests__ src/hooks/__tests__/useLocalContentDocument.test.tsx src/features/cards/quickCapture/__tests__/useQuickCaptureController.test.tsx src/features/cards/__tests__/contentDetailBlockSelection.test.tsx src/features/cards/__tests__/insertPanel.test.tsx src/features/cards/__tests__/mobileEditorMediaToolbar.test.tsx
cargo test --manifest-path apps/mobile/src-tauri/Cargo.toml --locked --lib audio_transcode::tests
cargo clippy --manifest-path apps/mobile/src-tauri/Cargo.toml --locked --all-targets -- -A clippy::all -D warnings
cargo check --manifest-path apps/mobile/src-tauri/Cargo.toml --locked --target aarch64-apple-ios
pnpm --dir apps/mobile exec vite build
pnpm check:docs
```

判据：检查退出码为 0；保存失败用例保留找回旁注，嵌套音频用例将文字稿插在音频之后，`.bin` 音频保持可识别格式。Seed 插件内执行 `pnpm check`、`pnpm test`、`pnpm build`，均须成功。

## 真机录音与找回

1. 分别在 iOS 和 Android 打开本机文档，从插入面板开始录音；继续输入、暂停、恢复并完成，确认原文与光标保留，录音出现在标记位置且可播放。
2. 在音频替换菜单重新录制，确认自定义标题保留；录音不足 1 秒时不插入。
3. 锁屏或切换应用后继续录音，回到应用完成并检查音频时长与声音；Android 检查常驻通知及暂停、继续按钮。
4. 分别触发来电、其他应用占用音频、拔耳机和蓝牙断开，确认显示暂停原因、计时停止，且只在手动继续后恢复录音。
5. 录音中返回文档列表，分别选择继续、放弃、完成；确认守卫行为符合选项，较长录音放弃前再次确认。
6. 录音中终止应用，重新打开原文档，确认找回横幅可插入并播放，或删除；模拟正文保存失败后确认找回入口仍存在，重试不会重复插入同一资源。
7. 在本机文档中重复录音、重新录制和找回，确认正文可保存、重新打开可播放，并经云端同步验证另一设备可读取音频。

## 真实账号转写

1. 在语音设置选择已配置的 Seed 插件；分别使用仅开通标准版、仅开通极速版以及两者均开通的账号验证，确认服务拒绝时显示可操作的错误。
2. 对本地录音和同步后的音频点击「转文字」，确认文字稿位于音频后；对容器内音频重复操作，确认文字稿保留在同一容器。
3. 使用 OSS、S3、GitHub 公开音频地址测试标准版下载；使用服务端无法下载的地址测试极速版回退。取消任务后不得插入半截文字稿。
4. 转写期间继续编辑和移动音频块，确认完成时仍插在音频之后；再次转写生成新的文字稿。
5. 使用较长录音检查准备、上传、识别阶段，关注约 20 MB 请求体经过移动网络桥时的耗时和内存；超出服务限制时须显示错误并保留原音频。

验收通过只表示功能可交付；插件发布与应用发行按各自发布流程执行。
