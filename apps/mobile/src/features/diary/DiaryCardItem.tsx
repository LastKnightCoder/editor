import { useDiaryI18n } from "./i18n";
import { describeDiaryPeriod } from "./format";
import { isContentEmpty } from "@tau/db-schema/content-metrics";
// 日记信息流卡片（v2 模板）：一个片段一张卡，独立预览、独立编辑、独立删除。
// 只读 Editor 渲染前两段做预览（对齐卡片库，不做文本摘要提取）；
// 卡片「···」菜单提供编辑标签与删除该片段（删除确认后延迟落库，可撤销）。
// 类型不再是身份标识：日记 / 周记 / 月记只是标签，头部胶囊即标签 chips。
// 产品设计：标签与具体 segment 绑定（一天可发多条日记，各自独立打标签），
// 卡片读取/编辑的都是 segment.tags，不要改回 entry.tags（那是旧模型遗留）。

import { memo, useCallback, useMemo, useState } from "react";
import { useMobileContentKit } from "../../services/editorKit";
import type { Descendant } from "slate";
import { Editor, createValueDocument } from "@tau/editor";
import { isEditorContentEmpty } from "../cards/editorContentUtils";
import { MoreHorizontal, Tags, Trash2 } from "lucide-react";
import type { DiaryEntry, DiarySegment } from "../../types";
import { useReadonlyContentSync } from "../../hooks/useReadonlyContentSync";
import { Popover, type PopoverItem } from "../../components/Popover";
import { DiaryTagChip } from "./DiaryTagSheets";
import { getTodayDateKey } from "./feedUtils";
import { getBaseDateFromDiaryKey } from "./dateKey";

/** 预览渲染的顶层块数（前两段） */
const PREVIEW_BLOCK_COUNT = 2;

/** 卡片头部最多展示的标签数，超出折叠为 +n */
const HEADER_TAG_LIMIT = 2;

/** 删除确认等上下文用的标签摘要：无标签时回退为空串（取 segment 自身标签） */
export function segmentTagsBrief(segment: DiarySegment): string {
  return segment.tags.join(" / ");
}

type DiaryCardItemProps = {
  segment: DiarySegment;
  entry: DiaryEntry;
  tagColorOf: (tag: string) => string;
  onOpenSegment: (entry: DiaryEntry, segment: DiarySegment) => void;
  onEditTags: (entry: DiaryEntry, segment: DiarySegment) => void;
  onDeleteSegment: (entry: DiaryEntry, segment: DiarySegment) => void;
};

const DiaryCardItem = memo(
  ({
    segment,
    entry,
    tagColorOf,
    onOpenSegment,
    onEditTags,
    onDeleteSegment,
  }: DiaryCardItemProps) => {
    const { t, locale } = useDiaryI18n();
    const contentKit = useMobileContentKit("read");
    const desc = useMemo(
      () =>
        describeDiaryPeriod(
          { mode: entry.type, baseDate: getBaseDateFromDiaryKey(entry.type, entry.date) },
          { t, locale }
        ),
      [entry, t, locale]
    );
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null);

    const menuItems = useMemo<PopoverItem[]>(
      () => [
        {
          label: t("entry.tags"),
          icon: <Tags size={17} strokeWidth={2} aria-hidden="true" />,
          onClick: () => onEditTags(entry, segment),
        },
        {
          label: t("entry.delete"),
          icon: <Trash2 size={17} strokeWidth={2} aria-hidden="true" />,
          danger: true,
          onClick: () => onDeleteSegment(entry, segment),
        },
      ],
      [entry, segment, onEditTags, onDeleteSegment, t]
    );

    const closeMenu = useCallback(() => setMenuOpen(false), []);

    const editorContent = useMemo(() => {
      if (Array.isArray(segment.content) && segment.content.length > 0) {
        return segment.content.slice(0, PREVIEW_BLOCK_COUNT);
      }
      return [];
    }, [segment.content]);
    const [document, setDocument] = useState(() => createValueDocument(editorContent));

    const handleSyncedContent = useCallback((nextContent: Descendant[]) => {
      setDocument(createValueDocument(nextContent.slice(0, PREVIEW_BLOCK_COUNT)));
    }, []);

    useReadonlyContentSync(segment.contentId, {
      initialContent: editorContent,
      onContentSync: handleSyncedContent,
    });

    const isToday = entry.type === "daily" && entry.date === getTodayDateKey();
    const hasBody = !isEditorContentEmpty(document.initialValue);

    return (
      <article
        onClick={() => onOpenSegment(entry, segment)}
        className={`card pop-in mb-[11px] cursor-pointer p-4 pb-3.5 transition-transform duration-200 active:scale-[0.97] ${
          isToday ? "shadow-float" : ""
        }`}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="text-ink-1 mobile-reading-font text-[14px] font-bold">{desc.title}</span>
          <span className="text-ink-3 text-[11.5px]">{desc.sub}</span>
          {segment.tags.length > HEADER_TAG_LIMIT + 1 ? (
            <span className="flex items-center gap-1">
              {segment.tags.slice(0, HEADER_TAG_LIMIT).map(tag => (
                <DiaryTagChip key={tag} tag={tag} color={tagColorOf(tag)} />
              ))}
              <span className="text-ink-3 text-[10.5px] font-bold">
                +{segment.tags.length - HEADER_TAG_LIMIT}
              </span>
            </span>
          ) : (
            segment.tags.map(tag => <DiaryTagChip key={tag} tag={tag} color={tagColorOf(tag)} />)
          )}
          <button
            ref={setMenuAnchor}
            type="button"
            aria-label={t("entry.actions")}
            className="text-ink-3 active:bg-page ml-auto grid h-[30px] w-[30px] flex-shrink-0 place-items-center rounded-full transition-colors"
            onClick={event => {
              event.stopPropagation();
              setMenuOpen(open => !open);
            }}
          >
            <MoreHorizontal size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
        <div className="pointer-events-none min-w-0">
          {hasBody ? (
            <Editor
              kit={contentKit}
              // 与详情页同为阅读正文档（字体、字号、两端对齐），列表点开不跳变
              className="mobile-card-editor-content overflow-hidden"
              readonly={true}
              document={document}
            />
          ) : (
            <p className="text-ink-3 text-[13px]">{t("entry.empty")}</p>
          )}
        </div>
        <div className="text-ink-3 mt-2.5 flex items-center gap-3 text-[11.5px] tabular-nums">
          <span>
            {isContentEmpty(segment.content)
              ? t("entry.empty")
              : t("entry.words", {
                  count: segment.wordCount,
                  amount: segment.wordCount.toLocaleString(locale),
                })}
          </span>
          {entry.mood?.type === "emoji" ? (
            <span className="ml-auto text-[13px]">{entry.mood.value}</span>
          ) : null}
        </div>
        <Popover open={menuOpen} anchorEl={menuAnchor} items={menuItems} onClose={closeMenu} />
      </article>
    );
  }
);

export default DiaryCardItem;
