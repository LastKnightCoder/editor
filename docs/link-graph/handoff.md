# 卡片关联图谱重做 · 转接文档

写给接手的新会话。读完这份就能继续，不需要翻旧对话。
所有路径相对 `apps/desktop/`，除非另注。

## 1. 原始需求

卡片视图里的「关联图谱」原先用 `@antv/g6` 实现：API 难用、难定制、样式丑。用户要自研 canvas 实现，重视**美观与交互感**，后续可能有 3D / 叙事视角。用户提的具体想法：

- 类似 Obsidian，按卡片创建时间做**入场播放**
- 按卡片之间的关系**自下而上形成主题簇**，给用户信息
- 节点交互
- 用户**手动触发** AI，结合主题簇给出建议和洞见（先不接 LLM 起主题名）
- 规模：当前约 700 张卡，**要按万级设计**（用户明确说过：不能只考虑现状、批次不能跳）

## 2. 分批计划与进度

| 批次 | 内容                                                                                                                                                             | 状态                                      |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1    | core 层 + Canvas 2D 渲染器，替换 G6                                                                                                                              | ✅                                        |
| 2    | 布局进 Web Worker + 坐标持久化（IndexedDB）+ 视口裁剪                                                                                                            | ✅                                        |
| 3    | 社区发现（自研 Louvain）+ 簇的视觉                                                                                                                               | ✅                                        |
| 3.5  | **离线知识地图**：主进程按「显式链接 + 语义向量近邻」算两层主题与布局，存索引库                                                                                  | ✅（桌面端全链路未经用户实机确认，见 §6） |
| 4    | 按创建时间入场播放：大图上是「主题一块块长出来」，近景才是单卡落位；非线性时间映射；可拖时间条                                                                   | ⏭ 下一步                                  |
| 5    | WebGL（PixiJS）渲染器 + 语义缩放完善 + 边聚合 + minimap，L/XL 档（2000–20000+）                                                                                  | 待做                                      |
| 6    | AI 洞见：用户手动触发，本地组装簇上下文，复用 `chatLLM`，返回带卡片 id 的结构化 JSON，与图联动（点洞见 → 高亮 + 镜头飞过去；建议链接一键采纳）；按簇内容哈希缓存 | 待做                                      |
| —    | 3D / 叙事视角（时间作 Z 轴、自动导览）                                                                                                                           | 远期                                      |

规模分档（批次 1 定的原则，仍适用）：S ≤200 全量精细；M 200–2000 Canvas 全量 + 视口裁剪 + Worker 布局；L 2000–20000 WebGL + 语义缩放聚合；XL >20000 强制聚合。**档位是同一条管线上的开关，不是四套实现。**

## 3. 架构现状

```
src/components/LinkGraph/
  index.tsx              React 壳。props 与旧 G6 版兼容（三个调用点没改），
                         新增 persistKey / knowledgeMap / onClusters
  useGraphEngine.ts      编排：事件 → core → 脏标记 → 单条 raf（静止时停摆）
  core/
    types.ts             GraphNode / GraphScene / GraphPalette 等契约
    graph.ts             cards → GraphScene（链接图谱路径），种子位置、增量继承坐标
    camera.ts            世界↔画布变换、锚点缩放、easeOutCubic 飞行（scale 对数插值）
    hitTest.ts           d3-quadtree 命中，按需重建
    palette.ts           --tau-* token → 画布实色；对比度拟合；topicColor(10 色槽)
    layout.ts            d3-force 前台版；clusterForce 簇内聚/互斥
    layoutTypes.ts / layoutRunner.ts / layout.worker.ts / workerLayout.ts / createLayout.ts
                         Worker 布局（双缓冲 + 背压），≥300 节点走 Worker，失败退前台
    positionStore.ts     链接图谱坐标落盘（IndexedDB，无则内存）
    louvain.ts           自研 Louvain（CSR 邻接，2 万节点 17ms）
    cluster.ts           链接簇的语义层（TF-IDF 标签、桥接、孤立）——离线地图不可用时的退化路径
    mapScene.ts          离线知识地图 → GraphScene（MapScene 带 colorSlots、subtopics）
  renderers/Canvas2DRenderer.ts
                         两种模式：链接图谱 / 地图模式（isMapScene）。地图模式三级语义缩放：
                         <1.3 只有大主题名；≥1.3 子主题名；≥2.4 卡片标题

src/knowledge-map/          主进程 worker 与渲染进程共用的纯计算（无 DOM/Electron/IO）
  types.ts               KnowledgeMap 契约；TOPIC_PALETTE_SIZE = 10
  vectors.ts             分块均值池化 + 暴力 kNN（700×1024 维约 0.4s）
  labels.ts              主题名只从分层 tag 取（首段=大主题，下一段=子主题）
  compute.ts             computeKnowledgeMap（主题划分 → 命名/同名合并 → 封顶 → 拆名不副实 →
                         子主题 → 色槽 → 分层布局）；placeIncrementally（增量落位）

src-electron/main/
  modules/tables/knowledge-map.ts     读输入（cards + vec_documents 原始 Float32 字节）、读写结果
  modules/knowledge-map-builder.ts    IPC `knowledge-map:get`；对账新增/删除；过时后台重算
  workers/knowledge-map.worker.ts     worker_threads 入口（vite.config.mts 已注册 entry）
src/commands/knowledge-map.ts         getKnowledgeMap()
src/features/cards/queries.ts         useKnowledgeMap()
src/features/cards/components/CardGraphSection.tsx   卡片库图谱：优先离线地图，取不到退回链接图谱

packages/db-schema/schema/index/40_knowledge_map.sql  knowledge_map_nodes / knowledge_map_topics
src/showcase/sections/LinkGraphSection.tsx            样板间档案（pnpm --dir apps/desktop showcase，端口 6199）
```

离线地图的重算时机：没算过 / embedding 指纹变了 / 一次新增 >10 张卡 / 增量放置累计 >15%（按行 update_time 算，重启后仍准）/ 显式 `rebuild`。其余打开图谱时直接读库并对账。

## 4. 规范（用户明确要求过的）

- **回复用简体中文。**
- **只用新主题系统**：颜色一律取 `--tau-*` 语义 token（`packages/ui/src/theme/tokenContract.ts`），**禁用旧的 `useThemeColors`**。画布里用 `getComputedStyle` 读 token（`core/palette.ts` 的 `readThemeTokens`），监听 `<html>` 的 `data-theme` / `data-mode`。
- **对比度靠单测兜住**：`__tests__/palette.test.ts` 遍历全部主题族 × 明暗（6×2）。新增颜色必须进这个门禁。标签 ≥4.5:1，图形 ≥3:1。
- **不能只看现状**：设计按万级卡片考虑，批次不能跳。
- 代码风格：注释讲「为什么」，中文注释，密度与现有文件一致。提交信息沿用 `feat(desktop): …` + 中文正文 + `Co-Authored-By` 行。
- 提交/推送只在用户要求时做。

## 5. 踩过的坑（别再踩）

- **token 值格式混用**：主题里有 hex、`rgba()`、`hsl()`、`hsla()`。解析器曾漏掉 hsl，强调色整体退化成兜底灰 `#808080`，浅色下肉眼看不出。已加门禁「消费到的 token 全部解析成功」。
- **`ctx.font` 不认 `var()`**：字体栈要在调色板里解析成字面值（`palette.fontFamily`）。
- **LinkGraph 容器不能自带底色**：曾写 `bg-page`，在 surface 卡里挖了个洞。现在透明，底色用 `resolveBackdrop` 从容器向上取。
- **不要等布局收敛才显示**：700 张卡会干等 1 秒 Loading；收敛过程本身就是入场动画。
- **容器 0 宽时不能 fit**：缩放会被压到下限且修不回来（`useGraphEngine` 的 sync 已跳过）。
- **Worker 协议要带簇信息**：批次 3 初版漏传，大图走 Worker 时簇力等于没有。
- **clusterForce 不能在簇对循环里遍历节点**：O(簇²×节点)，已改为先按簇累加再施加。
- **TF-IDF 要用经典 `log(N/df)`**：平滑版让「每个簇都有的 tag」仍有正分。
- **宿主传内联回调会触发重建**：进 effect 依赖的回调用 `useMemoizedFn` 包一层（`onClusters` 已处理）。
- **悬停只显示被指的那一个标签**：连一度邻居一起显示时，枢纽节点周围糊成一片（用户反馈过）。
- **只按链接分簇在真实数据上失败**：674 张里只有 269 张有链接，结果是外圈几百个孤点 + 一堆两三张的小簇，每簇一个名字一个颜色 → 满屏彩色碎字（用户截图反馈）。这是做离线语义地图的原因。
- **主题名绝不能用卡片正文**：一句话被截断显示在地图上很难看。名字只从 tag 取，取不到宁可不显示。
- **封顶色槽前先按名字合并**：语义孤岛之间在图上不连通，`capTopics` 找不到合并目标时曾把整个主题置为 -1（丢了 1/3 的卡）。现在先同名合并，再封顶，封顶时图上不连通就退到向量质心余弦；都没有就停手，绝不丢卡。
- **d3-timer 的 tick 走 rAF**：测试里同步断言收不到帧，要 `await` 几十毫秒真实时间。
- **测试里派发指针事件要包 `act`**，否则有 act 告警。
- **showcase 的浏览器 pane 会周期性跳回启动根地址 `/#/shell`**（那是 Electron 入口），验证时每次先检查 `location.pathname` 再导航到 `/showcase.html`；viewport 模拟在回合结束会被清掉。
- **主进程完整构建要大堆**：`NODE_OPTIONS='--max-old-space-size=8092' npx vite build`，否则 OOM。
- **读用户真实数据只能只读**：用 `apps/collaboration-server` 目录下的 better-sqlite3（Node ABI；desktop 那份是 Electron ABI），`{ readonly: true }`，加载 `sqlite-vec` 扩展。库在 `~/.editor/data.db`，索引库 `~/.editor/index/data/data.index.db`；卡片向量是 `vec_documents` 里 `type='card'`，1024 维，按分块存多条。

## 6. 学到的事实（真实数据）

- 674 张卡，全部有向量（891 个分块），269 张有显式链接（含正文内联链接）。
- tag 是分层的：342 个一段、499 个两段、91 个三段；只有 8 张卡无 tag。约一半 tag 只有一段（直接打「JavaScript」），给不出子主题名。
- 离线地图在真实数据上：约 1 秒，10 个大主题，0 张未归类。「经济」主题混着概念/随笔/心理学/医学，名字覆盖约 40%，已拆出「学习方法」；剩下的语义上确实连成一片。
- 地图世界坐标约 730×700，最近邻间距中位数 12.6；fit 后缩放约 0.8。渲染器的缩放阈值按此校准。
- sqlite-vec KNN 单次查询约 80ms（增量放置用），所以同步对账限 10 张。
- **未经实机确认**：桌面应用里「打开图谱 → IPC → 主进程 worker → 写库 → 读回」这条全链路没有在 Electron 里跑过（各段分别测过：纯计算、表 IO、打包后的 worker 冒烟）。新会话开始时请用户打开卡片库图谱视图确认。

## 7. 下一步：批次 4（入场播放）

要点（之前与用户对过的方案）：

- 按 `create_time` 排序逐步加入；**大图上播放的是主题的生长**（远景：主题岛从小到大长出来），近景才是单卡落位。
- 地图模式下坐标是离线定好的，播放只是「按时间显现」，不需要跑物理；链接图谱模式下新节点从已出现的邻居附近出现，给小 alpha 加热。
- 节点显现：弹簧曲线从 0 放大；边从源向目标逐渐画出。
- **时间轴非线性**：卡片有高峰和空窗期，按排名或压缩空白期映射，节奏才均匀。
- 底部可拖动的时间条，拖到哪显示当时的图谱。
- 按创建时间还能叠加：每个主题的增长曲线（批次 6 的洞见素材）。
- 渲染器要能接受「每个节点的显现进度 0..1」，别在渲染器里写时间逻辑——时间轴放 `core/timeline.ts`，渲染器只读状态。
- 规模：2 万张时逐卡动画不可行，远景按主题聚合播放。

之后是批次 5（WebGL）与批次 6（AI 洞见），见 §2。

## 8. 验证方式

```bash
# 单测（LinkGraph + 知识地图 + 主进程表）
npx vitest run src/components/LinkGraph src/knowledge-map src-electron/main/modules/tables/__tests__/knowledge-map.test.ts
# 全量（仓库根执行）
pnpm db:schema:prepare && pnpm format && pnpm lint && pnpm check
cd apps/desktop && npx vitest run
# 样板间看效果（浏览器，无 Electron）
pnpm --dir apps/desktop showcase
```

样板间的「知识地图（本机数据）」形态读 `src/showcase/sections/linkGraphMapFixture.json`（真实数据导出，已 gitignore，不在仓库里；没有这个文件时该形态不出现，其余合成形态照常）。
