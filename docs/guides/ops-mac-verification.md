# Mac 迁移验证 Runbook（供 AI Agent / 开发者自动执行）

> 背景：Python Server 迁移到 node-llama-cpp 已在 Windows 完成实施与打包验证（见 [python-server-node-migration.md](/docs/notes/2026-09-09-python-server-migration.md) §10）。
> 本文档是 **macOS 真机验证的操作手册**：每个步骤都给出「可直接复制的命令 + 预期输出 + 通过标准 + 失败修复」，目标是让 AI Agent 在 Mac 上按顺序执行即可得出 pass/fail 结论，无需人工决策。
>
> 执行环境要求：macOS（arm64 或 x64）、可访问 ModelScope 网络、已 clone 本仓库。

---

## 0. 给 Agent 的执行说明

1. 按 §1 → §7 顺序执行，每步先跑命令、比对「预期输出」，再按「通过标准」判定
2. 任何一步失败：先执行该步的「失败修复」重试一次；仍失败则停止，把失败步骤与完整报错记入 §8 验证记录表
3. 所有步骤通过后：将执行日期、机器架构、各步骤结果、遗留问题填入 §8，并提交该文档变更（commit message：`docs: mac 迁移验证记录 <日期>`）
4. 全程不需要询问用户，遇到本文档未覆盖的错误如实记录后停止
5. 工作目录约定：`REPO=<仓库根目录>`（下文用 `$REPO` 表示，执行前先 `export REPO=<实际路径>`）

---

## 1. 环境前置检查

```bash
# 1.1 平台与架构
uname -m                        # 预期：arm64 或 x86_64
sw_vers -productVersion         # 预期：>= 13

# 1.2 工具链
node -v                         # 预期：>= 20
pnpm -v                         # 预期：>= 9
cmake --version                 # 预期：有输出（无则 xcode-select --install 或 brew install cmake）

# 1.3 依赖安装（仓库根目录）
cd "$REPO" && pnpm install
```

**通过标准**：三条版本命令有输出且满足最低版本；`pnpm install` 退出码 0（末尾出现 `Ignored build scripts` 警告可忽略，只要无 error）。

**失败修复**：`pnpm install` 报 lockfile 不匹配 → 不要改 lockfile，检查是否在正确分支；node-llama-cpp 二进制缺失 → `pnpm rebuild` 无需执行，进入下一步看报错。

---

## 2. whisper-cli 构建与放置

macOS 转录依赖随包分发的 whisper.cpp（whisper-cli）。两种获取方式，**优先 2.1 本机构建**（无需网络下载 GitHub release）。

### 2.1 本机构建（推荐）

```bash
cd /tmp && rm -rf whisper.cpp
git clone --depth 1 https://github.com/ggml-org/whisper.cpp
cd whisper.cpp

# 通用二进制（同时支持 arm64 + x86_64，Metal 加速）
cmake -B build -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES="arm64;x86_64" \
  -DWHISPER_METAL=ON \
  -DBUILD_SHARED_LIBS=OFF
cmake --build build --config Release --target whisper-cli -j

# 放置到运行时探测路径（dev 与打包共用此位置）
mkdir -p "$REPO/apps/desktop/build/bin/darwin"
cp build/bin/whisper-cli "$REPO/apps/desktop/build/bin/darwin/whisper-cli"
chmod +x "$REPO/apps/desktop/build/bin/darwin/whisper-cli"

# 验证 metallib 已嵌入（macOS Metal 必需）
"$REPO/apps/desktop/build/bin/darwin/whisper-cli" --help > /dev/null && echo "whisper-cli runs"
```

**预期输出**：`whisper-cli runs`。

**通过标准**：`--help` 退出码 0；`file build/bin/whisper-cli` 显示 `universal binary` 或对应架构且含 `executable`。

**失败修复**：

- `cmake` 找不到编译器 → `xcode-select --install`
- 只需单架构验证时去掉 `-DCMAKE_OSX_ARCHITECTURES` 参数重新构建
- 运行时报找不到 `default.metallib` → whisper.cpp 较老版本未嵌入 metallib，升级到最新 master 重新构建

### 2.2 备选：CI 产物（本机构建失败时）

```bash
# 触发 workflow（仓库 Admin 权限）后从 Actions 下载 whisper-cli-macos-universal
gh workflow run build-whisper-cli-macos.yml
gh run watch   # 等待完成
gh run download --name whisper-cli-macos-universal -D /tmp/whisper-cli-artifact
cp /tmp/whisper-cli-artifact/whisper-cli "$REPO/apps/desktop/build/bin/darwin/whisper-cli"
chmod +x "$REPO/apps/desktop/build/bin/darwin/whisper-cli"
```

**注意**：whisper-cli 需提交进仓库（`apps/desktop/build/bin/darwin/whisper-cli`），electron-builder 的 `mac.extraResources` 从这里取文件打进安装包（`Contents/Resources/bin/whisper-cli`）。确认 `.gitignore` 未排除该路径：`git check-ignore apps/desktop/build/bin/darwin/whisper-cli` 应无输出。

---

## 3. whisper-cli 功能冒烟（全自动断言）

利用 macOS 自带 `say` + `afconvert` 生成测试音频，无需任何素材文件：

```bash
cd /tmp && mkdir -p tau-verify && cd tau-verify

# 3.1 生成中文测试音频（16kHz mono wav）
say -o test.aiff "你好，这是一段用于验证转录功能的测试音频，今天天气很好。"
afconvert -f WAVE -d LEI16@16000 -c 1 test.aiff test.wav

# 3.2 下载 ggml base 模型（ModelScope 优先，失败换 HF；注意 HF 仓库名是 whisper.cpp 不是 whisper.base）
curl -L --retry 3 -o ggml-base.bin \
  "https://modelscope.cn/api/v1/models/pengzhendong/whisper.cpp-base/repo?Revision=master&FilePath=ggml-base.bin" \
  || curl -L --retry 3 -o ggml-base.bin \
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
ls -la ggml-base.bin   # 预期：约 142MB

# 3.3 句子级转录（对应 app 的默认模式）
"$REPO/apps/desktop/build/bin/darwin/whisper-cli" \
  -m ggml-base.bin -f test.wav -l zh -osrt -of out-sentence -pp --max-len 50
cat out-sentence.srt

# 3.4 词级时间戳转录（对应 app 的 LLM 断句优化模式，--dtw）
# 注意：2024-09 后的 whisper.cpp 要求 --dtw 显式带模型名（tiny/base/small/medium/large）
"$REPO/apps/desktop/build/bin/darwin/whisper-cli" \
  -m ggml-base.bin -f test.wav -l zh -osrt -of out-word -pp --max-len 1 --dtw base
wc -l out-word.srt out-sentence.srt
```

**通过标准**（写断言脚本判定）：

1. `out-sentence.srt` 存在且包含 `00:` 时间戳行，文本包含「转录」或「测试」关键词（发音清晰，base 模型识别率足够）
2. `wc -l out-word.srt` 明显大于 `out-sentence.srt` 的行数（词级切分更细）

```bash
# 自动断言（两条命令都输出 PASS 即通过）
grep -qE "转录|测试|音频" out-sentence.srt && echo "PASS: sentence transcription" || echo "FAIL"
[ "$(wc -l < out-word.srt)" -gt "$(wc -l < out-sentence.srt)" ] && echo "PASS: word timestamps" || echo "FAIL"
```

**失败修复**：

- 识别文本为空/乱码 → 确认 `-l zh` 已传；换 `small` 模型重试（ModelScope：`pengzhendong/whisper.cpp-small`）
- ModelScope 源返回 `{"Code":10990101007,"Message":"获取模型文件失败，文件内容为空"}` → 该镜像仓库文件为空，直接用 HF 源（上面已修正仓库名）
- `--dtw requires value` → whisper.cpp 新版要求显式模型名，用 `--dtw base`
- `--dtw` 不识别 → whisper.cpp 版本过旧，`git pull` 后重新构建

---

## 4. node-llama-cpp 推理冒烟（embed / rerank / expand）

```bash
cd /tmp/tau-verify
npm init -y > /dev/null && npm i node-llama-cpp@3.20.0

# 下载三个 GGUF 模型（共约 1.9GB，ModelScope 国内快）
curl -L --retry 3 -C - -o bge-m3-Q8_0.gguf "https://modelscope.cn/api/v1/models/gpustack/bge-m3-GGUF/repo?Revision=master&FilePath=bge-m3-Q8_0.gguf" &
curl -L --retry 3 -C - -o bge-reranker-v2-m3-Q8_0.gguf "https://modelscope.cn/api/v1/models/gpustack/bge-reranker-v2-m3-GGUF/repo?Revision=master&FilePath=bge-reranker-v2-m3-Q8_0.gguf" &
curl -L --retry 3 -C - -o Qwen3-0.6B-Q8_0.gguf "https://modelscope.cn/api/v1/models/Qwen/Qwen3-0.6B-GGUF/repo?Revision=master&FilePath=Qwen3-0.6B-Q8_0.gguf" &
wait
ls -la *.gguf   # 预期：三个文件均 > 500MB
```

创建冒烟脚本 `smoke.mjs`（与 Windows P0 相同断言）：

```javascript
import { getLlama, LlamaChatSession, LlamaJsonSchemaGrammar } from "node-llama-cpp";
import fs from "node:fs";

const must = file => {
  if (!fs.existsSync(file)) {
    console.error(`missing ${file}`);
    process.exit(1);
  }
  return file;
};
const llama = await getLlama();
console.log("[env] gpu backend:", llama.gpu ? "enabled" : "cpu");

const cosine = (a, b) => {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] ** 2;
    nb += b[i] ** 2;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

// 1. embedding：维度 1024 + 语义排序
{
  const model = await llama.loadModel({ modelPath: must("bge-m3-Q8_0.gguf") });
  const ctx = await model.createEmbeddingContext();
  const zh = await ctx.getEmbeddingFor("今天天气很好，我们去公园散步吧");
  const zh2 = await ctx.getEmbeddingFor("今日气候宜人，适合外出走走");
  const en = await ctx.getEmbeddingFor("The quick brown fox jumps over the lazy dog");
  if (zh.vector.length !== 1024) throw new Error(`dims ${zh.vector.length} != 1024`);
  const near = cosine(zh.vector, zh2.vector),
    far = cosine(zh.vector, en.vector);
  if (!(near > far)) throw new Error(`cosine order wrong: ${near} vs ${far}`);
  console.log(`[embedding] PASS dims=1024 near=${near.toFixed(3)} far=${far.toFixed(3)}`);
  ctx.dispose();
  await model.dispose();
}

// 2. rerank：相关文档得分高于无关文档
{
  const model = await llama.loadModel({ modelPath: must("bge-reranker-v2-m3-Q8_0.gguf") });
  const ctx = await model.createRankingContext();
  const scores = await ctx.rankAll("如何重置登录密码", [
    "忘记密码时，可以在设置页面点击重置密码，通过邮箱验证码重置。",
    "今天的午餐菜单包括红烧肉、青菜和番茄蛋汤。",
  ]);
  if (!(scores[0] > scores[1])) throw new Error(`rerank order wrong: ${scores}`);
  console.log(
    `[rerank] PASS scores=${scores.map(Number).toFixed === undefined ? scores : scores.map(s => Number(s).toFixed(4))}`
  );
  ctx.dispose();
  await model.dispose();
}

// 3. expand：JSON Schema 约束输出
{
  const model = await llama.loadModel({ modelPath: must("Qwen3-0.6B-Q8_0.gguf") });
  const ctx = await model.createContext();
  const session = new LlamaChatSession({ contextSequence: ctx.getSequence() });
  const out = await session.prompt(
    '你是本地检索系统的查询扩展器。基于用户问题输出 JSON：{"expansions":[{"type":"lex","text":"..."},{"type":"vec","text":"..."},{"type":"hyde","text":"..."}]}。只输出 JSON。\n用户问题：余弦相似度是什么',
    {
      maxTokens: 256,
      temperature: 0.7,
      topP: 0.8,
      topK: 20,
      grammar: new LlamaJsonSchemaGrammar(llama, {
        type: "object",
        properties: {
          expansions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["lex", "vec", "hyde"] },
                text: { type: "string" },
              },
              required: ["type", "text"],
            },
          },
        },
        required: ["expansions"],
      }),
    }
  );
  const parsed = JSON.parse(out.replace(/<think>[\s\S]*?<\/think>/gi, "").trim());
  if (!Array.isArray(parsed.expansions) || parsed.expansions.length === 0)
    throw new Error("empty expansions");
  console.log(`[expand] PASS expansions=${parsed.expansions.length}`);
  await session.dispose();
  await model.dispose();
}

console.log("[smoke] ALL PASS");
process.exit(0);
```

```bash
node smoke.mjs
```

**预期输出**（Apple Silicon 上 Metal 生效）：

```
[env] gpu backend: enabled
[embedding] PASS dims=1024 near=0.7xx far=0.4xx
[rerank] PASS scores=...
[expand] PASS expansions=3
[smoke] ALL PASS
```

**通过标准**：输出 `[smoke] ALL PASS`（Intel Mac 上 `gpu backend: cpu` 也算通过）。

**失败修复**：

- `NoBinaryFoundError` → `npx node-llama-cpp inspect gpu` 查看检测结果；确认 npm 装的是 3.20.0
- rerank 加载时 `pooling_type` 警告 → 可忽略（库自动处理）
- JSON parse 失败 → 正常（grammar 已约束；仍失败说明 grammar 参数未生效，检查 node-llama-cpp 版本）

---

## 5. 应用级验证（dev 模式，手动检查点）

```bash
cd "$REPO/apps/desktop" && pnpm dev
```

按顺序检查并在记录表勾选（这步无法完全自动化，Agent 可启动应用后依据日志判断前两项）：

| #   | 检查点             | 操作                                               | 通过标准                                                                                             |
| --- | ------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | 启动无 Python 报错 | 启动应用                                           | 主进程日志无 `python`、`PY_RUNTIME` 相关错误；无 python-server 进程（`ps aux                         | grep python-server` 为空） |
| 2   | 模型下载           | 设置 → 向量模型设置 → 下载 bge-m3（ModelScope 源） | 进度正常走完；`~/Library/Application Support/tau/embedding-models/bge-m3/bge-m3-Q8_0.gguf` 存在      |
| 3   | 语义搜索           | 任意库全局搜索中文关键词                           | 返回相关结果，无「本地模型不可用」降级提示                                                           |
| 4   | 重排/扩展          | 搜索后查看 network/日志（可选）                    | 无 reranker/expander unavailable 报错（模型未下载时的降级提示属正常）                                |
| 5   | 转录               | 用 §3 的 test.wav 导入音视频笔记并转录             | 生成正确字幕/文本；dev 模式走 `build/bin/darwin/whisper-cli`（日志可见 `Using bundled whisper-cli`） |
| 6   | 文档导入           | 导入一个 .docx / .pdf / .epub 到知识库             | 转换成功且内容可搜索（markitdown-node 链路）                                                         |

---

## 6. Mac 打包与原生运行时验证

### 6.1 已知前置修复（**先执行**，Windows 上已处理过同类问题）

electron-builder 在 pnpm 布局下的依赖遍历可能遗漏 ripgrep 平台包（asar 内模块解析 optional 包要求 asar 归档有条目）。**Mac 上需显式添加对应架构的平台包**（幂等，已存在则跳过）：

```bash
# arm64 机器（Apple Silicon）
cd "$REPO/apps/desktop" && pnpm add -E @vscode/ripgrep-darwin-arm64@1.18.0
# x64 机器（Intel）
cd "$REPO/apps/desktop" && pnpm add -E @vscode/ripgrep-darwin-x64@1.18.0
```

> 注：该依赖会进所有平台的 package.json（Windows install 时跳过 darwin 包不影响），属预期。

### 6.2 打包

```bash
cd "$REPO/apps/desktop"
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm build
```

> `CSC_IDENTITY_AUTO_DISCOVERY=false`：无 Apple 开发者证书时跳过签名。`pnpm build` = `tsc && vite build && run-electron-builder && verify-native-runtime` 一条龙。

**预期输出**：

- vite 两阶段构建成功
- electron-builder 产出 `release/mac-arm64/Tau.app`（或 `release/mac/`）+ dmg
- **afterPack 钩子输出**：`[prune] synced N node-llama-cpp runtime deps into unpacked`（N > 0）
- verify 输出多行 `[native-runtime] xxx: ok`，最后一行 **`[native-runtime] all checks passed`**

**通过标准**：`all checks passed` 出现，且其中包含 `node-llama-cpp=ok`。

**失败修复**：

- verify 报 `@vscode/ripgrep` 找不到平台包 → 确认 6.1 已执行且 `package.json` 中有对应 darwin 包
- verify 报 node-llama-cpp `Cannot find package 'chalk'` → afterPack 钩子未生效：检查打包日志中是否有 `[prune] synced`，无则查 `prune-packaged-native-modules.cjs` 报错
- verify 报 node-llama-cpp `NoBinaryFoundError` → 检查 `release/mac-*/Tau.app/Contents/Resources/app.asar.unpacked/node_modules/@node-llama-cpp/` 下是否有 `mac-arm64-metal`（或 `mac-x64`）目录；缺失说明本地 `pnpm install` 未装 mac 平台包，重跑 `pnpm install` 后重新打包
- 签名失败 → 确认环境变量已加；正式发布流程另行处理签名

### 6.3 打包产物 whisper-cli 抽检

```bash
APP="$REPO/apps/desktop/release/mac-arm64/Tau.app"   # x64 机器用 release/mac/Tau.app
ls -la "$APP/Contents/Resources/bin/whisper-cli"
"$APP/Contents/Resources/bin/whisper-cli" --help > /dev/null && echo "PASS: bundled whisper-cli"
```

**通过标准**：文件存在、可执行（若被 Gatekeeper 拦截：`xattr -d com.apple.quarantine "$APP"` 后重试）。

---

## 7. OSS 旧 Python 运行时清理（**发布新版且稳定运行 ≥ 1 个版本周期后**执行）

> ⚠️ 前置条件：新版（无 Python）已发布，且用户群里无回滚诉求。旧版桌面端（含 Python 依赖的版本）在**新装机/运行时更新**时仍会请求这些对象，删除后旧版本新装机的本地 AI 功能不可用（应用本体与其他功能不受影响，升级路径走 `latest.json` 不受影响）。

对象位置：`release-bin.oss-cn-shanghai.aliyuncs.com`（与桌面自动更新同 bucket，**注意别误删应用更新用的 `latest.json` / `Tau-*.exe`**）。

```bash
# 7.1 列出 Python 相关对象（确认清单）
ossutil ls oss://release-bin/ | grep -E "python"

# 7.2 本地备份（删除前必做）
mkdir -p ~/oss-python-backup && cd ~/oss-python-backup
ossutil cp -r oss://release-bin/python-services-latest.json .
ossutil cp -r oss://release-bin/python-server-v<版本>-win32-x64.exe .
ossutil cp -r oss://release-bin/python-server-v<版本>-darwin-x86.exe .
ossutil cp -r oss://release-bin/python-server-v<版本>-darwin-arm64.exe .
# （以 7.1 实际清单为准逐个备份）

# 7.3 确认备份完整后删除
ossutil rm oss://release-bin/python-services-latest.json
ossutil rm oss://release-bin/python-server-v<版本>-win32-x64.exe
# ...（逐个删除，或确认后 ossutil rm -r 批量）

# 7.4 验证
ossutil ls oss://release-bin/ | grep -E "python" || echo "PASS: python artifacts removed"
# 同时确认应用更新清单未受影响
ossutil stat oss://release-bin/latest.json
```

**通过标准**：7.4 第一条输出 `PASS: python artifacts removed`，且 `latest.json` 仍存在可访问。

**保守替代方案**：若不想立即删除，仅停止上传新版本（`python-services-latest.json` 保持指向最后一个稳定版），旧版本可继续用，新版本不再请求。

---

## 8. 验证记录（执行后填写）

| 步骤                        | 结果（PASS/FAIL/跳过） | 备注（失败摘要/异常）                                                                                                                                                                                                                                                                                                               |
| --------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §1 环境前置                 | PASS                   | arm64 / macOS 26.5.1 / node v24.1.0 / pnpm 11.9.0；cmake 缺失，已 `brew install cmake`（4.4.3）后通过                                                                                                                                                                                                                               |
| §2 whisper-cli 构建与放置   | PASS                   | master@c44b60b（2026-09-08）；universal binary（arm64+x86_64）+ Metal；`--help` 正常；`.gitignore` 的 `**/build/bin` 原本排除该路径，已加白名单放行（待随 whisper-cli 一并提交）                                                                                                                                                    |
| §3 whisper-cli 功能冒烟     | PASS                   | 句子级：中文识别正确（关键词命中），Metal 下 782ms；词级 `--dtw`：新版 whisper.cpp 要求显式模型名，`--dtw` → `--dtw base` 后通过（100 行 vs 4 行）。另：ModelScope `pengzhendong/whisper.cpp-base` 当前返回「文件内容为空」错误 JSON，改用 HF 源（注意仓库名是 `ggerganov/whisper.cpp`，本文档原 URL 笔误已修正）                   |
| §4 node-llama-cpp 推理冒烟  | PASS                   | `[env] gpu backend: enabled`（Metal）；embedding dims=1024 near=0.786 > far=0.450；rerank 0.7874 vs 0.0000；expand expansions=3；`[smoke] ALL PASS`                                                                                                                                                                                 |
| §5 应用级验证（6 项检查点） | 部分通过（1/6 自动）   | 检查点 1 PASS：dev 启动正常，日志中 python/PY_RUNTIME 计数为 0，无 python-server 进程；模型未下载时降级提示正常（「本地向量模型未下载，跳过索引重建」）。检查点 2-6 涉及 GUI 手动操作，待人工执行                                                                                                                                   |
| §6 Mac 打包与原生验证       | PASS                   | 6.1 已在前置修复中完成（ripgrep 平台子包显式声明进 optionalDependencies）；6.2 `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm build` 全链路成功，`[prune] synced 109 node-llama-cpp runtime deps`、`[native-runtime] all checks passed`（含 node-llama-cpp=ok、ripgrep 指向 darwin-arm64）；6.3 产物内 whisper-cli universal binary 可执行 |
| §7 OSS 清理（如到时机）     | 跳过                   | 前置条件未满足（无 Python 新版尚未发布）                                                                                                                                                                                                                                                                                            |

- 执行日期：2026-09-09
- 机器架构（arm64/x86_64）：arm64（Apple Silicon）
- macOS 版本：26.5.1
- whisper.cpp 构建版本（commit/tag）：master@c44b60b（2026-09-08）
- node-llama-cpp 版本：3.20.0
- 遗留问题：
  1. §5 检查点 2-6（模型下载、语义搜索、重排/扩展、转录、文档导入）需人工在 GUI 中执行
  2. 本次验证顺带修复并留在工作区的变更待提交：`prune-packaged-native-modules.cjs` 的 mac appOutDir 路径 bug（此前 afterPack 在 mac 上从未生效）、`@vscode/ripgrep` 平台子包声明、`pnpm-lock.yaml`、`.gitignore` 放行规则与 `apps/desktop/build/bin/darwin/whisper-cli` 二进制
  3. HF 直连在本机可用，但 `hf-mirror.com` 与 `ggml.ggerganov.com` 在本机网络环境下不可用（备源仅作参考）
