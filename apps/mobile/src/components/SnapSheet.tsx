import {
  createContext,
  forwardRef,
  type MutableRefObject,
  type ReactNode,
  type Ref,
  type RefObject,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMemoizedFn } from "ahooks";
import { PanContainer, type PanContainerProps } from "./PanContainer";
import { useSheetBackDismiss } from "../router/useSheetBackDismiss";
import type { PanState, PanTimeline } from "./panModel";

export type SnapSheetState = PanState;

type SnapSheetProps = {
  open: boolean;
  state?: SnapSheetState;
  defaultState?: SnapSheetState;
  states?: SnapSheetState[];
  normalHeight?: number;
  miniHeight?: number;
  onClose?: () => void;
  /**
   * 返回手势是否关闭本抽屉（默认 true，需提供 onClose）。
   * overlay 路由页的主体抽屉须传 false——其关闭即弹栈，返回语义由页面
   * backHandler/guard 或 router 弹栈定义，内置拦截会与其互喂死锁。
   */
  backDismiss?: boolean;
  onStateChange?: (next: SnapSheetState, prev: SnapSheetState) => void;
  onTimelineChange?: (timeline: PanTimeline) => void;
  className?: string;
  maskClassName?: string;
  containerClassName?: string;
  scrollRef?: MutableRefObject<HTMLDivElement | null>;
  children: ReactNode;
};

type SnapSheetHandleProps = {
  className?: string;
  indicatorClassName?: string;
};

type SnapSheetScrollProps = React.ComponentPropsWithoutRef<"div">;

type SnapSheetContextValue = {
  state: SnapSheetState;
  timeline: PanTimeline | null;
  scrollRef: MutableRefObject<HTMLDivElement | null>;
};

const DEFAULT_STATES: SnapSheetState[] = ["normal", "full"];
const DEFAULT_NORMAL_HEIGHT = 0.72;

const SnapSheetContext = createContext<SnapSheetContextValue | null>(null);

function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function setRefValue<T>(ref: Ref<T> | null | undefined, value: T): void {
  if (!ref) {
    return;
  }
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  (ref as MutableRefObject<T>).current = value;
}

function resolveStates(states?: SnapSheetState[]): SnapSheetState[] {
  if (!Array.isArray(states) || states.length === 0) {
    return DEFAULT_STATES;
  }
  return states;
}

// 调用方常内联传 states={["normal","full"]}（每次渲染新数组），这里按内容稳定引用，
// 避免 PanContainer 的 enabledStates/layout/timeline 链路因引用变化而反复重建。
function useStableStates(states?: SnapSheetState[]): SnapSheetState[] {
  const resolved = resolveStates(states);
  const ref = useRef(resolved);
  const prev = ref.current;
  const changed = prev.length !== resolved.length || prev.some((s, i) => s !== resolved[i]);
  if (changed) {
    ref.current = resolved;
  }
  return ref.current;
}

function resolveInitialState(
  state: SnapSheetState | undefined,
  defaultState: SnapSheetState | undefined,
  states: SnapSheetState[]
): SnapSheetState {
  if (state && states.includes(state)) {
    return state;
  }
  if (defaultState && states.includes(defaultState)) {
    return defaultState;
  }
  return states[0] ?? "normal";
}

function useRequiredSnapSheetContext(): SnapSheetContextValue {
  const context = useContext(SnapSheetContext);
  if (!context) {
    throw new Error("SnapSheet 子组件必须在 <SnapSheet> 内使用");
  }
  return context;
}

function SnapSheetHandle(props: SnapSheetHandleProps) {
  return (
    <div
      className={cn("flex justify-center py-3", props.className)}
      style={{ opacity: "calc(1 - var(--pan-progress-normal-full))" }}
    >
      <div className={cn("bg-line h-[5px] w-11 rounded-full", props.indicatorClassName)} />
    </div>
  );
}

const SnapSheetScroll = forwardRef<HTMLDivElement, SnapSheetScrollProps>(
  function SnapSheetScroll(props, forwardedRef) {
    const context = useRequiredSnapSheetContext();
    const { className, ...restProps } = props;
    return (
      <div
        {...restProps}
        ref={node => {
          context.scrollRef.current = node;
          setRefValue(forwardedRef, node);
        }}
        className={cn("mobile-kb-scroll min-h-0 flex-1 overflow-y-auto", className)}
      />
    );
  }
);

const SnapSheetFixedFooterScroll = forwardRef<HTMLDivElement, SnapSheetScrollProps>(
  function SnapSheetFixedFooterScroll(props, forwardedRef) {
    const context = useRequiredSnapSheetContext();
    const { className, ...restProps } = props;
    return (
      <div
        {...restProps}
        ref={node => {
          context.scrollRef.current = node;
          setRefValue(forwardedRef, node);
        }}
        className={cn("mobile-fixed-footer-scroll min-h-0 flex-1 overflow-y-auto", className)}
      />
    );
  }
);

SnapSheetScroll.displayName = "SnapSheet.Scroll";
SnapSheetFixedFooterScroll.displayName = "SnapSheet.FixedFooterScroll";

function SnapSheetRoot(props: SnapSheetProps) {
  const states = useStableStates(props.states);
  const controlled = typeof props.state === "string";
  const [internalState, setInternalState] = useState<SnapSheetState>(() =>
    resolveInitialState(props.state, props.defaultState, states)
  );
  const [timeline, setTimeline] = useState<PanTimeline | null>(null);
  const internalScrollRef = useRef<HTMLDivElement | null>(null);

  // onClose 缺失时无可关闭语义，不参与返回仲裁
  useSheetBackDismiss(
    props.backDismiss !== false && props.open && props.onClose !== undefined,
    () => props.onClose?.()
  );

  const stateCandidate = controlled ? props.state : internalState;
  const currentState = states.includes(stateCandidate as SnapSheetState)
    ? (stateCandidate as SnapSheetState)
    : (states[0] ?? "normal");
  const scrollRef = props.scrollRef ?? internalScrollRef;

  const heights = useMemo<PanContainerProps["heights"]>(
    () => ({
      normal: typeof props.normalHeight === "number" ? props.normalHeight : DEFAULT_NORMAL_HEIGHT,
      ...(typeof props.miniHeight === "number" ? { mini: props.miniHeight } : {}),
    }),
    [props.miniHeight, props.normalHeight]
  );

  const handleStateChange = useMemoizedFn((next: SnapSheetState, prev: SnapSheetState) => {
    if (!controlled) {
      setInternalState(next);
    }
    props.onStateChange?.(next, prev);
  });

  const handleTimelineChange = useMemoizedFn((nextTimeline: PanTimeline) => {
    setTimeline(prev => (Object.is(prev, nextTimeline) ? prev : nextTimeline));
    props.onTimelineChange?.(nextTimeline);
  });

  const contextValue = useMemo<SnapSheetContextValue>(
    () => ({
      state: currentState,
      timeline,
      scrollRef,
    }),
    [currentState, scrollRef, timeline]
  );

  return (
    <PanContainer
      open={props.open}
      initialState={currentState}
      enabledStates={states}
      heights={heights}
      onRequestClose={props.onClose}
      onStateChange={handleStateChange}
      onTimelineChange={handleTimelineChange}
      className={props.className}
      maskClassName={props.maskClassName}
      containerClassName={props.containerClassName}
      scrollRef={scrollRef as RefObject<HTMLElement | null>}
    >
      <SnapSheetContext.Provider value={contextValue}>{props.children}</SnapSheetContext.Provider>
    </PanContainer>
  );
}

export function useSnapSheetState(): SnapSheetState {
  return useRequiredSnapSheetContext().state;
}

export function useSnapSheetTimeline(): PanTimeline | null {
  return useRequiredSnapSheetContext().timeline;
}

export const SnapSheet = Object.assign(SnapSheetRoot, {
  Handle: SnapSheetHandle,
  Scroll: SnapSheetScroll,
  FixedFooterScroll: SnapSheetFixedFooterScroll,
});

export default SnapSheet;
