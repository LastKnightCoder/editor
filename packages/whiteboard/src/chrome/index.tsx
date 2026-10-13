/**
 * 画布 chrome 公共件（D-049）：
 * 工具条 / 属性浮动条 / 状态栏 / 元素树等浮动件共用一套主题语言——
 * 实底 surface + shadow-lift + 1px 细描边，不用毛玻璃与蓝调；激活 = accent-soft，悬停 = bg-hover；
 * 组内分隔靠留白（ChromeGap），不画竖线。
 *
 * 属性控件（色板 / 滑杆 / 图示选项 / 分区头）是 setter 弹层的内容：色板与派生描边承载用户数据色
 * （完整保留），外壳装饰阴影用黑色 alpha——二者不另设 token，其余一律走主题变量。
 */

import {
  createContext,
  useContext,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  NumberInput,
  Popover,
  Segmented,
  Switch,
  Tooltip,
  cn,
  type TooltipPlacement,
} from "@tau/ui";

const stop = (e: SyntheticEvent) => e.stopPropagation();
/**
 * 浮动件内的指针 / 右键 / 按键不落到画布（画布容器在祖先上监听这些事件）。
 * wheel 必须走捕获：画布的滚轮缩放/平移挂在容器上的原生 addEventListener，
 * 先于 React root 的冒泡委托触发，冒泡期的合成事件 stopPropagation 到不了它前面；
 * 捕获阶段（React root）stopPropagation 会截断整条剩余传播路径，原生监听才收不到。
 */
export const stopCanvasEvents = {
  onPointerDown: stop,
  onPointerUp: stop,
  onMouseDown: stop,
  onMouseUp: stop,
  onClick: stop,
  onDoubleClick: stop,
  onWheelCapture: stop,
  // 焦点在浮动件按钮上时，Delete/Backspace 不冒泡到 document 的画布快捷键
  onKeyDown: stop,
  onContextMenu: (e: SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
  },
};

/* ───────── 浮动条 ───────── */

export function ChromeBar({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div
      {...stopCanvasEvents}
      {...rest}
      className={cn(
        "bg-surface shadow-lift ring-line-2 absolute z-[6] flex items-center gap-0.5 rounded-[12px] p-1 ring-1",
        className
      )}
    >
      {children}
    </div>
  );
}

/** 组间留白（替代竖分隔线） */
export function ChromeGap({ className }: { className?: string }) {
  return <span aria-hidden className={cn("size-2 flex-none", className)} />;
}

/**
 * 工具栏语境：激活态由滑动指示块承载底色，按钮只改文字色（悬停不加背景）；
 * 工具栏以外的 ChromeButton（属性条 / 状态栏）保持 accent-soft 底色的原激活态。
 */
export const ToolbarContext = createContext(false);

export interface ChromeButtonProps extends ComponentProps<"button"> {
  /** 提示与无障碍名 */
  label: string;
  /** 激活态（当前工具 / 开关已开） */
  active?: boolean;
  /** 带子菜单：右下角固定小三角（占位固定，悬停不改尺寸） */
  sub?: boolean;
  kbd?: string;
  tooltipPlacement?: TooltipPlacement;
}

/**
 * 浮动件图标按钮：30px，Tooltip 包在 button 外、ref 与注入的 props 透传到 button——
 * 所以可以直接作为 Menu / Popover 的 trigger。展开时（aria-expanded）按下态、并暂停提示。
 */
export function ChromeButton({
  label,
  active,
  sub,
  kbd,
  tooltipPlacement = "bottom",
  className,
  children,
  ref,
  ...rest
}: ChromeButtonProps) {
  const expanded = rest["aria-expanded"] === true;
  const inToolbar = useContext(ToolbarContext);
  return (
    <Tooltip
      content={
        kbd ? (
          <span className="flex items-center gap-2">
            {label}
            <kbd className="font-tau-mono text-[11px] opacity-70">{kbd}</kbd>
          </span>
        ) : (
          label
        )
      }
      placement={tooltipPlacement}
      arrow={false}
      disabled={expanded}
    >
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        {...rest}
        ref={ref}
        className={cn(
          "text-ink-2 relative inline-grid size-[30px] flex-none cursor-pointer place-items-center rounded-[8px]",
          "ease-tau-out transition-[background-color,color] duration-150",
          "hover:bg-hover hover:text-ink-1 aria-expanded:bg-press aria-expanded:text-ink-1",
          "disabled:pointer-events-none disabled:opacity-35",
          "[&_svg]:size-4 [&_svg]:shrink-0",
          active &&
            (inToolbar
              ? "text-accent-text hover:text-accent-text hover:bg-transparent"
              : "bg-accent-soft text-accent-text hover:bg-accent-soft hover:text-accent-text"),
          className
        )}
      >
        {children}
        {sub && (
          <span
            aria-hidden
            className="absolute bottom-[4px] right-[4px] size-0 rounded-[1px] border-[2.5px] border-transparent border-b-current border-r-current opacity-45"
          />
        )}
      </button>
    </Tooltip>
  );
}

/* ───────── 属性浮动条条目 ───────── */

/** 属性条的弹层方向：条在元素上方 → 向上展开；翻到元素下方 → 向下展开 */
export const AttrBarContext = createContext<{ side: "top" | "bottom" }>({ side: "top" });

export interface AttrPopoverProps {
  label: string;
  /** 条目图标；与 swatch 二选一 */
  icon?: ReactNode;
  /** 颜色条目用当前色的小圆点代替通用图标（数据色） */
  swatch?: SwatchLook;
  /** 分区头右侧的开关（开关型属性：开关放标题右侧，下面不再写同名开关） */
  toggle?: { checked: boolean; onChange: (v: boolean) => void };
  children?: ReactNode;
  /** 弹层宽度，默认 280 */
  width?: number;
}

export function AttrPopover({
  label,
  icon,
  swatch,
  toggle,
  children,
  width = 280,
}: AttrPopoverProps) {
  const { side } = useContext(AttrBarContext);
  return (
    <Popover
      placement={side}
      arrow={false}
      className="p-0"
      trigger={
        <ChromeButton label={label} tooltipPlacement={side}>
          {swatch ? <SwatchDot look={swatch} /> : icon}
        </ChromeButton>
      }
    >
      <div {...stopCanvasEvents} className="px-3.5 pb-3.5 pt-3" style={{ width }}>
        <SectionHead label={label} toggle={toggle} />
        {children}
      </div>
    </Popover>
  );
}

/** 纯开关项：点一下直接切换，按钮本身显示开 / 关 */
export function AttrToggle({
  label,
  icon,
  checked,
  onChange,
}: {
  label: string;
  icon: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const { side } = useContext(AttrBarContext);
  return (
    <ChromeButton
      label={label}
      tooltipPlacement={side}
      active={checked}
      onClick={() => onChange(!checked)}
    >
      {icon}
    </ChromeButton>
  );
}

/** 动作项：直接执行（适应内容 / 解散 / 对齐…） */
export function AttrAction({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { side } = useContext(AttrBarContext);
  return (
    <ChromeButton label={label} tooltipPlacement={side} onClick={onClick} disabled={disabled}>
      {icon}
    </ChromeButton>
  );
}

/* ───────── 属性控件 ───────── */

function SectionHead({
  label,
  toggle,
}: {
  label: string;
  toggle?: { checked: boolean; onChange: (v: boolean) => void };
}) {
  return (
    <div className="text-ink-1 mb-2.5 flex h-5 items-center text-[12.5px] font-semibold">
      <span className="flex-1">{label}</span>
      {toggle && (
        <Switch
          size="sm"
          checked={toggle.checked}
          onCheckedChange={toggle.onChange}
          aria-label={label}
        />
      )}
    </div>
  );
}

/** 弹层内的子字段：小标题 + 控件（纵向从属，不做左右两列） */
export function Field({
  label,
  value,
  children,
  className,
}: {
  label?: ReactNode;
  value?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("[&+&]:mt-3", className)}>
      {label != null && (
        <div className="text-ink-3 mb-1.5 flex min-h-[22px] items-center text-[11.5px]">
          <span className="flex-1">{label}</span>
          {value != null && <span className="text-ink-2 tabular-nums">{value}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

export interface SwatchLook {
  fill: string;
  stroke?: string;
  /** default = 「默认」（墨色环）；none = 无 / 透明（斜线） */
  kind?: "default" | "none";
}

function swatchStyle(look: SwatchLook): CSSProperties {
  if (look.kind === "none")
    return {
      background:
        "linear-gradient(135deg, transparent 45%, var(--tau-danger) 45%, var(--tau-danger) 55%, transparent 55%), var(--tau-bg-surface)",
      boxShadow: "inset 0 0 0 1px var(--tau-line-1)",
    };
  if (look.kind === "default")
    return { background: "var(--tau-bg-surface)", boxShadow: "inset 0 0 0 2px var(--tau-ink-1)" };
  const stroke = look.stroke ?? `color-mix(in srgb, ${look.fill}, #000 12%)`;
  return {
    background: look.fill,
    boxShadow: `inset 0 0 0 2px ${stroke}, 0 0 0 1px var(--tau-line-2)`,
  };
}

export function SwatchDot({ look }: { look: SwatchLook }) {
  return <span aria-hidden className="block size-4 rounded-full" style={swatchStyle(look)} />;
}

export interface SwatchOption extends SwatchLook {
  key: string;
  label: string;
}

/** 无当前自定义色时取色器的初始色：显式写死为 input[type=color] 的原生默认，避免被当成设计色维护 */
const NATIVE_COLOR_DEFAULT = "#000000";

/** 自定义色入口的彩虹环：取色器控件的通用功能视觉，色相环与主题无关 */
const RAINBOW_RING =
  "conic-gradient(#f87171, #fbbf24, #34d399, #60a5fa, #a78bfa, #f472b6, #f87171)";

/** 色板：22px 圆色块，选中 = surface 间隙 + accent 外环 */
export function SwatchRow({
  options,
  value,
  onChange,
  custom,
}: {
  options: SwatchOption[];
  value: string | null | undefined;
  onChange: (key: string) => void;
  /** 末尾「自定义颜色」 */
  custom?: { value?: string; onChange: (hex: string) => void };
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {/* 现状色板里有同色值的条目（如「粉」「红」共用描边色），key 带序号 */}
      {options.map((o, i) => (
        <Tooltip key={`${o.key}-${i}`} content={o.label} placement="top" arrow={false}>
          <button
            type="button"
            aria-label={o.label}
            aria-pressed={value === o.key}
            onClick={() => onChange(o.key)}
            className="ease-tau-out hover:outline-hover aria-pressed:outline-accent relative size-[22px] cursor-pointer rounded-full outline outline-2 outline-offset-2 outline-transparent transition-[outline-color] duration-150"
            style={swatchStyle(o)}
          />
        </Tooltip>
      ))}
      {custom && (
        <Tooltip content="自定义颜色" placement="top" arrow={false}>
          <label
            className="ring-line-2 relative size-[22px] cursor-pointer overflow-hidden rounded-full ring-1"
            style={{ background: RAINBOW_RING }}
          >
            <input
              type="color"
              aria-label="自定义颜色"
              value={
                custom.value && /^#[0-9a-f]{6}$/i.test(custom.value)
                  ? custom.value
                  : NATIVE_COLOR_DEFAULT
              }
              onChange={e => custom.onChange(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </Tooltip>
      )}
    </div>
  );
}

/** 滑杆：accent 轨道 + 右侧数值 */
export function Slider({
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
  onCommit,
  format,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  /** 拖动结束（需要合并为一次历史记录的调用方用） */
  onCommit?: (v: number) => void;
  format?: (v: number) => string;
  label?: string;
}) {
  const p = max === min ? 0 : ((value - min) / (max - min)) * 100;
  return (
    <div className="flex items-center gap-2.5">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        onPointerUp={e => onCommit?.(Number((e.target as HTMLInputElement).value))}
        onKeyUp={e => onCommit?.(Number((e.target as HTMLInputElement).value))}
        className={cn(
          "h-1 flex-1 cursor-pointer appearance-none rounded-full outline-none",
          "[&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full",
          "[&::-webkit-slider-thumb]:shadow-[0_0_0_1.5px_var(--tau-accent),0_1px_3px_rgba(0,0,0,0.18)]",
          "focus-visible:[&::-webkit-slider-thumb]:shadow-[0_0_0_1.5px_var(--tau-accent),var(--tau-focus-ring)]"
        )}
        style={{
          background: `linear-gradient(var(--tau-accent), var(--tau-accent)) 0 / ${p}% 100% no-repeat, var(--tau-bg-track)`,
        }}
      />
      <span className="text-ink-2 min-w-[34px] text-right text-[12px] tabular-nums">
        {format ? format(value) : `${value}${unit}`}
      </span>
    </div>
  );
}

/** 步进对齐 + 边界钳制；toPrecision 消掉小数 step 累加的浮点残渣（0.1 + 0.2） */
function snapStep(value: number, min: number, max: number, step: number) {
  const snapped = min + Math.round((value - min) / step) * step;
  return Number(Math.min(max, Math.max(min, snapped)).toPrecision(6));
}

/**
 * 步进器：− 按钮 / 数值输入 / + 按钮（档位按钮之外的精确微调）。
 * 单位后缀走 unit 文字：NumberInput 事前拦截只放行数字，后缀进输入框会被剥掉。
 */
export function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  unit,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  /** 输入框右侧紧贴的单位字（如 "%"） */
  unit?: string;
}) {
  return (
    <span className="bg-hover inline-flex h-[22px] items-center rounded-[7px]">
      <button
        type="button"
        aria-label={`减小${label}`}
        disabled={value <= min}
        onClick={() => onChange(snapStep(value - step, min, max, step))}
        className="text-ink-2 hover:text-ink-1 flex h-full w-5 cursor-pointer items-center justify-center text-[13px] disabled:pointer-events-none disabled:opacity-35"
      >
        −
      </button>
      <NumberInput
        variant="bare"
        size="sm"
        value={value}
        aria-label={label}
        onValueChange={v => {
          if (v != null) onChange(snapStep(v, min, max, step));
        }}
        wrapperClassName="w-[30px]"
        className="text-ink-1 text-center text-[12px] font-medium tabular-nums"
      />
      {unit && <span className="text-ink-3 pr-0.5 text-[11px]">{unit}</span>}
      <button
        type="button"
        aria-label={`增大${label}`}
        disabled={value >= max}
        onClick={() => onChange(snapStep(value + step, min, max, step))}
        className="text-ink-2 hover:text-ink-1 flex h-full w-5 cursor-pointer items-center justify-center text-[13px] disabled:pointer-events-none disabled:opacity-35"
      >
        +
      </button>
    </span>
  );
}

export interface OptionItem<V extends string> {
  value: V;
  label: string;
  /** 图示（线型 / 箭头端点 / 画框样式…）；不给则显示 label */
  glyph?: ReactNode;
  /** 图示 + 文字同时显示 */
  showLabel?: boolean;
}

/** 图示选项块：等宽网格，选中 = accent-soft + accent 描边 */
export function OptionGrid<V extends string>({
  options,
  value,
  onChange,
  cols,
  tall,
}: {
  options: OptionItem<V>[];
  value: V | null | undefined;
  onChange: (v: V) => void;
  cols?: number;
  /** 图块（上图下字，54px 高） */
  tall?: boolean;
}) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${cols ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map(o => {
        const on = value === o.value;
        const btn = (
          <button
            key={o.value}
            type="button"
            aria-label={o.label}
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "text-ink-2 inline-flex min-w-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] text-[12px]",
              "ring-line-1 ease-tau-out ring-1 ring-inset transition-[background-color,color] duration-150",
              "hover:bg-hover hover:text-ink-1",
              tall ? "h-[54px] flex-col gap-1 text-[11px]" : "h-8 px-1",
              on &&
                "bg-accent-soft text-accent-text ring-accent/45 hover:bg-accent-soft hover:text-accent-text font-medium",
              "[&_svg.g]:h-3.5 [&_svg.g]:w-6 [&_svg.g]:fill-none [&_svg.g]:stroke-current [&_svg.g]:[stroke-linecap:round] [&_svg.g]:[stroke-linejoin:round] [&_svg.g]:[stroke-width:1.6]"
            )}
          >
            {o.glyph}
            {(!o.glyph || o.showLabel || tall) && <span className="truncate">{o.label}</span>}
          </button>
        );
        return o.glyph && !o.showLabel && !tall ? (
          <Tooltip key={o.value} content={o.label} placement="top" arrow={false}>
            {btn}
          </Tooltip>
        ) : (
          btn
        );
      })}
    </div>
  );
}

/** 文字分段（连体描边 Segmented，满宽） */
export function Seg<V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: V; label?: string; icon?: import("lucide-react").LucideIcon }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <Segmented
      label={label}
      size="sm"
      value={value}
      onValueChange={v => onChange(v as V)}
      className="flex w-full [&>label]:flex-1 [&>label]:justify-center"
    >
      {options.map(o => (
        <Segmented.Item
          key={o.value}
          value={o.value}
          label={o.label}
          icon={o.icon}
          aria-label={o.label ? undefined : o.value}
        />
      ))}
    </Segmented>
  );
}

/** 小图示 svg（28×14 画布，stroke = currentColor） */
export function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg className="g" viewBox="0 0 28 14" aria-hidden>
      {children}
    </svg>
  );
}

/* 档位图示（OptionGrid 的 glyph 槽）：span + currentColor——OptionGrid 会给 svg.g
   强制 stroke，span 不受影响，选中态随按钮文字自动变 accent。 */

/** 线宽档位：横条高度 = 线宽（封顶 8px） */
export function LineWeightGlyph({ width }: { width: number }) {
  return (
    <span
      aria-hidden
      className="block w-6 rounded-full bg-current"
      style={{ height: Math.min(width, 8) }}
    />
  );
}

/** 圆角档位：左上折角的圆角 = radius / 2（封顶 10px）；0 即直角 */
export function CornerGlyph({ radius }: { radius: number }) {
  return (
    <span
      aria-hidden
      className="block size-3.5 border-l-2 border-t-2 border-current"
      style={{ borderTopLeftRadius: Math.min(radius / 2, 10) }}
    />
  );
}

/** 不透明度档位：色块浓度 = currentColor 与透明的混合 + 内嵌细描边 */
export function OpacityGlyph({ opacity }: { opacity: number }) {
  return (
    <span
      aria-hidden
      className="ring-current/40 block size-3.5 rounded-[4px] ring-1 ring-inset"
      style={{ background: `color-mix(in srgb, currentColor ${opacity * 100}%, transparent)` }}
    />
  );
}
