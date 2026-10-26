/**
 * 公式列：先选「想算什么？」，再按步骤填。下方的描述和预览随选择实时变化。
 * 版式与类名按 packages/database 的 FormulaBuilder（意图卡、计算 / 按条件显示 / 拼接文字、预览表）重建。
 */
import { useState } from "react";
import { Tag, cn, type TagColor } from "@tau/ui";

interface Book {
  title: string;
  status: "想读" | "在读" | "读完";
  pages: number;
  read: number;
  price: number;
}

const ROWS: Book[] = [
  { title: "深度工作", status: "读完", pages: 288, read: 288, price: 49 },
  { title: "认知天性", status: "读完", pages: 312, read: 312, price: 59 },
  { title: "原子习惯", status: "在读", pages: 336, read: 140, price: 58 },
  { title: "思考，快与慢", status: "在读", pages: 424, read: 96, price: 69 },
  { title: "学习之道", status: "想读", pages: 256, read: 0, price: 45 },
];

type Mode = "calc" | "if" | "concat";
type NumCol = "pages" | "read" | "price";
type Op = "×" | "÷" | "+" | "−";

const NUM_COLS: Record<NumCol, string> = {
  pages: "页数",
  read: "已读页数",
  price: "价格",
};
const OPS: Op[] = ["+", "−", "×", "÷"];

const INTENTS: {
  mode: Mode;
  icon: string;
  title: string;
  text: string;
  example: string;
}[] = [
  {
    mode: "calc",
    icon: "±",
    title: "计算",
    text: "几列或数字之间加减乘除",
    example: "例：已读页数 ÷ 页数",
  },
  {
    mode: "if",
    icon: "?",
    title: "按条件显示",
    text: "满足某个条件就显示某个值",
    example: "例：页数大于 300 显示「大部头」",
  },
  {
    mode: "concat",
    icon: "“",
    title: "拼接文字",
    text: "把几列的内容连成一段文字",
    example: "例：书名 · 状态",
  },
];

const STATUS_COLOR: Record<Book["status"], TagColor> = {
  想读: "gray",
  在读: "blue",
  读完: "green",
};

/* 与 FormulaBuilder 相同的控件类 */
const control =
  "border-line-1 bg-surface rounded-tau-sm text-tau-body inline-flex h-8 shrink-0 items-center border";
const pickerClass = cn(
  control,
  "hover:border-accent cursor-pointer gap-1.5 whitespace-nowrap pl-2.5 pr-2 transition-colors"
);
const Caret = () => <span className="text-ink-3 text-[10px]">▾</span>;

/** 点击循环切换的选择器：示意里用它代替下拉菜单 */
function Cycle<T extends string>({
  value,
  options,
  label,
  onChange,
  className,
}: {
  value: T;
  options: readonly T[];
  label?: (value: T) => string;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(options[(options.indexOf(value) + 1) % options.length])}
      className={cn(pickerClass, className)}
    >
      {label ? label(value) : value}
      <Caret />
    </button>
  );
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export default function FormulaDemo() {
  const [mode, setMode] = useState<Mode | null>(null);
  // 计算：左列 运算 右列
  const [left, setLeft] = useState<NumCol>("read");
  const [op, setOp] = useState<Op>("÷");
  const [right, setRight] = useState<NumCol>("pages");
  // 按条件显示：如果 页数 大于 N 显示 A，否则 B
  const [cmp, setCmp] = useState<"大于" | "小于">("大于");
  const [limit, setLimit] = useState(300);
  const [yes, setYes] = useState("大部头");
  const [no, setNo] = useState("薄书");
  // 拼接：书名 + 分隔 + 状态
  const [sep, setSep] = useState(" · ");

  const calc = (row: Book) => {
    const a = row[left];
    const b = row[right];
    if (op === "+") return fmt(a + b);
    if (op === "−") return fmt(a - b);
    if (op === "×") return fmt(a * b);
    return b === 0 ? "—" : fmt(a / b);
  };
  const cond = (row: Book) => ((cmp === "大于" ? row.pages > limit : row.pages < limit) ? yes : no);
  const result = (row: Book) =>
    mode === "calc" ? calc(row) : mode === "if" ? cond(row) : `${row.title}${sep}${row.status}`;

  const describe =
    mode === "calc"
      ? `结果 = ${NUM_COLS[left]} ${op} ${NUM_COLS[right]}`
      : mode === "if"
        ? `如果 页数 ${cmp} ${limit} → 显示「${yes}」；都不满足 → 显示「${no}」。从上往下，满足第一种就停`
        : `把 书名、「${sep}」和 状态 连起来`;
  const shown: { key: string; title: string; value: (row: Book) => string }[] =
    mode === "calc"
      ? [
          {
            key: left,
            title: NUM_COLS[left],
            value: row => String(row[left]),
          },
          {
            key: `${right}-r`,
            title: NUM_COLS[right],
            value: row => String(row[right]),
          },
        ]
      : mode === "if"
        ? [{ key: "pages", title: "页数", value: row => String(row.pages) }]
        : [{ key: "status", title: "状态", value: row => row.status }];

  return (
    <div className="bg-surface border-line-1 shadow-float font-tau text-ink-1 mx-auto max-w-[680px] rounded-[16px] border select-none">
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <b className="text-tau-title font-semibold">新建列</b>
        <span className="text-ink-3 text-tau-sm">书单 · 列类型：公式</span>
      </div>
      <div className="px-5 pb-5">
        <div className="border-line-1 rounded-tau-md flex flex-col overflow-hidden border">
          <div className="flex min-w-0 flex-col gap-3.5 p-4">
            {!mode ? (
              <>
                <b className="text-tau-body font-semibold">想算什么？</b>
                <div className="grid grid-cols-3 gap-2.5 max-sm:grid-cols-1">
                  {INTENTS.map(intent => (
                    <button
                      key={intent.mode}
                      type="button"
                      aria-label={intent.title}
                      onClick={() => setMode(intent.mode)}
                      className="border-line-1 hover:border-accent hover:bg-accent-soft rounded-tau-md flex flex-col items-start gap-1.5 border p-3.5 text-left transition-colors"
                    >
                      <span className="bg-hover text-accent-text rounded-tau-sm grid size-7 place-items-center font-bold">
                        {intent.icon}
                      </span>
                      <b className="text-tau-body font-semibold">{intent.title}</b>
                      <span className="text-ink-2 text-tau-sm">{intent.text}</span>
                      <span className="text-ink-3 text-tau-sm">{intent.example}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center">
                  <b className="text-tau-body font-semibold">
                    {INTENTS.find(intent => intent.mode === mode)?.title}
                  </b>
                  <button
                    type="button"
                    className="text-ink-3 hover:text-ink-1 text-tau-sm ml-auto"
                    onClick={() => setMode(null)}
                  >
                    换一种
                  </button>
                </div>

                {mode === "calc" && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Cycle
                      value={left}
                      options={Object.keys(NUM_COLS) as NumCol[]}
                      label={v => NUM_COLS[v]}
                      onChange={setLeft}
                    />
                    <Cycle
                      value={op}
                      options={OPS}
                      onChange={setOp}
                      className="min-w-10 justify-center px-2 font-semibold"
                    />
                    <Cycle
                      value={right}
                      options={Object.keys(NUM_COLS) as NumCol[]}
                      label={v => NUM_COLS[v]}
                      onChange={setRight}
                    />
                  </div>
                )}

                {mode === "if" && (
                  <div className="flex flex-col gap-2">
                    <div className="border-line-1 rounded-tau-md flex flex-col gap-2 border px-3 py-2.5">
                      <div className="text-ink-3 text-tau-sm">情况 1</div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-ink-2 text-tau-body w-[58px] shrink-0">如果</span>
                        <span className={pickerClass}>
                          页数
                          <Caret />
                        </span>
                        <Cycle value={cmp} options={["大于", "小于"] as const} onChange={setCmp} />
                        <input
                          aria-label="比较的数字"
                          inputMode="numeric"
                          value={limit}
                          onChange={event => setLimit(Number(event.target.value) || 0)}
                          className={cn(
                            control,
                            "w-20 px-2.5 tabular-nums outline-none select-text"
                          )}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-ink-2 text-tau-body w-[58px] shrink-0">显示</span>
                        <input
                          aria-label="满足时显示"
                          value={yes}
                          onChange={event => setYes(event.target.value)}
                          className={cn(control, "w-28 px-2.5 outline-none select-text")}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 px-3">
                      <span className="text-ink-2 text-tau-body shrink-0">都不满足时显示</span>
                      <input
                        aria-label="都不满足时显示"
                        value={no}
                        onChange={event => setNo(event.target.value)}
                        className={cn(control, "w-28 px-2.5 outline-none select-text")}
                      />
                    </div>
                  </div>
                )}

                {mode === "concat" && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={pickerClass}>
                      书名
                      <Caret />
                    </span>
                    <span className="text-ink-3">＋</span>
                    <input
                      aria-label="分隔文字"
                      value={sep}
                      onChange={event => setSep(event.target.value)}
                      className={cn(control, "w-16 px-2.5 outline-none select-text")}
                    />
                    <span className="text-ink-3">＋</span>
                    <span className={pickerClass}>
                      状态
                      <Caret />
                    </span>
                  </div>
                )}

                <p className="text-ink-2 text-tau-sm bg-surface-hover rounded-tau-sm px-3 py-2 leading-[1.8]">
                  {describe}
                </p>
              </>
            )}
          </div>

          {mode && (
            <div className="border-line-1 bg-surface-hover flex min-w-0 flex-col gap-2 border-t px-4 py-3">
              <span className="text-ink-3 text-tau-tiny font-semibold tracking-[0.03em]">
                预览 · 前 5 行
              </span>
              <table className="text-tau-sm w-full border-collapse">
                <thead>
                  <tr className="text-ink-3 border-line-1 border-b text-left">
                    <th className="py-1 pr-1 font-medium">书名</th>
                    {shown.map(col => (
                      <th key={col.key} className="py-1 pr-1 text-right font-medium">
                        {col.title}
                      </th>
                    ))}
                    <th className="py-1 text-right font-medium">结果</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map(row => (
                    <tr
                      key={row.title}
                      className="border-line-1 border-b border-dashed last:border-b-0"
                    >
                      <td className="text-ink-2 max-w-[240px] truncate py-1 pr-1">{row.title}</td>
                      {shown.map(col => (
                        <td key={col.key} className="text-ink-2 py-1 pr-1 text-right tabular-nums">
                          {col.key === "status" ? (
                            <Tag color={STATUS_COLOR[row.status]}>{row.status}</Tag>
                          ) : (
                            col.value(row)
                          )}
                        </td>
                      ))}
                      <td className="text-ink-1 py-1 text-right font-semibold tabular-nums">
                        {result(row)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
