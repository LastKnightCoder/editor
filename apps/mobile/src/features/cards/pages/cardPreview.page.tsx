// 卡片预览 overlay：请求/滚动/面板状态全部内聚在页面实例。
// keep-alive 保证"预览 → 打开详情 → 返回"时滚动位置与面板状态原样恢复；
// 从详情返回时 data.detail 按 refetchOnResume: "always" 拉取最新内容。

import { useRef, useState } from "react";
import { CardPreviewSheet } from "../CardPreviewSheet";
import * as tauri from "../../../services/tauri";
import { definePage, paramNumber, useNavigator, usePage, usePageQuery } from "../../../router";
import type { CardDetailResponse } from "../../../types";

type CardPreviewParams = { cardId: number };

function CardPreviewScreen() {
  const { params } = usePage<CardPreviewParams>();
  const navigator = useNavigator();
  const detail = usePageQuery<CardDetailResponse>("detail");
  const [panelState, setPanelState] = useState<"normal" | "full">("normal");
  const scrollTopRef = useRef(0);

  return (
    <CardPreviewSheet
      open
      panelState={panelState}
      loading={detail.isLoading}
      cardId={params.cardId}
      cardDetail={detail.data ?? null}
      initialScrollTop={scrollTopRef.current}
      onClose={() => navigator.goBack("ui")}
      onPanelStateChange={setPanelState}
      onScrollTopChange={scrollTop => {
        scrollTopRef.current = Math.max(0, scrollTop);
      }}
    />
  );
}

export default definePage({
  key: "cardPreview",
  layer: "overlay",
  match: "single",
  params: { cardId: paramNumber() },
  data: {
    detail: {
      key: p => ["card", p.cardId],
      load: p => tauri.getCardDetail(p.cardId),
      refetchOnResume: "always",
      staleTime: 0,
    },
  },
  component: CardPreviewScreen,
});
