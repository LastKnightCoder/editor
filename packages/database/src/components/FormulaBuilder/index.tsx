import React, {
  createContext,
  memo,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Sparkles } from "lucide-react";
import { produce } from "immer";
import { cn, Menu } from "@tau/ui";
import type PluginManager from "../../PluginManager";
import type { ColumnDef, RowData, SelectOption } from "../../types";
import {
  AGGREGATE_LABELS,
  aggregatesFor,
  createFormulaContext,
  formatScalar,
  enumTagColor,
  formulaEnumOf,
  getRowDeriver,
  isFormulaCell,
  referencedColumns,
  type BinaryOp,
  type Expr,
  type FormulaContext,
  type FormulaScope,
} from "../../core/formula";
import { checkFormula, formulaColumnsWith } from "./check";
import {
  COMPARES,
  MAX_NEST,
  NO_VALUE,
  emptyValue,
  formToExpr,
  hasHole,
  newForm,
  slotForFamily,
  type CalcNode,
  type Case,
  type CompareFamily,
  type Condition,
  type ConcatNode,
  type FormulaForm,
  type IfNode,
  type SlotKind,
  type ValueNode,
} from "./model";
import { describeForm } from "./describe";
import { generateFormula } from "./assist";
import { useDatabaseSlots } from "../../DatabaseHostContext";
import SelectList from "../../views/TableView/components/SelectList";

type Path = (string | number)[];

const OPS: [BinaryOp, string, string][] = [
  ["+", "+", "加"],
  ["-", "−", "减"],
  ["*", "×", "乘"],
  ["/", "÷", "除"],
];
const OP_SIGN = Object.fromEntries(OPS.map(([op, sign]) => [op, sign])) as Record<BinaryOp, string>;

interface BuilderContextValue {
  scope: FormulaScope;
  columns: ColumnDef[];
  ctx: FormulaContext;
  pluginManager: PluginManager;
  /** 可参与运算的列（不含正在编辑的公式列自身） */
  usable: ColumnDef[];
  familyOf: (columnId: string) => CompareFamily | undefined;
  set: (path: Path, value: unknown) => void;
  edit: <T>(path: Path, recipe: (node: T) => void) => void;
}

const BuilderContext = createContext<BuilderContextValue | null>(null);
const useBuilder = () => {
  const value = useContext(BuilderContext);
  if (!value) throw new Error("FormulaBuilder context missing");
  return value;
};

const getAt = (root: unknown, path: Path) =>
  path.reduce<unknown>((node, key) => (node as Record<string | number, unknown>)[key], root);

/* ───────── 样式 ───────── */

const control =
  "border-line-1 bg-surface rounded-tau-sm text-tau-body inline-flex h-8 shrink-0 items-center border";
const pickerClass = cn(
  control,
  "hover:border-accent cursor-pointer gap-1.5 whitespace-nowrap pl-2.5 pr-2 transition-colors"
);
const Caret = () => <span className="text-ink-3 text-[10px]">▾</span>;
const linkButton =
  "text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm text-tau-sm h-7 shrink-0 self-start px-2.5 transition-colors";
const miniButton =
  "text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm text-tau-sm h-6 shrink-0 px-2 transition-colors";
const removeButton =
  "text-ink-3 hover:bg-hover hover:text-ink-1 rounded-tau-sm grid size-6 shrink-0 place-items-center text-[15px]";

const ColumnIcon: React.FC<{ column: ColumnDef }> = ({ column }) => {
  const { pluginManager } = useBuilder();
  const Icon = pluginManager.getPlugin(column.type)?.Icon;
  return Icon ? <Icon className="size-3.5" /> : null;
};

/* ───────── 菜单 ───────── */

/** 「改成计算 / 条件」：到层数上限时变灰并提示拆列 */
function nestItems(
  depth: number,
  slot: SlotKind,
  onPick: (to: "calc" | "if") => void,
  allowIf: boolean
) {
  if (slot !== "number" && slot !== "text") return null;
  if (depth + 1 > MAX_NEST)
    return (
      <>
        <Menu.Separator />
        <Menu.Item disabled>已经套了 {MAX_NEST} 层，更复杂的请拆成两列</Menu.Item>
      </>
    );
  return (
    <>
      <Menu.Separator />
      <Menu.Item onSelect={() => onPick("calc")}>改成计算…</Menu.Item>
      {allowIf && <Menu.Item onSelect={() => onPick("if")}>改成条件…</Menu.Item>}
    </>
  );
}

const ColumnItems: React.FC<{
  columns: ColumnDef[];
  current?: string;
  onPick: (id: string) => void;
}> = ({ columns, current, onPick }) => {
  if (!columns.length) return null;
  return (
    <>
      <Menu.Group>用这一列的值</Menu.Group>
      {columns.map(column => (
        <Menu.Item
          key={column.id}
          icon={<ColumnIcon column={column} />}
          className={column.id === current ? "text-accent-text" : undefined}
          onSelect={() => onPick(column.id)}
        >
          {column.title}
        </Menu.Item>
      ))}
    </>
  );
};

/** 值框可选的列：数字框只列数字列，日期框只列日期列；表尾任何列都能汇总 */
function useSlotColumns(slot: SlotKind) {
  const { scope, usable, familyOf } = useBuilder();
  if (scope === "footer") return usable;
  return usable.filter(column => {
    const family = familyOf(column.id);
    if (!family) return false;
    if (slot === "number") return family === "number";
    if (slot === "date") return family === "date";
    return slot === "text";
  });
}

/** 把一个值改成嵌套的计算或条件，原值作为第一项 / 第一种情况的结果 */
function useNest() {
  const { usable, familyOf, set } = useBuilder();
  return (path: Path, node: ValueNode, slot: SlotKind, to: "calc" | "if") => {
    if (to === "calc") {
      const seed: ValueNode =
        node.kind === "column" || (node.kind === "number" && node.value !== "")
          ? node
          : emptyValue("number");
      const calc: CalcNode = {
        kind: "calc",
        terms: [{ value: seed }, { op: "+", value: emptyValue("number") }],
      };
      set(path, calc);
      return;
    }
    const first =
      usable.find(column => familyOf(column.id) === "number") ??
      usable.find(column => familyOf(column.id));
    const family = (first && familyOf(first.id)) || "text";
    const nested: IfNode = {
      kind: "if",
      slot,
      cases: [
        {
          join: "and",
          conds: [
            {
              left: { kind: "column", columnId: first?.id ?? "" },
              cmp: COMPARES[family][0][0],
              value: emptyValue(slotForFamily(family)),
            },
          ],
          result: node,
        },
      ],
      otherwise: emptyValue(slot),
    };
    set(path, nested);
  };
}

/* ───────── 值框 ───────── */

interface SlotProps {
  path: Path;
  node: ValueNode;
  slot: SlotKind;
  depth: number;
  options?: SelectOption[];
}

const ValueBox: React.FC<SlotProps> = memo(({ path, node, slot, depth, options }) => {
  const { scope, columns, ctx, set } = useBuilder();
  const slotColumns = useSlotColumns(slot);
  const nest = useNest();
  const titleOf = (id: string) => columns.find(column => column.id === id)?.title ?? "已删除的列";

  const pickColumn = (id: string) =>
    set(
      path,
      scope === "footer"
        ? {
            kind: "column",
            columnId: id,
            agg: aggregatesFor(ctx.resolveColumn(id)?.valueType ?? null)[0],
          }
        : { kind: "column", columnId: id }
    );
  const menu = (trigger: React.ReactElement, extra?: ReactNode) => (
    <Menu fit trigger={trigger}>
      <ColumnItems
        columns={slotColumns}
        current={node.kind === "column" ? node.columnId : undefined}
        onPick={pickColumn}
      />
      {nestItems(depth, slot, to => nest(path, node, slot, to), scope === "row")}
      {extra}
    </Menu>
  );

  if (slot === "option") {
    const picked = node.kind === "option" ? node.value : null;
    return (
      <Menu
        fit
        trigger={
          <button type="button" className={cn(pickerClass, !picked && "text-ink-3 border-dashed")}>
            {picked ?? "选择选项"}
            <Caret />
          </button>
        }
      >
        {(options ?? []).map(option => (
          <Menu.Item
            key={option.id}
            onSelect={() => set(path, { kind: "option", value: option.name })}
          >
            {option.name}
          </Menu.Item>
        ))}
      </Menu>
    );
  }

  if (node.kind === "column" && scope === "footer") {
    const ops = aggregatesFor(ctx.resolveColumn(node.columnId)?.valueType ?? null);
    return (
      <>
        {menu(
          <button type="button" className={pickerClass}>
            {titleOf(node.columnId)}
            <Caret />
          </button>,
          <>
            <Menu.Separator />
            <Menu.Item onSelect={() => set(path, emptyValue("number"))}>改成填数字</Menu.Item>
          </>
        )}
        <Menu
          fit
          trigger={
            <button type="button" className={pickerClass}>
              {node.agg ? AGGREGATE_LABELS[node.agg] : "汇总"}
              <Caret />
            </button>
          }
        >
          {ops.map(op => (
            <Menu.Item key={op} onSelect={() => set(path, { ...node, agg: op })}>
              {AGGREGATE_LABELS[op]}
            </Menu.Item>
          ))}
        </Menu>
      </>
    );
  }

  const dropdown = menu(
    <button
      type="button"
      title="用某一列，或改成计算 / 条件"
      aria-label="更多选择"
      className="text-ink-3 hover:text-ink-1 border-line-1 h-full shrink-0 border-l px-2 text-[11px]"
    >
      ▾
    </button>
  );

  if (node.kind === "column")
    return (
      <span className={cn(control, "focus-within:border-accent pl-1")}>
        <span className="bg-accent-soft text-accent-text rounded-tau-sm text-tau-sm mx-0.5 inline-flex h-6 items-center gap-1 whitespace-nowrap pl-2 pr-1">
          {titleOf(node.columnId)}
          <button
            type="button"
            aria-label="改为直接输入"
            className="hover:bg-hover grid size-4 place-items-center rounded opacity-70 hover:opacity-100"
            onClick={() => set(path, emptyValue(slot))}
          >
            ×
          </button>
        </span>
        {dropdown}
      </span>
    );

  const value =
    node.kind === "number" || node.kind === "text" || node.kind === "date" ? node.value : "";
  const kind = slot === "number" ? "number" : slot === "date" ? "date" : "text";
  return (
    <span className={cn(control, "focus-within:border-accent")}>
      <input
        type={kind}
        aria-label={slot === "number" ? "数字" : slot === "date" ? "日期" : "文字"}
        placeholder={slot === "number" ? "数字" : slot === "text" ? "文字" : undefined}
        value={value}
        onChange={e => set(path, { kind, value: e.target.value })}
        className={cn(
          "text-ink-1 placeholder:text-ink-3 h-full bg-transparent px-2 outline-none",
          slot === "number" ? "w-[90px] tabular-nums" : slot === "date" ? "w-[140px]" : "w-[120px]"
        )}
      />
      {dropdown}
    </span>
  );
});
ValueBox.displayName = "FormulaValueBox";

const ValueSlot: React.FC<SlotProps> = props => {
  const { node, path, depth } = props;
  if (node.kind === "calc") return <CalcForm path={path} node={node} depth={depth + 1} />;
  if (node.kind === "if") return <IfForm path={path} node={node} depth={depth + 1} />;
  return <ValueBox {...props} />;
};

/** 嵌套的小表单：原地展开、带边框，层与层交替底色 */
const NestBox: React.FC<{
  label: string;
  depth: number;
  block?: boolean;
  onUnwrap: () => void;
  tail?: ReactNode;
  children: ReactNode;
}> = ({ label, depth, block, onUnwrap, tail, children }) => {
  const unwrap = (
    <button type="button" className={miniButton} title="不再嵌套，只保留第一项" onClick={onUnwrap}>
      撤销
    </button>
  );
  return (
    <div
      className={cn(
        "border-line-1 rounded-tau-md border",
        depth % 2 ? "bg-surface-hover" : "bg-surface",
        block
          ? "flex basis-full flex-col gap-2 px-2.5 py-2"
          : "inline-flex flex-wrap items-center gap-1.5 py-1 pl-2 pr-1"
      )}
    >
      {block ? (
        <div className="flex items-center">
          <span className="text-ink-3 text-tau-tiny">{label}</span>
          <span className="ml-auto">{unwrap}</span>
        </div>
      ) : (
        <span className="text-ink-3 text-tau-tiny">{label}</span>
      )}
      {children}
      {!block && tail}
      {!block && unwrap}
    </div>
  );
};

/* ───────── 计算 ───────── */

const OpMenu: React.FC<{
  trigger: React.ReactElement;
  current?: BinaryOp;
  onPick: (op: BinaryOp) => void;
}> = ({ trigger, current, onPick }) => (
  <Menu fit trigger={trigger}>
    {OPS.map(([op, sign, name]) => (
      <Menu.Item
        key={op}
        icon={<span className="w-3 text-center font-semibold">{sign}</span>}
        className={op === current ? "text-accent-text" : undefined}
        onSelect={() => onPick(op)}
      >
        {name}
      </Menu.Item>
    ))}
  </Menu>
);

/** 撤销嵌套：条件左侧只能是列，其他位置保留第一项 */
function unwrapValue(path: Path, first: ValueNode): ValueNode {
  if (path[path.length - 1] !== "left") return first;
  return { kind: "column", columnId: first.kind === "column" ? first.columnId : "" };
}

const CalcForm: React.FC<{ path: Path; node: CalcNode; depth: number }> = ({
  path,
  node,
  depth,
}) => {
  const { set, edit } = useBuilder();
  const addTerm = (op: BinaryOp) =>
    edit<CalcNode>(path, draft => void draft.terms.push({ op, value: emptyValue("number") }));
  const removeTerm = (index: number) =>
    edit<CalcNode>(path, draft => {
      draft.terms.splice(index, 1);
      delete draft.terms[0].op;
    });

  const terms = node.terms.map((term, index) => (
    <span key={index} className="inline-flex flex-wrap items-center gap-1.5">
      {index > 0 && (
        <OpMenu
          current={term.op}
          onPick={op => set([...path, "terms", index, "op"], op)}
          trigger={
            <button
              type="button"
              aria-label="运算"
              className={cn(pickerClass, "min-w-10 justify-center px-2 font-semibold")}
            >
              {OP_SIGN[term.op ?? "+"]}
            </button>
          }
        />
      )}
      <ValueSlot
        path={[...path, "terms", index, "value"]}
        node={term.value}
        slot="number"
        depth={depth}
      />
      {node.terms.length > 1 && (
        <button
          type="button"
          className={removeButton}
          aria-label="移除这一项"
          onClick={() => removeTerm(index)}
        >
          ×
        </button>
      )}
    </span>
  ));

  if (depth === 0)
    return (
      <>
        <div className="flex flex-wrap items-center gap-1.5">{terms}</div>
        <OpMenu
          onPick={addTerm}
          trigger={
            <button type="button" className={linkButton}>
              ＋ 再加一项
            </button>
          }
        />
      </>
    );
  return (
    <NestBox
      label="计算"
      depth={depth}
      onUnwrap={() => set(path, unwrapValue(path, node.terms[0].value))}
      tail={
        <OpMenu
          onPick={addTerm}
          trigger={
            <button type="button" className={miniButton} aria-label="再加一项">
              ＋
            </button>
          }
        />
      }
    >
      {terms}
    </NestBox>
  );
};

/* ───────── 按条件显示 ───────── */

const ConditionRow: React.FC<{
  path: Path;
  cond: Condition;
  depth: number;
  lead: ReactNode;
  onRemove?: () => void;
}> = ({ path, cond, depth, lead, onRemove }) => {
  const { columns, usable, familyOf, edit } = useBuilder();
  const leftColumn =
    cond.left.kind === "column"
      ? columns.find(column => column.id === (cond.left as { columnId: string }).columnId)
      : undefined;
  const family: CompareFamily =
    cond.left.kind === "calc" ? "number" : ((leftColumn && familyOf(leftColumn.id)) ?? "text");
  const compares = COMPARES[family];
  const options =
    family === "select"
      ? ((leftColumn?.config as { options?: SelectOption[] } | undefined)?.options ?? [])
      : undefined;

  const setLeft = (left: Condition["left"]) =>
    edit<Condition>(path, draft => {
      draft.left = left;
      const next: CompareFamily =
        left.kind === "calc" ? "number" : (familyOf(left.columnId) ?? "text");
      if (!COMPARES[next].some(([key]) => key === draft.cmp)) draft.cmp = COMPARES[next][0][0];
      draft.value = emptyValue(slotForFamily(next));
    });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-ink-2 text-tau-body w-[58px] shrink-0">{lead}</span>
      {cond.left.kind === "calc" ? (
        <CalcForm path={[...path, "left"]} node={cond.left} depth={depth + 1} />
      ) : (
        <Menu
          fit
          trigger={
            <button
              type="button"
              className={cn(pickerClass, !leftColumn && "text-ink-3 border-dashed")}
            >
              {leftColumn?.title ?? "选择列"}
              <Caret />
            </button>
          }
        >
          <ColumnItems
            columns={usable.filter(column => familyOf(column.id))}
            current={leftColumn?.id}
            onPick={id => setLeft({ kind: "column", columnId: id })}
          />
          {nestItems(
            depth,
            "number",
            () =>
              setLeft({
                kind: "calc",
                terms: [
                  {
                    value: leftColumn
                      ? { kind: "column", columnId: leftColumn.id }
                      : emptyValue("number"),
                  },
                  { op: "*", value: emptyValue("number") },
                ],
              }),
            false
          )}
        </Menu>
      )}
      <Menu
        fit
        trigger={
          <button type="button" className={pickerClass}>
            {compares.find(([key]) => key === cond.cmp)?.[1] ?? "选择"}
            <Caret />
          </button>
        }
      >
        {compares.map(([key, label]) => (
          <Menu.Item
            key={key}
            onSelect={() => edit<Condition>(path, draft => void (draft.cmp = key))}
          >
            {label}
          </Menu.Item>
        ))}
      </Menu>
      {!NO_VALUE.has(cond.cmp) && (
        <ValueSlot
          path={[...path, "value"]}
          node={cond.value}
          slot={slotForFamily(family)}
          depth={depth}
          options={options}
        />
      )}
      {onRemove && (
        <button type="button" className={removeButton} aria-label="移除条件" onClick={onRemove}>
          ×
        </button>
      )}
    </div>
  );
};

const IfForm: React.FC<{ path: Path; node: IfNode; depth: number }> = ({ path, node, depth }) => {
  const { usable, familyOf, set, edit } = useBuilder();
  const newCondition = (): Condition => {
    const first = usable.find(column => familyOf(column.id));
    const family = (first && familyOf(first.id)) || "text";
    return {
      left: { kind: "column", columnId: first?.id ?? "" },
      cmp: COMPARES[family][0][0],
      value: emptyValue(slotForFamily(family)),
    };
  };

  const body = (
    <>
      {node.cases.map((item, caseIndex) => {
        const casePath = [...path, "cases", caseIndex];
        return (
          <div
            key={caseIndex}
            className="border-line-1 rounded-tau-md flex flex-col gap-2 border px-3 py-2.5"
          >
            <div className="text-ink-3 text-tau-sm flex items-center">
              情况 {caseIndex + 1}
              {node.cases.length > 1 && (
                <button
                  type="button"
                  className={cn(miniButton, "ml-auto")}
                  onClick={() => edit<IfNode>(path, draft => void draft.cases.splice(caseIndex, 1))}
                >
                  删除这种情况
                </button>
              )}
            </div>
            {item.conds.map((cond, condIndex) => (
              <ConditionRow
                key={condIndex}
                path={[...casePath, "conds", condIndex]}
                cond={cond}
                depth={depth}
                onRemove={
                  item.conds.length > 1
                    ? () => edit<Case>(casePath, draft => void draft.conds.splice(condIndex, 1))
                    : undefined
                }
                lead={
                  condIndex === 0 ? (
                    "如果"
                  ) : (
                    <button
                      type="button"
                      title="点击切换「并且 / 或者」"
                      className="bg-accent-soft text-accent-text rounded-tau-sm text-tau-sm h-6 px-2"
                      onClick={() => set([...casePath, "join"], item.join === "and" ? "or" : "and")}
                    >
                      {item.join === "and" ? "并且" : "或者"}
                    </button>
                  )
                }
              />
            ))}
            <button
              type="button"
              className={cn(linkButton, "ml-[52px]")}
              onClick={() => edit<Case>(casePath, draft => void draft.conds.push(newCondition()))}
            >
              ＋ 再加一个条件
            </button>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-ink-2 text-tau-body w-[58px] shrink-0">显示</span>
              <ValueSlot
                path={[...casePath, "result"]}
                node={item.result}
                slot={node.slot}
                depth={depth}
              />
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className={linkButton}
        onClick={() =>
          edit<IfNode>(
            path,
            draft =>
              void draft.cases.push({
                join: "and",
                conds: [newCondition()],
                result: emptyValue(node.slot),
              })
          )
        }
      >
        ＋ 再加一种情况
      </button>
      <div className="flex flex-wrap items-center gap-1.5 px-3">
        <span className="text-ink-2 text-tau-body shrink-0">都不满足时显示</span>
        <ValueSlot
          path={[...path, "otherwise"]}
          node={node.otherwise}
          slot={node.slot}
          depth={depth}
        />
      </div>
    </>
  );

  if (depth === 0) return body;
  return (
    <NestBox label="条件" depth={depth} block onUnwrap={() => set(path, node.cases[0].result)}>
      {body}
    </NestBox>
  );
};

const ConcatForm: React.FC<{ node: ConcatNode }> = ({ node }) => {
  const { edit } = useBuilder();
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {node.parts.map((part, index) => (
          <span key={index} className="inline-flex items-center gap-1.5">
            {index > 0 && <span className="text-ink-3">＋</span>}
            <ValueSlot path={["parts", index]} node={part} slot="text" depth={0} />
            {node.parts.length > 1 && (
              <button
                type="button"
                className={removeButton}
                aria-label="移除这一段"
                onClick={() => edit<ConcatNode>([], draft => void draft.parts.splice(index, 1))}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      <button
        type="button"
        className={linkButton}
        onClick={() => edit<ConcatNode>([], draft => void draft.parts.push(emptyValue("text")))}
      >
        ＋ 再加一段
      </button>
    </>
  );
};

/* ───────── 根 ───────── */

const INTENTS = [
  {
    mode: "calc",
    icon: "±",
    title: "计算",
    text: "几列或数字之间加减乘除",
    example: "例：成本 × 数量",
  },
  {
    mode: "if",
    icon: "?",
    title: "按条件显示",
    text: "满足某个条件就显示某个值",
    example: "例：成本大于 500 显示「高」",
  },
  {
    mode: "concat",
    icon: "“",
    title: "拼接文字",
    text: "把几列的内容连成一段文字",
    example: "例：任务 · 状态",
  },
] as const;

interface FormulaBuilderProps {
  scope: FormulaScope;
  value: FormulaForm;
  onChange: (value: FormulaForm) => void;
  columns: ColumnDef[];
  /** 预览用：row 作用域取前几行，footer 作用域对全部（筛选后）行汇总 */
  rows: RowData[];
  pluginManager: PluginManager;
  /** 正在编辑的公式列（不能引用自身） */
  selfColumnId?: string;
  /** 预览表头里结果列的名字 */
  resultLabel?: string;
  /** 保存时的检查结果 */
  error?: string | null;
}

const PREVIEW_ROWS = 5;

const FormulaBuilder: React.FC<FormulaBuilderProps> = ({
  scope,
  value,
  onChange,
  columns,
  rows,
  pluginManager,
  selfColumnId,
  resultLabel,
  error,
}) => {
  const ctx = useMemo(() => createFormulaContext(columns, pluginManager), [columns, pluginManager]);
  const builder = useMemo<BuilderContextValue>(() => {
    const familyOf = (columnId: string): CompareFamily | undefined => {
      const column = columns.find(item => item.id === columnId);
      if (column && pluginManager.hasCapability(column.type, "singleOption")) return "select";
      return ctx.resolveColumn(columnId)?.valueType;
    };
    return {
      scope,
      columns,
      ctx,
      pluginManager,
      familyOf,
      usable: columns.filter(
        column => column.id !== selfColumnId && ctx.resolveColumn(column.id) !== undefined
      ),
      set: (path, next) =>
        onChange(
          produce(value, draft => {
            const parent = getAt(draft, path.slice(0, -1)) as Record<string | number, unknown>;
            parent[path[path.length - 1]] = next;
          })
        ),
      edit: (path, recipe) =>
        onChange(produce(value, draft => void recipe(getAt(draft, path) as never))),
    };
  }, [scope, columns, ctx, pluginManager, selfColumnId, value, onChange]);

  const draft = useMemo(() => formToExpr(value, scope), [value, scope]);
  const editable = value !== null && value.kind !== "unsupported";
  const complete = editable && !hasHole(draft);
  const check = useMemo(
    () =>
      complete ? checkFormula(draft, scope, columns, rows, pluginManager, selfColumnId) : null,
    [complete, draft, scope, columns, rows, pluginManager, selfColumnId]
  );
  const message = error ?? (check && !check.ok ? check.message : null);

  const startWith = (mode: (typeof INTENTS)[number]["mode"]) => {
    const firstOf = (match: (family: CompareFamily) => boolean) => {
      for (const column of builder.usable) {
        const family = builder.familyOf(column.id);
        if (family && match(family)) return { id: column.id, family };
      }
      return undefined;
    };
    onChange(
      newForm(
        mode,
        scope,
        mode === "if"
          ? firstOf(() => true)
          : mode === "calc"
            ? firstOf(f => f === "number")
            : undefined
      )
    );
  };

  let main: ReactNode;
  if (!value)
    main = (
      <>
        <b className="text-tau-body font-semibold">想算什么？</b>
        <div className="grid grid-cols-3 gap-2.5">
          {INTENTS.map(intent => (
            <button
              key={intent.mode}
              type="button"
              aria-label={intent.title}
              onClick={() => startWith(intent.mode)}
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
    );
  else if (value.kind === "unsupported")
    main = (
      <div className="flex flex-col items-start gap-3">
        <p className="text-ink-2 text-tau-body">
          这个公式比构造器能表达的更复杂。可以保留原样，或者重新设置。
        </p>
        <button
          type="button"
          className={linkButton}
          onClick={() => (scope === "footer" ? startWith("calc") : onChange(null))}
        >
          重新设置
        </button>
      </div>
    );
  else
    main = (
      <>
        <div className="flex items-center">
          <b className="text-tau-body font-semibold">
            {value.kind === "calc" ? "计算" : value.kind === "if" ? "按条件显示" : "拼接文字"}
          </b>
          {scope === "row" && (
            <button
              type="button"
              className="text-ink-3 hover:text-ink-1 text-tau-sm ml-auto"
              onClick={() => onChange(null)}
            >
              换一种
            </button>
          )}
        </div>
        {value.kind === "calc" && <CalcForm path={[]} node={value} depth={0} />}
        {value.kind === "if" && <IfForm path={[]} node={value} depth={0} />}
        {value.kind === "concat" && <ConcatForm node={value} />}
        <p className="text-ink-2 text-tau-sm bg-surface-hover rounded-tau-sm px-3 py-2 leading-[1.8]">
          {describeForm(value, scope, columns, builder.familyOf)}
        </p>
      </>
    );

  return (
    <BuilderContext.Provider value={builder}>
      <div className="border-line-1 rounded-tau-md flex flex-col overflow-hidden border">
        <div className="flex min-w-0 flex-col gap-3.5 p-4">
          <AssistBar
            scope={scope}
            columns={columns}
            rows={rows}
            pluginManager={pluginManager}
            selfColumnId={selfColumnId}
            usable={builder.usable}
            onGenerated={onChange}
          />
          {main}
          {message && <p className="text-danger text-tau-sm">{message}</p>}
        </div>
        {value && value.kind !== "unsupported" && (
          <Preview
            scope={scope}
            draft={check?.ok ? (draft as Expr) : null}
            output={check?.ok ? check.output : undefined}
            footerText={check?.ok ? check.footerText : undefined}
            columns={columns}
            rows={rows}
            ctx={ctx}
            pluginManager={pluginManager}
            selfColumnId={selfColumnId}
            resultLabel={resultLabel}
            hint="填完后在这里看结果"
          />
        )}
      </div>
    </BuilderContext.Provider>
  );
};

/** 一句话描述生成公式；宿主未提供模型能力时不显示 */
const AssistBar: React.FC<{
  scope: FormulaScope;
  columns: ColumnDef[];
  rows: RowData[];
  pluginManager: PluginManager;
  selfColumnId?: string;
  usable: ColumnDef[];
  onGenerated: (form: FormulaForm) => void;
}> = ({ scope, columns, rows, pluginManager, selfColumnId, usable, onGenerated }) => {
  const slots = useDatabaseSlots();
  const assist = slots.useFormulaAssist?.();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  if (!assist) return null;

  const run = async () => {
    if (!prompt.trim() || loading) return;
    const current = ++version.current;
    setLoading(true);
    setError(null);
    const result = await generateFormula({
      prompt,
      scope,
      columns,
      usable,
      rows,
      plugins: pluginManager,
      selfColumnId,
      ask: assist,
    });
    if (current !== version.current) return;
    setLoading(false);
    if (result.ok) onGenerated(result.form);
    else setError(result.message);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="border-line-1 bg-surface focus-within:border-accent rounded-tau-md flex h-10 items-center gap-2 border pl-3 pr-1">
        <Sparkles className="text-ink-3 size-4 shrink-0" strokeWidth={1.75} />
        <input
          aria-label="用一句话描述公式"
          value={prompt}
          disabled={loading}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void run();
            }
          }}
          placeholder={
            scope === "row"
              ? "用一句话描述，例如：成本乘数量超过 500 就显示「高」"
              : "用一句话描述，例如：成本总和除以任务数"
          }
          className="text-ink-1 placeholder:text-ink-3 text-tau-body min-w-0 flex-1 bg-transparent outline-none"
        />
        <button
          type="button"
          disabled={!prompt.trim() || loading}
          onClick={() => void run()}
          className="bg-accent text-ink-inverse hover:bg-accent-hover rounded-tau-sm text-tau-sm h-8 shrink-0 px-3 transition-colors disabled:opacity-40"
        >
          {loading ? "生成中…" : "生成"}
        </button>
      </div>
      {error && <p className="text-danger text-tau-sm">{error}</p>}
    </div>
  );
};

const Preview: React.FC<{
  scope: FormulaScope;
  draft: Expr | null;
  output?: Parameters<typeof formatScalar>[1];
  footerText?: string;
  columns: ColumnDef[];
  rows: RowData[];
  ctx: FormulaContext;
  pluginManager: PluginManager;
  selfColumnId?: string;
  resultLabel?: string;
  hint: string;
}> = ({
  scope,
  draft,
  output,
  footerText,
  columns,
  rows,
  ctx,
  pluginManager,
  selfColumnId,
  resultLabel,
  hint,
}) => {
  const previewId = selfColumnId ?? "__formula_preview__";
  const primary = columns.find(column => column.isPrimary);
  const table = useMemo(() => {
    if (scope !== "row" || !draft || !output) return null;
    const derive = getRowDeriver(
      formulaColumnsWith(columns, previewId, draft, output),
      pluginManager
    );
    const shown = referencedColumns(draft)
      .filter(id => id !== primary?.id)
      .flatMap(id => {
        const ref = ctx.resolveColumn(id);
        return ref ? [ref] : [];
      })
      .slice(0, 4);
    const enumValues = output === "text" ? formulaEnumOf(draft) : null;
    return {
      shown,
      enumValues,
      rows: rows.slice(0, PREVIEW_ROWS).map(row => {
        const cell = derive?.(row)[previewId];
        return {
          id: row.id,
          label: primary ? String(row[primary.id] ?? "") : row.id,
          values: shown.map(ref => formatScalar(ref.read(row), ref.valueType) || "—"),
          result:
            isFormulaCell(cell) && !cell.error ? formatScalar(cell.value, output) || "—" : "—",
          error: isFormulaCell(cell) ? cell.error : undefined,
        };
      }),
    };
  }, [scope, draft, output, columns, previewId, pluginManager, primary, ctx, rows]);

  let body: ReactNode = <span className="text-ink-3 text-tau-sm">{hint}</span>;
  if (scope === "footer" && footerText)
    body = (
      <span className="text-ink-1 text-tau-title font-semibold tabular-nums">{footerText}</span>
    );
  if (table)
    body = (
      <table className="text-tau-sm w-full border-collapse">
        <thead>
          <tr className="text-ink-3 border-line-1 border-b text-left">
            <th className="py-1 pr-1 font-medium">{primary?.title ?? "行"}</th>
            {table.shown.map(ref => (
              <th key={ref.id} className="py-1 pr-1 text-right font-medium">
                {ref.title}
              </th>
            ))}
            <th className="py-1 text-right font-medium">{resultLabel || "结果"}</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map(row => (
            <tr key={row.id} className="border-line-1 border-b border-dashed last:border-b-0">
              <td className="text-ink-2 max-w-[240px] truncate py-1 pr-1">
                {row.label || "未命名"}
              </td>
              {row.values.map((text, index) => (
                <td key={index} className="text-ink-2 py-1 pr-1 text-right tabular-nums">
                  {text}
                </td>
              ))}
              <td
                className="text-ink-1 py-1 text-right font-semibold tabular-nums"
                title={row.error}
              >
                {(() => {
                  const color = enumTagColor(table.enumValues, row.result);
                  return color ? (
                    <SelectList
                      className="justify-end"
                      options={[{ id: row.result, name: row.result, color }]}
                    />
                  ) : (
                    row.result
                  );
                })()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );

  return (
    <div className="border-line-1 bg-surface-hover flex min-w-0 flex-col gap-2 border-t px-4 py-3">
      <span className="text-ink-3 text-tau-tiny font-semibold tracking-[0.03em]">
        {scope === "row" ? `预览 · 前 ${PREVIEW_ROWS} 行` : "预览 · 当前筛选的行"}
      </span>
      {body}
    </div>
  );
};

export default FormulaBuilder;
