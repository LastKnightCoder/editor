# 去除 Python Server：Node 本地推理替代方案调研

> 调研日期：2026-09-09
> 结论先行：**7 项 Python 职责中，4 项可完全替代（embedding / rerank / 查询扩展 / 模型管理），2 项可部分替代（转录 / 文档转换），1 项本就不该在 Python 侧（LLM 转录优化，纯 HTTP 调用）。推荐以 node-llama-cpp 为核心做进程内替代，预计可删除 404MB 的 python-server.exe 运行时与整套 PyInstaller/OSS 分发链路。**

---

## 1. 现状：Python Server 到底在做什么

### 1.1 进程架构

```
┌────────────────────────────────────────────────┐
│ Electron 主进程                                 │
│  └─ ServerModule (Express + ws, :24678)        │
│       │ WebSocket /python-server?isServer=true │
│       ▼                                        │
│  python-server.exe (PyInstaller onefile, 404MB)│
│  ┌──────────────────────────────────────────┐  │
│  │ main.py: RPC 路由 → 7 个 handler         │  │
│  │ torch + transformers + FlagEmbedding     │  │
│  │ faster-whisper(CTranslate2) + markitdown │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

- 开发环境：`uv run python main.py --port 24678`（`python-service.ts:108-124`）
- 生产环境：`PythonRuntimeManager` 从 OSS（`python-services-latest.json`）按平台下载 PyInstaller 单文件二进制到 `userData/runtime/python-server/`，版本化 + 重启生效（`python-runtime-manager.ts`），**仅支持 win32 / darwin**
- CLI（`apps/cli`）另以 `--standalone` 模式拉起同一二进制做 embedding（`apps/cli/src/data-access/python-embedding.ts`）

### 1.2 职责清单（Python 侧）

代码位于 `apps/desktop/src-python/`，共约 2000 行 Python + 打包配置：

| #   | Handler / Runtime                                                                                          | RPC 方法                                                                                                                 | 底层依赖                                         | 模型                                                             |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------- |
| 1   | `embedding_handler.py` + `embedding_runtime.py`                                                            | `embed_texts`、`embedding_health`                                                                                        | FlagEmbedding `BGEM3FlagModel`（torch）          | BGE-M3（1024 维，torch 版 ~2.2GB）                               |
| 2   | `rerank_handler.py` + `rerank_runtime.py`                                                                  | `rerank_texts`                                                                                                           | FlagEmbedding `FlagReranker`（torch）            | bge-reranker-v2-m3（568M）                                       |
| 3   | `query_expansion_handler.py` + `query_expansion_runtime.py`                                                | `expand_query`                                                                                                           | transformers `AutoModelForCausalLM`（torch）     | Qwen3-0.6B / Qwen2.5-0.5B-Instruct                               |
| 4   | `transcription_handler.py` + `transcribe.py`                                                               | `transcribe`                                                                                                             | faster-whisper（CTranslate2）                    | faster-whisper-tiny ~ large-v3                                   |
| 5   | `markitdown_handler.py` + `markitdown_converter.py`                                                        | `convert_file`                                                                                                           | 微软 markitdown[all]                             | 无（PDF/PPTX/DOCX/XLSX/图片 OCR/音频/HTML/CSV/ZIP/EPUB/YouTube） |
| 6   | `transcription_optimizer.py`                                                                               | `optimize_transcription`                                                                                                 | **OpenAI 兼容 HTTP API**（非本地推理）           | 云端 LLM                                                         |
| 7   | `model_handler.py` + `embedding_handler.py` 下载部分 + `download_model.py` / `download_embedding_model.py` | `download_model`、`download_embedding_model`、`download_search_model`、`list/check/delete/get_downloaded_*` 等 14 个方法 | modelscope / huggingface_hub `snapshot_download` | —                                                                |

### 1.3 Electron 侧消费方（改动面）

`grep pythonService` 共 10 个文件 + 模块注册：

| 文件                                                                                                      | 用途                                                     | 调用的 RPC                               |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| `modules/tables/vec-document.ts`                                                                          | 向量索引（存储用 **sqlite-vec**，推理走 Python）         | `embed_texts`                            |
| `modules/search-core/reranker.ts`                                                                         | 本地重排                                                 | `rerank_texts`                           |
| `modules/search-core/expander.ts`                                                                         | 查询扩展                                                 | `expand_query`                           |
| `modules/transcription.ts`                                                                                | 音频转录（**已有预编译 exe 优先、Python 后备**的双路径） | `transcribe`                             |
| `modules/markitdown.ts`                                                                                   | 文件转 Markdown、转录优化                                | `convert_file`、`optimize_transcription` |
| `modules/model-downloader.ts`                                                                             | whisper 模型与预编译 exe 下载                            | `download_model` 等                      |
| `modules/embedding-model-manager.ts`                                                                      | embedding / 搜索模型管理                                 | `download_embedding_model` 等            |
| `modules/pdf-index-queue.ts`、`modules/video-note-index-queue.ts`、`modules/vibe-learning-index-queue.ts` | 三个后台索引队列，各自直接调                             | `embed_texts`                            |
| `module-init/module-config.ts`                                                                            | 模块注册                                                 | —                                        |

前端相关：`src/commands/python-runtime.ts`、`src/pages/Settings/EmbeddingProviderSetting/`、`src/pages/Settings/TranscriptionSetting/`、`src/hooks/useSearchWarmUp.ts`。

### 1.4 “重”在哪里（成本盘点）

| 维度       | 现状                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 运行时体积 | PyInstaller onefile **404MB**（含 torch/transformers/faster-whisper/markitdown 全家桶），用户首次使用需从 OSS 下载                               |
| 内存       | torch 运行时常驻 ~300MB+，叠加模型加载；与 Electron 是两个独立进程                                                                               |
| 调用链     | 每次推理：Electron → ws JSON 序列化 → Python → ws 返回（embed_texts 传输 float[][] 双重序列化）                                                  |
| 构建维护   | uv.lock + PyInstaller spec + 三平台产物 + OSS latest.json 版本分发 + 运行时升级/降级/pending-meta 逻辑（`python-runtime-manager.ts` 约 1000 行） |
| 平台       | 仅 win32/darwin，Linux 无                                                                                                                        |
| 生态风险   | FlagEmbedding 与 transformers 5.x 不兼容（`embedding_runtime.py:69-104` 已有运行时版本校验兜底），依赖锁版本脆弱                                 |

---

## 2. 候选替代技术

### 2.1 node-llama-cpp（主推）

- llama.cpp 的 Node.js 绑定，**当前 v3.20.0（2026-08-11 发布），活跃维护**，npm 周下载量大
- 与本需求直接相关的能力：
  - **Embedding**：`getLlama()` → `loadModel()` → `model.createEmbeddingContext()` → `context.getEmbeddingFor(text).vector`
  - **Reranking**：`model.createRankingContext()` → `context.rankAll(query, docs)` 返回**与输入顺序一一对应的 0-1 分数数组**（与现有 `rerank_texts` 返回结构完全对齐），`rankAndSort()` 可直接排序；官方文档示例模型就是 bge-reranker-v2-m3
  - **文本生成**：跑 Qwen3-0.6B-GGUF 做查询扩展；支持 **GBNF / JSON Schema 约束输出**（`chatWrapper` 层面强制 JSON 合法，比现在 Python 端"生成后正则抽取 + fallback"更可靠）
  - **GPU**：Metal（mac）/ CUDA（Win+Linux，预编译包 `@node-llama-cpp/win-x64-cuda`）/ Vulkan（全平台通用，覆盖 AMD/Intel/NVIDIA），`npx node-llama-cpp inspect gpu` 可检测
  - **预编译二进制**：macOS/Linux/Windows 全平台，npm 安装即用，无需用户装编译器；Electron 有官方支持（只能用于**主进程**，需 asarUnpack、不可被 Vite/Webpack 打包，官方提供 electron-builder 参考配置与 `electron-typescript-react` 脚手架）
- 注意：不能交叉打包 arm64→x64 的 mac 包（CI 需按平台矩阵构建，见 §6）

### 2.2 transformers.js（ONNX，备选 embedding 方案）

- `@huggingface/transformers` Node 端用 onnxruntime-node；BGE-M3 有现成 ONNX 版（`Xenova/bge-m3`、`onnx-community/bge-m3-ONNX`，后者还支持 sparse 输出）
- 优点：权重同为原版转换，向量一致性最接近 torch 原版
- 缺点：**不适合跑生成模型**（Qwen3 0.6B ONNX CPU 生成速度远慢于 llama.cpp）；reranker（XLM-R 回归头）需要自己封装打分逻辑；onnxruntime 的 GPU 配置在 Electron 打包里更繁琐
- 结论：仅当 llama.cpp 的 bge-m3 embedding 质量验证不达标时作为 Plan B，不作为主路线

### 2.3 whisper 的 Node 绑定（转录备选）

- `smart-whisper`（whisper.cpp 绑定）：词级时间戳支持不明确、Windows GPU 需自带编译库（BYOL），生态成熟度一般
- **本项目已有更好的路径**：`transcription.ts` 本来就优先使用预编译的 faster-whisper 独立 exe（`faster-whisper-xxl.exe` GPU 版 / `faster-whisper.exe` CPU 版，由 `model-downloader.ts` 从 ModelScope 下载管理），Python WebSocket 只是后备
- 结论：不需要 Node 绑定，见 §3.4

### 2.4 文档转换（MarkItDown 替代）

- `officeparser`：一个库覆盖 docx/pptx/xlsx/pdf/odt/odp/ods/rtf/csv/md/html（纯 JS，最接近 markitdown 的覆盖面）
- `mammoth`（DOCX→HTML/MD，质量最佳）、`unpdf`/pdf.js（PDF 文本层）、`tesseract.js`（OCR，含中文）、`turndown`（HTML→MD）
- 仓库内已有 `packages/foliate-js`（EPUB 渲染）可复用做 EPUB 文本提取
- 无成熟对等：YouTube 链接转写（需 ytpl/youtube-transcript 单独做）、图片 LLM 描述（本来就走 OpenAI 兼容 API，可在 Node 端直接做，项目已有 `openai` npm 依赖）

### 2.5 模型下载

- HuggingFace：官方 `@huggingface/hub` 提供 `snapshotDownload`（带进度），完整对齐 Python 的 `huggingface_hub.snapshot_download`
- ModelScope：无官方 JS SDK，但有开放的 raw 文件 HTTP 接口 `https://modelscope.cn/api/v1/models/{model_id}/repo?Revision=master&FilePath={path}`（支持断点续传），现有 `python-runtime-manager.ts` 的分块下载/进度逻辑可直接复用改造

---

## 3. 逐模块可替代性评估

| #   | 职责                         | 可替代性                          | 推荐方案                                                                            |
| --- | ---------------------------- | --------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | Embedding（BGE-M3）          | ✅ **完全替代**                   | node-llama-cpp + `ggml-org/bge-m3-Q8_0-GGUF`（635MB，8192 ctx）                     |
| 2   | Rerank（bge-reranker-v2-m3） | ✅ **完全替代**                   | node-llama-cpp ranking context + `gpustack/bge-reranker-v2-m3-GGUF`                 |
| 3   | 查询扩展（Qwen3-0.6B）       | ✅ **完全替代（体验更好）**       | node-llama-cpp chat + `Qwen/Qwen3-0.6B-GGUF`（官方）+ JSON Schema 约束              |
| 4   | 转录（faster-whisper）       | ⚠️ **部分替代**                   | 保留现有预编译 exe 主路径；删除 Python 后备；可选 smart-whisper 作为后续增强        |
| 5   | 文档转换（markitdown）       | ⚠️ **部分替代**                   | officeparser + unpdf + tesseract.js 组合；Office/PDF 主路径可平替，OCR/YouTube 降级 |
| 6   | 转录优化（LLM 整理）         | ✅ **完全替代（本就无本地推理）** | Node 端直接用 `openai` 包调 OpenAI 兼容 API                                         |
| 7   | 模型下载/管理（14 个 RPC）   | ✅ **完全替代**                   | `@huggingface/hub` + ModelScope raw HTTP + 纯 fs 操作                               |
| 8   | WebSocket RPC 框架本身       | ✅ **架构性消除**                 | 进程内直调，模块 API 不变                                                           |

### 3.1 Embedding —— 完全替代

- llama.cpp 官方（ggml-org）发布了 `bge-m3-Q8_0-GGUF`（635MB，对比 torch 版 2.2GB，**省 1.5GB+ 磁盘**）；ModelScope 有 `gpustack/bge-m3-GGUF` 镜像满足国内源需求
- 8192 token 上下文与原版一致；1024 维不变，**sqlite-vec 侧（`vec-document.ts`）的表结构与检索逻辑零改动**
- `getEmbeddingFor` 返回向量，批量场景按 batch 循环即可（llama.cpp 底层有自己的批处理）
- 迁移注意：Q8_0 量化向量与 torch fp32 存在微小数值差异。**必须重建全量索引，不可与新旧向量混检**。好消息是现有 `EmbeddingFingerprint` 机制（`utils/embedding-config.ts`）+ `embedding-index-orchestrator.ts` 已支持指纹变化触发重建，只需在指纹 payload 中加入运行时标识（如 `runtime: "llama"`）即可自动、安全地完成迁移
- 性能预期：llama.cpp CPU int8 推理显著快于 torch CPU fp32（无需加载 torch 运行时），首 token 延迟与内存占用都更低

### 3.2 Rerank —— 完全替代

- `createRankingContext().rankAll(query, texts)` 返回与输入顺序一致的分数数组，**与现有 `rerank_texts` 的 Python 返回（`FlagReranker.compute_score(normalize=True)`）语义一致**，`LocalReranker`（`search-core/reranker.ts`）几乎只需换实现
- 分数绝对值与 sigmoid 归一化后可能有微小差异，但 `pipeline.ts:408` 消费前会做 `normalizeRerankScores` 再参与 RRF/blend 融合，**不依赖绝对阈值**，排序一致性即可保证质量
- 已知风险：2026 年 llama.cpp 有两个 bge-m3 相关 CUDA issue（#13494、#17796）。对策：默认走 Vulkan/CPU 路径，CUDA 作为可选增强并在发布前针对目标 GPU 环境回归；锁定 node-llama-cpp 版本

### 3.3 查询扩展 —— 完全替代，且更可靠

- 官方 `Qwen/Qwen3-0.6B-GGUF`（Apache-2.0，Q4 量化 ~400-500MB）直接可用
- 现有 Python 实现的痛点——生成 JSON 后正则抽取、失败后走规则 fallback（`query_expansion_runtime.py:104-205`）——在 node-llama-cpp 里可以用 **JSON Schema 约束生成**直接消灭，结构化输出合法性由解码层保证
- Qwen3 非思考模式：GGUF 的 chat template 支持 `enable_thinking=false` 等价配置（jinja 模板随 GGUF 携带），现有 `<think>` 剥离逻辑（`query_expansion_runtime.py:214-222`）可保留为兜底
- 兜底降级链（模型缺失 → `available:false` → 上层自动降级）在 `LocalQueryExpander` 已有，保持不变

### 3.4 转录 —— 部分替代（建议主动收窄）

- **现状已是双路径**：`transcription.ts:684-713` 优先用预编译 exe（独立于 python-server，由 `model-downloader.ts` 管理下载），Python 只是后备
- 删除 Python 后备后：
  - 已下载 exe 的用户：零影响
  - 未下载 exe 的用户：从"静默降级到 Python"变为"引导一键下载 exe"（`model-downloader.ts` 已具备该能力，只需补 UI 引导文案）
- 不推荐引入 smart-whisper 补位：词级时间戳支持不明确、Windows GPU 需自编译，收益不抵维护成本
- faster-whisper exe 与 whisper.cpp 质量同源（同为 OpenAI whisper 权重的量化转换），本项目词级时间戳/VAD 需求由 exe 路径的参数覆盖

### 3.5 文档转换（MarkItDown）—— 部分替代，主路径可平替

按当前 `markitdown[all]` 的格式面逐一评估：

| 格式                   | Node 方案                        | 平替程度                                                                                            |
| ---------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------- |
| DOCX                   | mammoth / officeparser           | ✅ 等价或更好                                                                                       |
| XLSX                   | officeparser / xlsx              | ✅ 等价                                                                                             |
| PPTX                   | officeparser                     | ✅ 基本等价                                                                                         |
| PDF（文本层）          | unpdf（pdf.js）                  | ✅ 等价（markitdown 同样只取文本层）                                                                |
| PDF（扫描版）/图片 OCR | tesseract.js（chi_sim 可用）     | ⚠️ 弱于（markitdown 底层 OCR 也一般，且可配置 LLM 描述——该部分本就是 OpenAI API 调用，可移到 Node） |
| HTML/CSV/JSON/XML      | 纯 JS 解析 + turndown            | ✅ 等价                                                                                             |
| EPUB                   | 复用 `packages/foliate-js`       | ✅ 等价                                                                                             |
| 音频（元数据+转录）    | 元数据 Node 库 + 转录走 exe 路径 | ✅ 可组合                                                                                           |
| ZIP 解包               | Node 原生                        | ✅ 等价                                                                                             |
| YouTube URL            | youtube-transcript 类库          | ⚠️ 需单独实现，或明确放弃该入口                                                                     |

结论：知识库导入的主路径（Office 全家 + PDF + 网页/结构化文本）可完全 Node 化；扫描件 OCR 质量下降、YouTube 链接建议先下线或后置。**此项是整个迁移中唯一有功能取舍的部分，需要产品决策。**

### 3.6 转录优化 —— 完全替代（本就是 HTTP 调用）

`transcription_optimizer.py` 只是用 `openai` Python 包调 OpenAI 兼容 API（`create_llm_client`），项目 Node 侧已有 `openai` 依赖（`vec-document.ts:6` 在用）。直接在 `markitdown.ts` 内实现即可，连模型都不需要。

### 3.7 模型下载/管理 —— 完全替代

- 14 个 RPC 中：`list_*`/`check_*`/`delete_*`/`get_downloaded_*` 都是纯 fs/目录检查逻辑（`download_embedding_model.py:430-519`），直接翻译成 TS
- `download_*`：HF 源用 `@huggingface/hub` 的 `snapshotDownload`（带 throttle 进度回调）；ModelScope 源用 raw file API + 现成的分块下载进度逻辑（`python-runtime-manager.ts` 的 `downloadBinary` 可迁移复用）
- 下载的模型清单从 GGUF 仓库读（bge-m3 / bge-reranker / Qwen3 均有官方或 gpustack GGUF，HF + ModelScope 双源齐全）

---

## 4. 推荐目标架构

```
┌─────────────────────────────────────────────────┐
│ Electron 主进程                                  │
│  ├─ local-inference 模块（新增，node-llama-cpp） │
│  │   ├─ EmbeddingRuntime  (bge-m3 GGUF)         │
│  │   ├─ RerankRuntime     (bge-reranker GGUF)   │
│  │   └─ ExpansionRuntime  (Qwen3-0.6B GGUF)     │
│  ├─ markitdown.ts → markitdown-node.ts（重写）   │
│  ├─ model-downloader / embedding-model-manager   │
│  │    （改为 @huggingface/hub + ModelScope HTTP）│
│  └─ transcription.ts（仅保留预编译 exe 路径）     │
└─────────────────────────────────────────────────┘
（python-server.exe、WebSocket RPC、PyInstaller、OSS runtime 分发 → 全部删除）
```

关键设计原则：

1. **保持 Electron 模块对外 API 不变**：`vec-document.ts`、`search-core/*`、三个索引队列的调用签名不动，只把 `pythonService.ensureStarted() + client.request(...)` 替换为 `localInference.embedTexts(...)` 等进程内调用。10 个消费方的改动都是“换底层实现”级别
2. **新增统一的 `local-inference` 单例模块**（模仿现有 Module 模式）：
   - 懒加载 + 单例缓存模型（对齐 `embedding_runtime.py` 的行为）
   - `devicePolicy: auto/cpu/gpu` 映射到 node-llama-cpp 的 gpuLayers 配置（auto → 自动检测；cpu → gpuLayers 0）
   - 模型加载/推理异常 → 返回 `available:false`，复用现有降级链（NoopReranker / fallback expansions）
3. **模型目录约定**：沿用 `userData/embedding-models/`，但模型形态从 HF repo 目录变为单个 `.gguf` 文件（目录内放 `bge-m3-q8_0.gguf` 等）；旧 torch 目录不迁移、检测到即提示可删除
4. **索引迁移**：在 `EmbeddingFingerprint` payload 中加入 `runtime: "llama"` 字段 → 首次启动自动触发三库（main/vibe-learning/video-note）全量重建，UI 已有重建进度逻辑
5. **是否需要子进程隔离**：node-llama-cpp 推理在 native 线程执行，JS 侧为异步接口，不会冻结主进程事件循环，官方脚手架即主进程直用。若后续实测长文本嵌入期间 IPC 有卡顿，再评估迁到 `utilityProcess`（接口已按单例封装，迁移成本可控）

---

## 5. 改动范围清单

### 5.1 新增

| 项                                                                                                                                              | 说明                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/desktop/src-electron/main/modules/local-inference/index.ts`                                                                               | 单例模块：llama 实例、模型懒加载、健康检查                                                      |
| `.../local-inference/embedding.ts`、`rerank.ts`、`expansion.ts`                                                                                 | 三个 runtime（对齐现有 Python runtime 行为，含 JSON Schema 约束的查询扩展）                     |
| `.../local-inference/model-registry.ts`                                                                                                         | GGUF 模型清单（bge-m3 / bge-reranker-v2-m3 / qwen3-0.6b，HF+ModelScope 双源、体积、维度元数据） |
| `.../modules/markitdown-node.ts`（或重写 `markitdown.ts`）                                                                                      | officeparser + unpdf + tesseract.js + foliate-js 组合转换器                                     |
| 依赖：`node-llama-cpp`、`@node-llama-cpp/win-x64-vulkan` 等（按平台 optionalDeps）、`@huggingface/hub`、`officeparser`、`unpdf`、`tesseract.js` |
| `apps/cli` 的 embedding 直连改造                                                                                                                | 删除 spawn python-server 逻辑，改为 import 共享 inference 代码或直接依赖 node-llama-cpp         |

### 5.2 修改（Electron 消费方，均为“换实现不改签名”）

- `tables/vec-document.ts`（`createEmbeddings` 的 local_python 分支）
- `search-core/reranker.ts`、`search-core/expander.ts`（HTTP→进程内调用）
- `pdf-index-queue.ts`、`video-note-index-queue.ts`、`vibe-learning-index-queue.ts`（各 1 处 `embed_texts` 调用）
- `transcription.ts`（删除 Python 后备分支，未装 exe 时返回引导性错误）
- `markitdown.ts`（`convert_file`/`optimize_transcription` 改本地实现）
- `model-downloader.ts`、`embedding-model-manager.ts`（下载源改 JS 实现，模型清单换 GGUF）
- `utils/embedding-config.ts`（fingerprint 加 runtime 字段）
- `module-init/module-config.ts`（模块注册调整）
- 前端：`Settings/EmbeddingProviderSetting`（模型体积/来源文案）、`Settings/TranscriptionSetting`（exe 引导）、`commands/python-runtime.ts` 删除
- 打包：`electron-builder.yml` 增加 node-llama-cpp 的 `asarUnpack` 与原生依赖处理（参考官方 electron 模板的 `electron-builder.ts`）；`scripts/verify-native-runtime.mjs` 纳入新原生模块

### 5.3 删除

- `apps/desktop/src-python/` 整目录（含 uv.lock、PyInstaller spec、build/dist 产物）
- `python-service.ts`、`python-runtime-manager.ts`（~1000 行 OSS 分发逻辑）、`utils/PythonWebSocketClient.ts`、`utils/python-runtime-error-message.ts`
- `server.ts` 中 `/python-server` WS 路由的多 server 支撑逻辑可简化（其余 WS 用途保留）
- OSS 上的 `python-services-latest.json` 与三平台二进制（下个版本可清）
- CI 中 Python 打包/发布流水线；`scripts/publish-desktop.mjs` 相关步骤

### 5.4 量化收益

| 维度               | 迁移前                                    | 迁移后                                                        |
| ------------------ | ----------------------------------------- | ------------------------------------------------------------- |
| 运行时下载         | python-server.exe 404MB（OSS）            | node-llama-cpp 二进制随安装包（各平台约 +20-50MB，Vulkan 版） |
| 常驻内存           | torch 进程 ~300MB+                        | 无独立进程，llama.cpp 按需加载                                |
| embedding 模型磁盘 | ~2.2GB（torch）                           | ~635MB（GGUF Q8_0），维度不变                                 |
| 推理链路           | WS 序列化跨进程                           | 进程内直调                                                    |
| 平台               | win32/darwin                              | win32/darwin + **linux 可选**                                 |
| 代码面             | ~2000 行 Python + ~1500 行 Python 管理 TS | 全 TypeScript 单栈                                            |

---

## 6. 分阶段实施建议

- **P0（验证，约 1-2 天）**：起最小 spike——node-llama-cpp 加载 bge-m3/bge-reranker/Qwen3 GGUF，跑通 embed、rankAll、JSON 约束生成三件事；用现有测试语料对比新旧 embedding 检索质量（Recall@k）与 rerank 排序一致性。**此阶段决定 go/no-go**
- **P1（核心迁移）**：`local-inference` 模块 + `vec-document`/`search-core`/三个索引队列切换 + fingerprint 强制重建验证 + 模型下载 JS 化
- **P2（收尾）**：markitdown Node 化、转录 exe 引导、CLI 切换、删除 src-python 与分发链路、CI 调整
- 发布策略：一个大版本内完成；发布说明中明示“首次启动将重建本地索引”与转录 exe 的下载引导

## 7. 风险与对策

| 风险                                                 | 等级         | 对策                                                                                                          |
| ---------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| llama.cpp CUDA 路径 bge-m3 相关 bug（#13494/#17796） | 中           | 默认 Vulkan/CPU；CUDA 可选并充分回归；锁版本                                                                  |
| GGUF 量化向量与旧索引不一致                          | 高（若漏掉） | fingerprint 加 runtime 字段强制重建（机制已存在，改动极小）                                                   |
| 首次升级全量重嵌入耗时（大量文档用户）               | 中           | 保留旧索引只读兜底 + 后台队列重建（现有 orchestrator 已支持），必要时灰度                                     |
| markitdown 转换质量回退（OCR/YouTube）               | 中           | 主路径先迁；OCR/YouTube 明确降级或下线，产品确认                                                              |
| 转录后备消失                                         | 低           | exe 一键下载引导（能力已具备）                                                                                |
| node-llama-cpp 交叉编译限制（mac arm64 不能打 x64）  | 低           | CI 按平台矩阵构建（现有发布流程本就分平台）                                                                   |
| Electron 原生模块打包/ABI 问题                       | 低           | 官方有 Electron 预编译与 asarUnpack 方案；项目已有 better-sqlite3 原生模块经验与 `verify-native-runtime` 脚本 |

## 8. 决策点（需要你拍板的三件事）

1. **是否接受“转录只保留预编译 exe 路径”**（推荐接受，影响最小）；还是要求引入 whisper.cpp Node 绑定做进程内转录（成本高收益低）
2. **markitdown 的 OCR 与 YouTube 入口**：随迁移下线/降级（推荐），还是保留 Python 侧小块不删（不推荐，则 Python 无法彻底移除）
3. **Windows GPU 策略**：默认 Vulkan（通用、零配置，推荐）+ 高级设置里允许 CUDA；或直接跟随 node-llama-cpp 自动检测

---

## 9. 决策确认与 P0 验证结果（2026-09-09 补充）

### 9.1 已确认的决策

| 决策点        | 结论                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 转录路径      | 保留 faster-whisper（Windows 现有预编译下载机制不变）；**Mac 随包分发自建 whisper-cli（~12MB，extraResources），零运行时下载**（已确认，见 9.2） |
| OCR / YouTube | 下线 YouTube 入口；OCR 用 tesseract.js                                                                                                           |
| Windows GPU   | 跟随 node-llama-cpp 自动检测（本机实测 GPU 生效）                                                                                                |
| 发布节奏      | 一个版本完成迁移，fingerprint 触发全量重建                                                                                                       |

默认采用（无需再确认）：旧 torch 模型目录（~2.2GB）迁移后提示可释放、用户确认后删除；量化档位 bge-m3 Q8_0 / reranker Q8_0 / Qwen3 Q8_0，不做多档选择；下载源保留 HF/ModelScope 双选；CLI 在 P2 一并迁移。

### 9.2 Mac 转录方案（对"Mac 怎么办"的回答）

现状：预编译程序路径（`faster-whisper-xxl.exe` / `faster-whisper.exe`）只有 Windows 二进制，**Mac 目前转录实际走的就是 Python WebSocket 路径**，删除 Python 前必须补位。

方案：**whisper.cpp 自建 macOS 构建 + 自有镜像分发**。

> ⚠️ 修正（2026-09-09 核实）：whisper.cpp 官方 GitHub release **不提供 macOS 预编译 CLI 包**——核查了 b4938 / v1.9.3 / v1.9.0 / v1.8.5 的资产清单，只有 `whisper-bin-ubuntu-*.tar.gz`、`whisper-bin-Win32/x64.zip`、cuBLAS 变体和一个 Xcode 用的 `xcframework.zip`（框架，非 CLI）。ModelScope 全站搜索也**没有**官方 mac 二进制的第三方镜像（搜到的仓库全是 ggml 模型权重，如 `iceCream2025/whisper.cpp`；项目在用的 `bkfengg/whisper-cpp` 也只有 Windows 产物）。Homebrew `whisper-cpp` 有 Apple Silicon bottle，但 bottle 托管在 ghcr.io（GitHub 域名，国内同样慢）且要求用户装 Homebrew，不适合应用内分发。

因此 Mac 侧需要**自己构建一次**（GitHub Actions macos runner：`cmake && make whisper-cli`，Apple Silicon 默认开 Metal；`CMAKE_OSX_ARCHITECTURES="arm64;x86_64"` 可出通用二进制）。参考官方 ubuntu arm64 包实测仅 ~12MB，**已确认采用：直接随 app 打包（electron-builder `extraResources`），零运行时下载**（该机制项目已在用——`dict.txt`、CLI 启动脚本均走 extraResources，新增条目为纯配置）。若未来对包体积敏感，再退回"上传自有 OSS/ModelScope + `PROGRAM_CONFIG` 运行时下载"模式（新增 `platforms: ["darwin"]` 条目 + tar.gz 解压分支 + chmod 755）。

**为什么不用 whisper.cpp 的原生 Node 绑定（smart-whisper 等）做"纯 Node 进程内转录"**：

1. node-llama-cpp 无法胜任——llama.cpp 只支持 LLM/embedding/rerank 架构，跑不了 whisper 的 encoder-decoder
2. 该类绑定只接受 16kHz Float32 PCM 输入，mp3/m4a 音频解码需在 Node 侧自行解决（依赖 ffmpeg 或格式支持有限的纯 JS 解码器）；而 whisper.cpp CLI 内置 miniaudio，直接解码 wav/mp3/flac/ogg
3. 词级时间戳的 API 暴露情况待验证（转录优化链路强依赖 wordSegments）；CLI 的 `--dtw` 明确支持 token 级时间戳
4. 个人维护的原生模块存在停更风险（停更 = 自己接手 native 代码）

模型权重同源（OpenAI whisper 的 ggml 转换），质量与 faster-whisper 等价。若未来需要流式/麦克风实时转录，再评估原生绑定（`transcription.ts` 已有多后端结构，替换成本低）。

### 9.3 P0 冒烟测试结果（本机 Windows，GPU 后端）

环境：node-llama-cpp **v3.20.0**（npmmirror 安装，预编译二进制直接可用），模型经 ModelScope raw API 下载：

| 测试      | 模型                             | 结果                                                                                                                               |
| --------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Embedding | bge-m3 Q8_0（635MB）             | ✅ 维度 1024；语义排序正确：中文近义对 cos=0.786 > 中英无关对 0.450；检索相关 0.754 > 无关 0.398；6 条短文本 ~300ms                |
| Rerank    | bge-reranker-v2-m3 Q8_0（607MB） | ✅ 4 文档打分 [0.80, 0.00, 0.93, 0.00]，相关/无关完全区分，sigmoid 归一化行为与 Python `FlagReranker(normalize=True)` 一致；~230ms |
| 查询扩展  | Qwen3-0.6B Q8_0（610MB）         | ✅ JSON Schema 约束输出合法 JSON（3 条 expansions，type 枚举正确）；~600ms                                                         |

**结论：三项核心推理在 Node 侧全部可用，架构可行性验证通过，进入 P1。**

### 9.4 实现注意事项（P1 编码时直接参考）

- v3.20 API：`model.createEmbeddingContext()` / `createRankingContext()` / `model.createContext()` 均返回 **Promise**，需 await（官方文档示例未体现）
- JSON 约束输出：prompt 选项**没有** `jsonSchema` 字段，正确用法是 `grammar: new LlamaJsonSchemaGrammar(llama, schema)`
- reranker 加载时有 `pooling_type [-1] vs [4]` 警告，库自动按 rank pooling 处理，打分正确，可忽略
- bge-m3 GGUF 的 `newline token` 警告可忽略
- 验证脚本与模型保留在 `D:\coding\llama-p0-spike\`（smoke.mjs + 三个 GGUF，共 ~1.9GB），P1 开发时可直接复用为本地模型缓存

## 10. 实施结果（2026-09-09 迁移完成）

### 10.1 验证结论

| 验证项                                             | 结果                                                        |
| -------------------------------------------------- | ----------------------------------------------------------- |
| TypeScript 全量编译（tsc --noEmit）                | ✅ 0 错误                                                   |
| vitest 全套件                                      | ✅ 与迁移前基线零差异（既有的 18 个失败为环境相关既有问题） |
| ModelScope 下载链路（列目录→单文件下载→进度→落盘） | ✅ 真实网络冒烟通过                                         |
| electron-builder 打包（NSIS 安装包）               | ✅ Tau-v0.53.1-win32.exe 产出                               |
| verify-native-runtime（11 项原生检查）             | ✅ all checks passed（含 node-llama-cpp GPU 加载）          |
| CLI（esbuild 构建）                                | ✅ 构建通过                                                 |

### 10.2 关键实施要点（后续维护必读）

1. **node-llama-cpp 是 ESM-only（含顶层 await）**：主进程为 CJS 产物，`local-inference/index.ts` 必须用动态 `await import("node-llama-cpp")`（类型用 `import type`），且 `vite.config.mts` 的 `runtimeDependencyExternals` 已加入 `node-llama-cpp`/`officeparser`/`mammoth`/`turndown`
2. **asar/unpacked 双文件系统陷阱**：
   - `prune-packaged-native-modules.cjs` 的 afterPack 钩子会把 node-llama-cpp 的运行时依赖闭包（109 个包，npm 去重布局：同名同版本提升顶层、版本冲突嵌套到依赖方 node_modules 下）从 pnpm store 复制到 `app.asar.unpacked/node_modules`——electron-builder 的 manual traversal 在 pnpm 布局下会把这些依赖收进 asar 顶层，而 unpacked 中的 ESM 解析无法回溯 asar 虚拟树
   - `@vscode/ripgrep-win32-x64` 已显式加入 dependencies：asar 内的模块解析 optional 平台包要求 asar 归档有条目，事后放 unpacked 无效；显式声明保证 traversal 收集（钩子里的 `ensurePlatformSubPackages` 兜底仍保留）
   - `@node-llama-cpp` 平台二进制包由钩子从 pnpm store 显式补齐到 unpacked（traversal 偶发遗漏）
3. **模型布局变更**：本地模型从 HF 仓库目录改为单 GGUF 文件（`<modelsDir>/<name>/<file>.gguf`）；旧 torch 模型目录不再被识别（设置页显示未下载），需重新下载 GGUF 版（bge-m3 从 2.2GB 降至 635MB）
4. **索引自动重建**：embedding fingerprint 新增 `runtime: "llama"` 字段，首个版本启动时三库向量索引自动全量重建
5. **verify-native-runtime 的 node-llama-cpp 检查**：用动态 `import()` 加载 unpacked 入口（不能 require）

### 10.3 待办（发布前）

- [ ] Mac 真机验证：按 [mac-verification-runbook.md](/docs/guides/ops-mac-verification.md) 执行（含 whisper-cli 构建/冒烟、node-llama-cpp 推理断言、应用检查点、打包验证与 OSS 清理，全部命令化，可供 AI Agent 直接执行）
- [ ] Mac/Linux 打包回归（本机仅验证了 win32；linux 理论可用但未承诺）
- [ ] 首发版本说明：「首次启动将重建本地索引」「本地向量模型需重新下载（体积更小）」
- [ ] 旧 `userData/runtime/python-server/` 目录（404MB+）与旧 torch 模型目录的清理提示（可选：检测到即提示可释放空间）
- [ ] OSS 上 python-services-latest.json 与三平台二进制在下个版本后清理

---

### 附：主要参考

- node-llama-cpp：[GitHub](https://github.com/withcatai/node-llama-cpp) · [Embedding 指南](https://node-llama-cpp.withcat.ai/guide/embedding)（含 reranking 示例）· [Electron 支持](https://node-llama-cpp.withcat.ai/guide/electron) · [LlamaRankingContext API](https://node-llama-cpp.withcat.ai/api/classes/LlamaRankingContext)
- 模型：[ggml-org/bge-m3-Q8_0-GGUF](https://huggingface.co/ggml-org/bge-m3-Q8_0-GGUF)（635MB）· [gpustack/bge-m3-GGUF（ModelScope）](https://modelscope.cn/models/gpustack/bge-m3-GGUF) · [gpustack/bge-reranker-v2-m3-GGUF](https://huggingface.co/gpustack/bge-reranker-v2-m3-GGUF) · [Qwen/Qwen3-0.6B-GGUF](https://huggingface.co/Qwen/Qwen3-0.6B-GGUF)
- llama.cpp rerank 支持：[issue #8555](https://github.com/ggml-org/llama.cpp/issues/8555)（bge-m3 embedding CUDA 相关：[#13494](https://github.com/ggml-org/llama.cpp/issues/13494)、[#17796](https://github.com/ggml-org/llama.cpp/issues/17796)）
- ONNX 备选：[Xenova/bge-m3](https://huggingface.co/Xenova/bge-m3) · [onnx-community/bge-m3-ONNX](https://huggingface.co/onnx-community/bge-m3-ONNX)
- 下载库：[@huggingface/hub（snapshotDownload）](https://www.npmjs.com/package/@huggingface/hub) · ModelScope raw API：`https://modelscope.cn/api/v1/models/{id}/repo?Revision=master&FilePath={path}`
- 文档转换：[officeparser](https://www.npmjs.com/package/officeparser) · [mammoth](https://www.npmjs.com/package/mammoth) · [smart-whisper](https://github.com/JacobLinCool/smart-whisper)
- faster-whisper vs whisper.cpp：[whisper.cpp#1127](https://github.com/ggml-org/whisper.cpp/issues/1127)（同权重质量等价，faster-whisper GPU/批量更快）
