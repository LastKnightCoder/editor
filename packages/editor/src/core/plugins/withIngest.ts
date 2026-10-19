import { Editor, Node, Path, Transforms, type Point } from "slate";

import { ingestAccepts, type IngestContext, type IngestSource } from "../api/ingest";
import type { ExtensionCircuitBreaker } from "../kit/extensionGuard";

/**
 * 内容注入认领管线（01 §5.4）：drop 与 paste 合一，共同形状是 DataTransfer。
 *
 * paste：改写 insertData——Slate 自有片段优先原样下传（编辑器间复制往返完整）；
 *        files 按声明分桶认领（任一桶认领即消费本次粘贴，未认领的文件忽略，对齐旧
 *        「认领即消费」语义），再试 text 谓词认领（排在 markdown 导入等后续链式插件
 *        之前），都没认领才把 data 下传给默认链。
 * drop：editor.handleDrop 把 dataTransfer.files 分桶后逐桶 run，认领不到的忽略。
 * 每环按贡献扩展隔离：run / when 抛错记入该扩展的熔断（phase=ingest），不牵连其他认领者。
 */
const SLATE_FRAGMENT_MIME = "application/x-slate-fragment";

const hasSlateFragment = (data: DataTransfer): boolean => {
  if (data.getData(SLATE_FRAGMENT_MIME)) return true;
  const html = data.getData("text/html");
  return Boolean(html && html.includes("data-slate-fragment="));
};

/** 按声明顺序给文件分桶：每个文件归第一个 accept 匹配的声明（一文件只认领一次） */
const partitionByClaim = (
  sources: readonly IngestSource[],
  files: readonly File[]
): { source: IngestSource; files: File[] }[] => {
  const buckets: { source: IngestSource; files: File[] }[] = [];
  let remaining = [...files];
  for (const source of sources) {
    if (!source.files || !remaining.length) continue;
    const claimed = remaining.filter(file => ingestAccepts(source.files!.accept, file.type));
    if (claimed.length) {
      buckets.push({ source, files: claimed });
      const claimedSet = new Set(claimed);
      remaining = remaining.filter(file => !claimedSet.has(file));
    }
  }
  return buckets;
};

/**
 * 文件拖拽的插入点（drop 指示线停在哪就插到哪）：目标块之前取块首，之后取下一块首
 * （没有下一块时取文档末尾），三个分支都是有效 point，run 的插入落在指示线位置。
 */
export const resolveFileDropPoint = (
  editor: Editor,
  target: { path: Path; before: boolean }
): Point => {
  if (target.before) return Editor.start(editor, target.path);
  const next = Path.next(target.path);
  return Node.has(editor, next) ? Editor.start(editor, next) : Editor.end(editor, []);
};

export const withIngest = (
  editor: Editor,
  sources: readonly IngestSource[],
  breaker: ExtensionCircuitBreaker
): Editor => {
  // 熔断停用的声明视为不存在：分桶与 text 认领都跳过，文件留给后续声明
  const activeSources = () => sources.filter(source => !breaker.isDisabled(source.owner));

  const runClaim = async (source: IngestSource, ctx: IngestContext): Promise<boolean> => {
    if (breaker.isDisabled(source.owner)) return false;
    const run = ctx.files ? source.files?.run : source.text?.run;
    if (!run) return false;
    try {
      await run(ctx);
      return true;
    } catch (error) {
      breaker.record(source.owner, "ingest", error);
      return false;
    }
  };

  editor.handleDrop = async (data: DataTransfer, point) => {
    const files = Array.from(data.files ?? []);
    if (!files.length) return;
    Transforms.select(editor, point);
    await Promise.all(
      partitionByClaim(activeSources(), files).map(({ source, files }) =>
        runClaim(source, { editor, files, data, point, source: "drop" })
      )
    );
  };

  const { insertData } = editor;
  editor.insertData = async (data: DataTransfer) => {
    // Slate 自有片段（编辑器间复制）优先，不经认领
    if (hasSlateFragment(data)) {
      insertData(data);
      return;
    }

    // files 认领：任一桶认领即消费本次粘贴
    const files = Array.from(data.files ?? []);
    if (files.length) {
      const buckets = partitionByClaim(activeSources(), files);
      if (buckets.length) {
        await Promise.all(
          buckets.map(({ source, files }) =>
            runClaim(source, { editor, files, data, source: "paste" })
          )
        );
        return;
      }
    }

    // text 认领：第一个 when 为真的声明消费，排在 markdown 导入之前
    for (const source of activeSources()) {
      if (!source.text) continue;
      let claimed: boolean;
      try {
        claimed = source.text.when(data);
      } catch (error) {
        breaker.record(source.owner, "ingest", error);
        continue;
      }
      if (claimed) {
        await runClaim(source, { editor, data, source: "paste" });
        return;
      }
    }

    insertData(data);
  };

  return editor;
};
