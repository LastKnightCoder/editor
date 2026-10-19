# @tau/promo-video

Tau 的宣传视频工程（Remotion 4 + React 19 + Tailwind v4：React 写视频，逐帧确定性渲染，发 B 站）。

**接手先读 [`docs/交接-产品宣传片.md`](docs/交接-产品宣传片.md)**：已拍板的决策、配乐节拍与章节排布、软件真实界面规格（写文案和画面的禁区）、踩过的坑、各章做法。本文只是入口。

## 片子

| Composition                          | 内容                                                                                                               | 状态 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---- |
| `Product`                            | 产品介绍片，166 秒：开场 → 写作 → 白板 → 数据库 → 一个想法的一生 → AI → 知识地图 → All in one → 插件 + 本地 → 收尾 | 主线 |
| `Feature-Editor` / `Feature-Compose` | 功能片：所见即所得 + 块（30 秒）、创作模式（20 秒）                                                                | 冻结 |
| `DayInLife`                          | 场景片「一天的知识生活」（90 秒）                                                                                  | 归档 |
| `Gallery-*`                          | 每个重建页面一帧，核对界面用                                                                                       | 调试 |
| `Measure-*`                          | 量点按坐标（光标 TARGET 用），读数写在画面右侧                                                                     | 调试 |
| `Probe-Manifesto-*` / `Stage-*`      | 宣言样式、舞台配色对比                                                                                             | 调试 |

## 常用命令（在本目录下执行）

渲染用本机 Google Chrome（`remotion.config.ts`；自带的 chrome-headless-shell 在 macOS 26 上起不来）。Agent 跑渲染要关掉命令沙箱。

```bash
pnpm studio                                   # Remotion Studio 预览、拖时间轴
pnpm check                                    # 类型检查
pnpm frames 296 328                           # 曲内拍序号 → 产品片帧号
pnpm grid out/frames/xx 7561 7700 7900        # 抽低清静帧拼成 4 列网格自检
npx remotion render src/index.ts Product "out/产品片-段落-XX.mp4" --frames=7561-8520 --scale=0.35 --crf=30   # 只渲染一段
npx remotion render src/index.ts Product "out/产品片.mp4" --codec=h264 --crf=17                              # 1080p60 整片
```

## 目录

```
src/
  brand/     视频品牌层：舞台配色、缓动、字体预载、配乐登记（曲目 + 节拍表）
  kit/       通用镜头与动效：World/Shot 无限画布、During 挂载、宣言、模块标签、光标（clickAt）、打字机、文字取点
  app-kit/   重建的 Tau 界面：AppWindow 壳 + pages/（各页面）+ parts/（停靠栏、地图、对话框、WindowLayer 浮层…）+ whiteboard/ + doc/
             结构与类名照抄 apps/desktop，颜色走 @tau/themes 真实 token（海盐主题）
  mock/      演示数据：deepwork.ts（产品片 Deep Work 故事线）、deepmap.ts（知识地图）、board.ts（白板）
  films/
    product/   产品片：timeline.ts（拍点，at() / beatFrames()）、copy.ts（文案 + PRODUCT_GLYPHS）、scenes/（每章一个文件）
    features/  功能片（冻结）
    gallery/   Gallery（界面核对）、Measure（坐标测量）、各类对比探针
    day/       场景片（归档）
scripts/     beat-frames.mjs、stills-grid.sh、render.mjs、analyze-beats.py / analyze-bars.py（librosa 节拍分析）、export-srt.ts
```

## 做一段新内容

1. 用真实软件源码（`apps/desktop`、`packages/*`）核对界面，缺的页面加进 `app-kit/pages/`，在 `films/gallery/Gallery.tsx` 登记一帧核对。
2. 时刻写成曲内拍序号放进 `timeline.ts`，文案进 `copy.ts`（新字要进 `PRODUCT_GLYPHS`，否则掉字）。
3. 场景读绝对帧号（用 `During` 挂载，不用 `Sequence`）。有点按就上光标：点按坐标用 `Measure-*` 实测，路径用 `clickAt()` 拼。
4. 抽静帧拼网格自检，只渲染这一段的低清样片。

## 配乐与字体

- 配乐：[Motivational Technology](https://pixabay.com/)，作者 Rockot，Pixabay Content License（可商用，无需署名），117.45 BPM，从曲内第 11 小节截入。文件 `public/music/motivational-technology.mp3`，原件在 `assets/`。请保存 Pixabay 的 License Certificate。
- 字体：思源宋体 / 思源黑体（Noto Serif / Sans SC）、JetBrains Mono、白板手绘字体（小赖 SC + Shantell Sans），均为 SIL OFL，经 Fontsource 或 apps/desktop 引用打包。
