// 背景高亮笔触选择：平涂与三种马克笔笔触，点选即时写入并落盘。作为 BottomSheet 内容使用。
// 设置写入 setting.json 的 appearance.highlight.style（与桌面同构），编辑器经设置桥读取生效；
// 预览直接用编辑器的 HighlightMark 指定笔触绘制，随当前明暗。

import {
  HIGHLIGHT_STYLES,
  HighlightMark,
  type HighlightStyle,
} from "@tau/editor/extensions/text-formatting";
import { useAppContext } from "../../../app/AppContext";
import { CheckBubble } from "../../../components/CheckBubble";
import { normalizeHighlightStyle } from "./highlightStyle";
import { GroupRow } from "./ui";

function HighlightSample({ style }: { style: HighlightStyle }) {
  return (
    <span className="text-ink-1 mt-1.5 block text-[14px] leading-[1.8]">
      <HighlightMark type="yellow" variant={style}>
        间隔重复
      </HighlightMark>
      比集中复习更有效，先
      <HighlightMark type="green" variant={style}>
        提取练习
      </HighlightMark>
    </span>
  );
}

export function HighlightStyleSection() {
  const app = useAppContext();
  const active = normalizeHighlightStyle(
    app.syncSettings.safeSetting?.appearance?.highlight?.style
  );

  const select = (style: HighlightStyle) => {
    app.syncSettings.updateSetting(
      prev => ({
        ...prev,
        appearance: {
          ...prev.appearance,
          highlight: { ...prev.appearance?.highlight, style },
        },
      }),
      { persist: true }
    );
  };

  return (
    <div className="space-y-3">
      <div className="setting-group">
        {HIGHLIGHT_STYLES.map(option => (
          <GroupRow key={option.id} onClick={() => select(option.id)}>
            <span className="min-w-0 flex-1">
              <span className="text-ink-1 block text-[15px] font-semibold">{option.label}</span>
              <HighlightSample style={option.id} />
            </span>
            {active === option.id && <CheckBubble />}
          </GroupRow>
        ))}
      </div>
      <p className="text-ink-3 px-1 text-[12px] leading-relaxed">
        笔触只改变背景高亮的画法，不改动文档内容。
      </p>
    </div>
  );
}
