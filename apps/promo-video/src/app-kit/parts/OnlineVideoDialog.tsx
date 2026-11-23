/**
 * 「添加 Bilibili / YouTube 视频」弹窗，结构摘自 components/OnlineVideoSelectModal + ResourceSelectDialog 与 @tau/ui 的 Dialog / Select / Button。
 * 三步：粘链接 → 解析视频（按钮变「正在解析…」）→ 封面 + 清晰度下拉，底栏换成「返回 / 确认添加」。状态由调用方给。
 */
import { MonitorPlay } from "lucide-react";
import { Button } from "@tau/ui";
import { DialogFrame, Pressed } from "./Dialog";
import { SpinnerLook } from "./FormLook";
import { LectureCover } from "./LectureSlide";
import type { SlideKind } from "../../mock/videonote";

const SELECT_TRIGGER = "border-line-1 bg-surface text-ink-1 rounded-tau-sm inline-flex w-full items-center gap-2 border text-tau-body h-[34px] pr-[5px] pl-3";

export function OnlineVideoDialog({
  provider,
  appear,
  url = "",
  caret,
  parsing,
  resolved,
  pressed,
  selectOpen = 0,
  selectHighlighted,
}: {
  /** 来源名：Bilibili / YouTube */
  provider: string;
  /** 0→1 入场 */
  appear: number;
  /** 输入框里已打出的链接 */
  url?: string;
  caret?: boolean;
  /** 解析中：按钮转圈并显示「正在解析…」 */
  parsing?: boolean;
  /** 解析结果；出现后换成封面 + 清晰度 */
  resolved?: { title: string; cover: SlideKind; variants: string[]; selected: number; appear: number };
  pressed?: "parse" | "confirm";
  /** 清晰度下拉展开 0→1，以及正在移过的选项 */
  selectOpen?: number;
  selectHighlighted?: number;
}) {
  const loading = !!parsing;
  return (
    <DialogFrame
      title={`添加 ${provider} 视频`}
      subtitle={resolved ? undefined : "粘贴视频链接，解析后选择清晰度"}
      icon={<MonitorPlay />}
      appear={appear}
      footer={
        resolved ? (
          <>
            <Button variant="secondary" size="sm">
              返回
            </Button>
            <span data-hit="confirm">
              <Pressed on={pressed === "confirm"}>
                <Button variant="primary" size="sm">
                  确认添加
                </Button>
              </Pressed>
            </span>
          </>
        ) : (
          <>
            <Button variant="secondary" size="sm" disabled={loading}>
              取消
            </Button>
            <span data-hit="parse">
              <Pressed on={pressed === "parse"}>
                <Button variant="primary" size="sm" disabled={!url.trim() || loading}>
                  {loading ? (
                    <>
                      <SpinnerLook current className="size-[13px]" />
                      正在解析…
                    </>
                  ) : (
                    "解析视频"
                  )}
                </Button>
              </Pressed>
            </span>
          </>
        )
      }
    >
      <div className="min-h-0 pt-[8px] pr-[18px] pb-[22px] pl-6">
        <div className="flex flex-col gap-3.5">
          {resolved ? (
            <div data-hit="resolved" className="flex flex-col gap-3.5" style={{ opacity: resolved.appear, transform: `translateY(${(1 - resolved.appear) * 6}px)` }}>
              <div className="flex items-center gap-3">
                <span className="rounded-tau-sm relative h-[54px] w-24 shrink-0 overflow-hidden">
                  <LectureCover kind={resolved.cover} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-tau-body text-ink-1 truncate font-semibold">{resolved.title}</div>
                  <div className="text-tau-sm text-ink-3">{provider}</div>
                </div>
              </div>
              {resolved.variants.length > 1 && (
                <label className="relative flex flex-col gap-1.5">
                  <span className="flex items-center gap-2">
                    <span className="text-ink-2 text-[12px]">清晰度</span>
                  </span>
                  <span className={SELECT_TRIGGER} data-hit="select">
                    <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-left">{resolved.variants[resolved.selected]}</span>
                    <svg viewBox="0 0 16 16" className="text-ink-3 size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} style={{ transform: `rotate(${selectOpen * 180}deg)` }}>
                      <path d="m4 6 4 4 4-4" />
                    </svg>
                  </span>
                  {selectOpen > 0 && (
                    <div
                      className="bg-surface border-line-1 shadow-float rounded-tau-lg absolute inset-x-0 top-full z-[250] mt-1 flex max-h-[292px] flex-col overflow-hidden border p-[5px]"
                      style={{ opacity: selectOpen, transform: `translateY(${(1 - selectOpen) * -4}px)` }}
                    >
                      {resolved.variants.map((variant, i) => (
                        <div
                          key={variant}
                          data-hit={`variant:${i}`}
                          className={`text-ink-1 rounded-tau-sm mb-[2px] flex h-8 items-center gap-2 px-2.5 last:mb-0 ${
                            i === resolved.selected ? "bg-selected font-[550]" : selectHighlighted === i ? "bg-hover" : ""
                          }`}
                        >
                          <span className="min-w-0 flex-1 truncate">{variant}</span>
                          {i === resolved.selected && (
                            <svg viewBox="0 0 16 16" className="text-accent-text size-[15px]" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path d="m3.5 8.5 3 3 6-7" />
                            </svg>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </label>
              )}
            </div>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="flex items-center gap-2">
                <span className="text-ink-2 text-[12px]">视频链接</span>
              </span>
              <span
                data-hit="url"
                className={`border-line-1 bg-surface text-tau-body-lg rounded-tau-sm flex h-10 min-w-0 items-center gap-2 border pr-1 pl-3.5 ${
                  !loading ? "border-accent shadow-[var(--tau-focus-ring)]" : ""
                }`}
              >
                <span className={`font-tau-mono text-tau-body min-w-0 flex-1 truncate ${url ? "text-ink-1" : "text-ink-3"}`}>
                  {url || "https://"}
                  {caret && !loading && <i className="bg-accent ml-px inline-block h-[1.2em] w-[1.5px] translate-y-[3px]" />}
                </span>
              </span>
            </label>
          )}
        </div>
      </div>
    </DialogFrame>
  );
}
