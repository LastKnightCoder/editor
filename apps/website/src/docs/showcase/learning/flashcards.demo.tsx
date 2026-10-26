/**
 * 闪卡复习：一组三张卡（填空、问答、单选）。填空输入后回车揭晓对错，问答按空格显示答案，
 * 然后用 1–4 评分，进度线前进，最后是本轮小结。结构按 features/flashcards 的 ReviewSession、
 * CardContent、RatingBar 与 DoneSummary 重建。
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

type Rating = "hard" | "struggle" | "normal" | "easy";

const RATINGS: {
  value: Rating;
  key: string;
  label: string;
  next: string;
  text: string;
  hover: string;
  ring: string;
  dot: string;
}[] = [
  {
    value: "hard",
    key: "1",
    label: "忘记",
    next: "5 小时后",
    text: "text-danger",
    hover: "hover:bg-danger-soft",
    ring: "ring-danger",
    dot: "bg-danger",
  },
  {
    value: "struggle",
    key: "2",
    label: "模糊",
    next: "1 天后",
    text: "text-warn",
    hover: "hover:bg-warn-soft",
    ring: "ring-warn",
    dot: "bg-warn",
  },
  {
    value: "normal",
    key: "3",
    label: "记得",
    next: "2 天后",
    text: "text-ok",
    hover: "hover:bg-ok-soft",
    ring: "ring-ok",
    dot: "bg-ok",
  },
  {
    value: "easy",
    key: "4",
    label: "轻松",
    next: "8 天后",
    text: "text-info",
    hover: "hover:bg-info-soft",
    ring: "ring-info",
    dot: "bg-info",
  },
];

type Card =
  | {
      kind: "blank";
      before: string;
      answer: string;
      after: string;
      note: string;
    }
  | { kind: "qa"; question: string; answer: string }
  | { kind: "choice"; question: string; options: string[]; correct: number };

const CARDS: Card[] = [
  {
    kind: "blank",
    before: "在快要忘记的时候复习，记得最牢。这种方法叫",
    answer: "间隔重复",
    after: "。",
    note: "复习间隔随记忆变牢而拉长：1 天、3 天、一周、一个月……",
  },
  {
    kind: "qa",
    question: "费曼技巧的核心是什么？",
    answer: "把一个概念用最简单的话讲给外行听，讲不清的地方就是还没懂的地方。",
  },
  {
    kind: "choice",
    question: "下面哪种做法最能帮你记住刚读过的内容？",
    options: ["再读一遍", "划重点", "合上书复述一遍"],
    correct: 2,
  },
];

type Phase = "answering" | "revealed";

export default function FlashcardsDemo() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("answering");
  const [input, setInput] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const done = index >= CARDS.length;
  const card = CARDS[index];

  const correct =
    card?.kind === "blank"
      ? input.trim() === card.answer
      : card?.kind === "choice"
        ? picked === card.correct
        : true;
  const suggestion: Rating = card?.kind === "qa" ? "normal" : correct ? "normal" : "hard";

  const rate = (rating: Rating) => {
    setRatings(list => [...list, rating]);
    setIndex(value => value + 1);
    setPhase("answering");
    setInput("");
    setPicked(null);
    rootRef.current?.focus();
  };

  useEffect(() => {
    if (phase === "revealed") rootRef.current?.focus();
  }, [phase]);

  return (
    <AppWindow active="review" crumb="闪卡复习 / 学习方法" height={420}>
      <div
        ref={rootRef}
        tabIndex={-1}
        onKeyDown={event => {
          if ((event.target as HTMLElement).tagName === "INPUT") return;
          if (done) return;
          const letter = "abc".indexOf(event.key.toLowerCase());
          if (phase === "answering" && card.kind === "choice" && letter >= 0) {
            setPicked(letter);
            setPhase("revealed");
          } else if (phase === "answering" && card.kind === "qa" && event.key === " ") {
            event.preventDefault();
            setPhase("revealed");
          } else if (phase === "revealed") {
            const rating = RATINGS.find(item => item.key === event.key);
            if (rating) rate(rating.value);
            if (event.key === " ") {
              event.preventDefault();
              rate(suggestion);
            }
          }
        }}
        className="flex h-full flex-col outline-none"
      >
        <div className="bg-track h-0.5 shrink-0">
          <div
            className="bg-accent ease-tau-out h-full transition-[width] duration-500"
            style={{
              width: `${(Math.min(index, CARDS.length) / CARDS.length) * 100}%`,
            }}
          />
        </div>
        <div className="text-tau-sm text-ink-2 flex h-11 shrink-0 items-center gap-2 px-6">
          结束 · 学习方法
          <span className="ml-auto flex items-center gap-1">
            {ratings.map((rating, ratingIndex) => (
              <i
                key={ratingIndex}
                className={cn(
                  "size-1.5 rounded-full",
                  RATINGS.find(item => item.value === rating)?.dot
                )}
              />
            ))}
          </span>
          <span className="tabular-nums">
            {Math.min(index + 1, CARDS.length)} / {CARDS.length}
          </span>
        </div>

        {done ? (
          <div className="animate-doc-in m-auto flex flex-col items-center gap-3 px-6 text-center">
            <p className="text-tau-title font-semibold">这一轮复习完成了</p>
            <p className="text-ink-2 text-tau-sm">
              共 {CARDS.length} 张 · 记住{" "}
              {Math.round(
                (ratings.filter(rating => rating === "normal" || rating === "easy").length /
                  CARDS.length) *
                  100
              )}
              % · 用时约 1 分钟
            </p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {RATINGS.map(rating => (
                <div
                  key={rating.value}
                  className="border-line-1 flex w-[72px] flex-col items-center gap-0.5 rounded-[12px] border py-2"
                >
                  <b className={cn("text-[18px] tabular-nums", rating.text)}>
                    {ratings.filter(item => item === rating.value).length}
                  </b>
                  <span className="text-ink-3 text-[11.5px]">{rating.label}</span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setIndex(0);
                setRatings([]);
              }}
              className="text-accent-text hover:bg-accent-soft text-tau-sm mt-2 rounded-full px-3 py-1 font-medium"
            >
              再来一轮
            </button>
          </div>
        ) : (
          <>
            <div key={index} className="animate-doc-in m-auto w-full max-w-[560px] px-6">
              {card.kind === "blank" && (
                <p className="text-[19px] leading-[1.9] font-medium">
                  {card.before}
                  {phase === "answering" ? (
                    <input
                      autoFocus
                      value={input}
                      aria-label="填空"
                      onChange={event => setInput(event.target.value)}
                      onKeyDown={event => {
                        if (event.nativeEvent.isComposing) return;
                        if (event.key === "Enter") setPhase("revealed");
                      }}
                      size={6}
                      className="border-line-1 focus:border-accent text-accent-text mx-[3px] inline-block h-8 rounded-[8px] border px-2.5 text-center text-[16px] outline-none select-text"
                    />
                  ) : (
                    <span className="mx-[3px] inline-flex items-baseline gap-1.5">
                      {correct ? (
                        <span className="bg-ok-soft text-ok rounded-[8px] px-2.5 text-[16px]">
                          {card.answer}
                        </span>
                      ) : (
                        <>
                          {input.trim() && (
                            <span className="bg-danger-soft text-danger rounded-[8px] px-2.5 text-[16px] line-through">
                              {input.trim()}
                            </span>
                          )}
                          <span className="bg-ok-soft text-ok rounded-[8px] px-2.5 text-[16px]">
                            {card.answer}
                          </span>
                        </>
                      )}
                    </span>
                  )}
                  {card.after}
                </p>
              )}
              {card.kind === "qa" && (
                <p className="text-[20px] leading-[1.8] font-medium">{card.question}</p>
              )}
              {card.kind === "choice" && (
                <>
                  <p className="text-[20px] leading-[1.8] font-medium">{card.question}</p>
                  <div className="mt-4 flex flex-col gap-2">
                    {card.options.map((option, optionIndex) => {
                      const revealed = phase === "revealed";
                      return (
                        <button
                          key={option}
                          type="button"
                          disabled={revealed}
                          onClick={() => {
                            setPicked(optionIndex);
                            setPhase("revealed");
                          }}
                          className={cn(
                            "border-line-1 flex items-center gap-3 rounded-[12px] border px-3.5 py-2.5 text-left text-[15px] transition-colors",
                            !revealed && "hover:border-accent hover:bg-accent-soft",
                            revealed && optionIndex === card.correct && "border-ok bg-ok-soft",
                            revealed &&
                              optionIndex === picked &&
                              optionIndex !== card.correct &&
                              "border-danger bg-danger-soft"
                          )}
                        >
                          <kbd className="bg-hover text-ink-2 rounded-[5px] px-1.5 font-mono text-[11px]">
                            {"ABC"[optionIndex]}
                          </kbd>
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {phase === "revealed" && card.kind !== "choice" && (
                <div className="border-line-1 animate-doc-in mt-6 grid grid-cols-[72px_1fr] gap-y-2 border-t pt-4 text-[14px]">
                  {card.kind === "blank" ? (
                    <>
                      <span
                        className={cn(
                          "col-span-2 font-semibold",
                          correct ? "text-ok" : "text-danger"
                        )}
                      >
                        {correct ? "回答正确" : "回答有误"}
                      </span>
                      <span className="text-ink-3">解析</span>
                      <span className="text-ink-2 leading-relaxed">{card.note}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-ink-3">答案</span>
                      <span className="leading-relaxed">{card.answer}</span>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex min-h-[54px] shrink-0 items-center justify-center px-6 pb-5">
              {phase === "revealed" ? (
                <div className="animate-doc-in grid w-full max-w-[560px] grid-cols-4 gap-2">
                  {RATINGS.map(rating => (
                    <button
                      key={rating.value}
                      type="button"
                      onClick={() => rate(rating.value)}
                      className={cn(
                        "bg-surface border-line-1 ease-tau-out relative flex flex-col items-center gap-px rounded-[12px] border px-1.5 pt-[9px] pb-2 transition-[background,transform] duration-150 active:translate-y-px",
                        rating.hover,
                        suggestion === rating.value && cn("ring-[1.5px] ring-inset", rating.ring)
                      )}
                    >
                      <kbd className="bg-hover text-ink-2 absolute top-[7px] right-2 rounded-[4px] px-1 font-mono text-[10px] leading-4 max-sm:hidden">
                        {rating.key}
                      </kbd>
                      <b className={cn("text-[13.5px] font-semibold", rating.text)}>
                        {rating.label}
                      </b>
                      <span className="text-ink-2 text-[11.5px] tabular-nums">{rating.next}</span>
                    </button>
                  ))}
                </div>
              ) : card.kind === "qa" ? (
                <button
                  type="button"
                  onClick={() => setPhase("revealed")}
                  className="bg-accent text-ink-inverse hover:bg-accent-hover flex h-10 items-center gap-2 rounded-[12px] px-6 text-[14px] font-medium"
                >
                  显示答案{" "}
                  <kbd className="rounded bg-white/20 px-1.5 font-mono text-[11px]">Space</kbd>
                </button>
              ) : card.kind === "blank" ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPhase("revealed")}
                    className="text-ink-2 hover:bg-hover h-10 rounded-[12px] px-4 text-[14px]"
                  >
                    不会，看答案
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhase("revealed")}
                    className="bg-accent text-ink-inverse hover:bg-accent-hover h-10 rounded-[12px] px-6 text-[14px] font-medium"
                  >
                    提交 ↵
                  </button>
                </div>
              ) : (
                <span className="text-ink-3 text-[11px]">点一个选项，或按 A–C</span>
              )}
            </div>
            <p className="text-ink-3 shrink-0 pb-3 text-center text-[11px] max-sm:hidden">
              ↵ 提交 · Space 显示答案或采用推荐 · 1–4 评分
            </p>
          </>
        )}
      </div>
    </AppWindow>
  );
}
