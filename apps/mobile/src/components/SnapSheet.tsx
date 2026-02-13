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
import { PanContainer, type PanContainerProps } from "./PanContainer";
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

function resolveInitialState(
  state: SnapSheetState | undefined,
  defaultState: SnapSheetState | undefined,
  states: SnapSheetState[],
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
      <div
        className={cn(
          "h-1 w-10 rounded-full bg-gray-300 dark:bg-neutral-600",
          props.indicatorClassName,
        )}
      />
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
        ref={(node) => {
          context.scrollRef.current = node;
          setRefValue(forwardedRef, node);
        }}
        className={cn(
          "mobile-kb-scroll min-h-0 flex-1 overflow-y-auto",
          className,
        )}
      />
    );
  },
);

const SnapSheetFixedFooterScroll = forwardRef<
  HTMLDivElement,
  SnapSheetScrollProps
>(function SnapSheetFixedFooterScroll(props, forwardedRef) {
  const context = useRequiredSnapSheetContext();
  const { className, ...restProps } = props;
  return (
    <div
      {...restProps}
      ref={(node) => {
        context.scrollRef.current = node;
        setRefValue(forwardedRef, node);
      }}
      className={cn(
        "mobile-fixed-footer-scroll min-h-0 flex-1 overflow-y-auto",
        className,
      )}
    />
  );
});

SnapSheetScroll.displayName = "SnapSheet.Scroll";
SnapSheetFixedFooterScroll.displayName = "SnapSheet.FixedFooterScroll";

function SnapSheetRoot(props: SnapSheetProps) {
  const states = useMemo(() => resolveStates(props.states), [props.states]);
  const controlled = typeof props.state === "string";
  const [internalState, setInternalState] = useState<SnapSheetState>(() =>
    resolveInitialState(props.state, props.defaultState, states),
  );
  const [timeline, setTimeline] = useState<PanTimeline | null>(null);
  const internalScrollRef = useRef<HTMLDivElement | null>(null);

  const stateCandidate = controlled ? props.state : internalState;
  const currentState = states.includes(stateCandidate as SnapSheetState)
    ? (stateCandidate as SnapSheetState)
    : (states[0] ?? "normal");
  const scrollRef = props.scrollRef ?? internalScrollRef;

  const heights: PanContainerProps["heights"] = {
    normal:
      typeof props.normalHeight === "number"
        ? props.normalHeight
        : DEFAULT_NORMAL_HEIGHT,
    ...(typeof props.miniHeight === "number" ? { mini: props.miniHeight } : {}),
  };

  const contextValue = useMemo<SnapSheetContextValue>(
    () => ({
      state: currentState,
      timeline,
      scrollRef,
    }),
    [currentState, scrollRef, timeline],
  );

  return (
    <PanContainer
      open={props.open}
      initialState={currentState}
      enabledStates={states}
      heights={heights}
      onRequestClose={props.onClose}
      onStateChange={(next, prev) => {
        if (!controlled) {
          setInternalState(next);
        }
        props.onStateChange?.(next, prev);
      }}
      onTimelineChange={(nextTimeline) => {
        setTimeline(nextTimeline);
        props.onTimelineChange?.(nextTimeline);
      }}
      className={props.className}
      maskClassName={props.maskClassName}
      containerClassName={props.containerClassName}
      scrollRef={scrollRef as RefObject<HTMLElement | null>}
    >
      <SnapSheetContext.Provider value={contextValue}>
        {props.children}
      </SnapSheetContext.Provider>
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
