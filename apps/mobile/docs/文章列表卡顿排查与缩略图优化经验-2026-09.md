# 移动端文章列表卡顿排查与缩略图优化经验

> 2026-09 排查实录：文章列表页打开肉眼可见掉帧。最终定位是「全尺寸封面图走 base64 IPC」，
> 而不是最初怀疑的「列表数据太大」。过程中踩了两个反直觉的坑，记录如下。

## 症状与结论

- 症状：打开文章列表页掉帧，帧采样 avg 帧间隔 52ms(理想 ≤16.7ms),worst 382ms。
- 数据层无罪：列表 payload 瘦身前 MB 级 → 瘦身后 18.2KB，数据到达 13~~94ms,SQL 48~~60ms。
- 真凶：40 篇文章全部有封面，每张 183KB~~3.7MB 的全尺寸 webp 经 ~~~~`read_resource_bytes`~~~~
  base64 IPC 传输（单张 250~~1100ms),40 张并发导致密集 longtask(51~385ms)。

## 观测手段（可复用）

1. `utils/perf.ts`:`logPerf` / `logPerfSize` / `sampleFrames` / longtask 监听，
   DEV 默认开，生产 `localStorage.setItem("tau-perf","1")` 后刷新开启。
2. WebView console 经 logcat 的 tag 是 **`Tauri/Console`**（不是 chromium):
   `adb logcat -v time | grep --line-buffered -E "Tauri/Console.*\[perf\]|RustStdoutStderr.*\[perf\]"`
3. Rust 侧打点用 `#[cfg(debug_assertions)] eprintln!`(tag `RustStdoutStderr`),release 编译期消除。
4. `sampleFrames` 在数据落地后采样 1.5s rAF 帧间隔，是"是否真的掉帧"的量化判据。

## 修复清单

| 修复              | 位置                      | 说明                                                                                                                               |
| ----------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 列表不返回全文    | `database/article.rs`     | `article_list` 只下发元数据 + 后端生成的 `excerpt`(纯文本截 120 字符，复用 `json_content_plain_text`)                              |
| 列表/详情类型拆分 | `article.rs` / `types.ts` | `ArticleListItem` 无 `content`;`ArticleDetail`(`#[serde(flatten)]`)带正文，`article_get` 按需取                                    |
| 缩略图通道        | `resource_upload.rs`      | `read_resource_thumb`:640px/q72 webp，落盘缓存 `<stem>_thumb.webp`；前端 `LocalImage thumbnail` prop 接入，列表小图/特写卡走缩略图 |
| 启动后台预热      | `lib.rs` setup            | 延迟 5s、串行补齐缺失缩略图，让位首屏                                                                                              |
| 媒体读取限流      | `localMedia.ts`           | 并发上限 3，帧率优先、图片渐次到位                                                                                                 |
| 缩略图新鲜度      | `resource_upload.rs`      | 原图 mtime 新于缩略图时重建（云同步同名覆盖的场景）                                                                                |
| 缩略图不同步      | `sync/resource_core.rs`   | `*_thumb.webp` 是本地派生缓存，扫描时跳过                                                                                          |

## 踩坑记录（重点）

**坑 1****:Tauri**** 同步命令跑在主线程上。**
非 async 的 `#[tauri::command]` 会调度到主线程执行。缩略图生成（解码+缩放+编码）放在同步命令里，
直接堵死 IPC 事件循环——连无关的 `article_list` IPC 都从 48ms 恶化到 328ms。
**教训：任何可能超过几毫秒 IO/CPU 的命令都要 ****`async`**** + ****`spawn_blocking`****。**

**坑 2：重计算的首次触发不能放在用户关键路径上。**
缩略图首次生成需解码全尺寸原图，单张最长 10.5s(移动端 CPU);40 张现场生成直接饱和 CPU,
JS 主线程被饿死，出现 5.6s 的 longtask，比优化前更卡。
**教训：缓存类优化必须配"空闲预热"或"写入时预生成"，按需生成只能当兜底。**

**坑 3****:CPU**** 饱和会污染所有指标的归因。**
生成风暴期间连轻量 IPC 都变慢，若只看单条耗时容易误判。定位时先看帧采样/longtask 判断
"是否整机资源耗尽"，再看单点耗时。

**坑 4：初始假设（列表数据大）只对了一半。**
全文瘦身确实必要（MB→18KB)，但修完用户仍感卡顿——数据优化不等于体验优化，
渲染侧的媒体负载才是肉眼可见的那部分。先埋点、再动手，别凭假设连改。

## 遗留事项

- 部分远程封面 `localize remote resource failed` 后回退原始 URL，图床长期不可达时每次进列表
  会白打超时请求，可考虑失败记忆。
- 换封面后旧图与旧缩略图成为孤儿文件，待资源引用计数清理统一处理。
