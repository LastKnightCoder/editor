// 来源引用标题解析（知识库 / 项目文档节点的 ref 展示）：
// 卡片取正文首行摘要，文章取标题；解析前返回空串、失败回退编号文案。

import { useEffect, useState } from "react";
import * as tauri from "../services/tauri";
import { clampText, richTextPlainText } from "../utils/richTextText";

export function useRefSourceLabel(refType: string, refId: number): string {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!refType || refId <= 0) {
      setLabel("");
      return;
    }
    let cancelled = false;
    const fallback = `${refType === "card" ? "卡片" : "内容"} #${refId}`;
    if (refType === "card") {
      tauri
        .getCardDetail(refId)
        .then(card => {
          if (cancelled) return;
          const firstLine = richTextPlainText(card.content).split("\n")[0]?.trim() ?? "";
          setLabel(clampText(firstLine, 24) || fallback);
        })
        .catch(() => {
          if (!cancelled) setLabel(fallback);
        });
    } else {
      tauri
        .articleGet(refId)
        .then(article => {
          if (cancelled) return;
          setLabel(article.title?.trim() || fallback);
        })
        .catch(() => {
          if (!cancelled) setLabel(fallback);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [refType, refId]);

  return label;
}
