/**
 * 正文一侧的联动：正文里已引用的资料（白板卡片标「已引用」）、写作时亮起与当前段落相关的那张（18 §3.7）。
 *
 * 亮起只比白板上已有的资料、只用本地向量：停笔约 2 秒、这一段有 ≥ 20 字新改动才比一次；
 * 光标换段或 10 秒没再写，亮起淡出。已引用的不再亮。
 */

import { useEffect, useRef } from "react";
import { Node, type Descendant } from "slate";
import { composeParagraphSimilarity } from "@/commands/compose";
import { citedKeys } from "./model";
import type { ComposeSession } from "./session";

const IDLE_MS = 2000;
const GLOW_MS = 10_000;
const MIN_CHANGE = 20;
/** 阈值读不到（索引还没建好）时用的保守值 */
const FALLBACK_THRESHOLD = 0.6;

export function useComposeWriting(
  session: ComposeSession,
  { active, content }: { active: boolean; content: Descendant[] | undefined }
) {
  const lastChecked = useRef<{ block: number; text: string } | null>(null);
  const glowTimer = useRef(0);

  useEffect(() => {
    if (!active || !content) return;
    session.setState({ cited: citedKeys(content) });
  }, [active, content, session]);

  useEffect(() => {
    if (!active || !content) return;
    const editor = session.getState().getEditor();
    const block = editor?.selection?.anchor.path[0];
    if (block == null) return;
    const glow = session.getState().glow;
    if (glow && glow.block !== block) session.setState({ glow: null });

    const timer = window.setTimeout(() => {
      const node = editor?.children[block];
      if (!node) return;
      const text = Node.string(node).trim();
      const previous = lastChecked.current;
      const changed =
        !previous || previous.block !== block
          ? text.length
          : Math.abs(text.length - previous.text.length) +
            (text.startsWith(previous.text) ? 0 : MIN_CHANGE);
      if (text.length < MIN_CHANGE || changed < MIN_CHANGE) return;
      lastChecked.current = { block, text };
      const { documents, cited } = session.getState();
      const candidates = documents.filter(doc => !cited.has(doc.key));
      if (!candidates.length) return;
      composeParagraphSimilarity(text, [...new Set(candidates.map(doc => doc.key))])
        .then(({ scores, threshold }) => {
          const best = scores.reduce<{ key: string; similarity: number } | null>(
            (top, score) => (!top || score.similarity > top.similarity ? score : top),
            null
          );
          if (!best || best.similarity < (threshold ?? FALLBACK_THRESHOLD)) return;
          const current = session.getState().getEditor()?.selection?.anchor.path[0];
          if (current !== block) return;
          const doc = session.getState().documents.find(item => item.key === best.key);
          if (!doc) return;
          session.setState({ glow: { key: doc.key, elementId: doc.elementId, block } });
          window.clearTimeout(glowTimer.current);
          glowTimer.current = window.setTimeout(() => session.setState({ glow: null }), GLOW_MS);
        })
        .catch(() => undefined);
    }, IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [active, content, session]);

  useEffect(() => {
    if (active) return;
    session.setState({ glow: null });
  }, [active, session]);

  useEffect(() => () => window.clearTimeout(glowTimer.current), []);
}
