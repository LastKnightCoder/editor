import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DependencyList,
  type EffectCallback,
  type ReactNode,
} from "react";

class PageResources {
  constructor(
    private readonly parent: PageResources | null,
    public visible: boolean
  ) {}

  isVisible(): boolean {
    return this.visible && (this.parent?.isVisible() ?? true);
  }
  private readonly effects = new Map<
    object,
    {
      dependencies: DependencyList;
      cleanup: ReturnType<EffectCallback>;
    }
  >();

  update(slot: object, setup: EffectCallback, dependencies: DependencyList) {
    const previous = this.effects.get(slot);
    if (
      previous &&
      previous.dependencies.length === dependencies.length &&
      dependencies.every((value, index) => Object.is(value, previous.dependencies[index]))
    )
      return;
    previous?.cleanup?.();
    this.effects.set(slot, { dependencies, cleanup: setup() });
  }

  clear() {
    const effects = [...this.effects.values()];
    this.effects.clear();
    for (const effect of effects.reverse()) effect.cleanup?.();
  }

  release(slot: object) {
    const effect = this.effects.get(slot);
    this.effects.delete(slot);
    effect?.cleanup?.();
  }
}

const ResourceContext = createContext<PageResources | null>(null);

/** 放在 Activity 外：隐藏保留会话，内容淘汰和真正卸载才释放。 */
export function PageResourceScope({
  active = true,
  visible = true,
  children,
}: {
  active?: boolean;
  visible?: boolean;
  children: ReactNode;
}) {
  const parent = useContext(ResourceContext);
  const [resources] = useState(() => new PageResources(parent, visible));
  useLayoutEffect(() => {
    resources.visible = visible;
  }, [resources, visible]);
  usePageResourceEffect(() => () => resources.clear(), [resources, active]);
  return <ResourceContext.Provider value={resources}>{children}</ResourceContext.Provider>;
}

/** 文档会话的存在级 effect；普通订阅和编辑器连接仍使用 useEffect。 */
export function usePageResourceEffect(setup: EffectCallback, dependencies: DependencyList) {
  const resources = useContext(ResourceContext);
  const slot = useRef({});
  useEffect(() => {
    if (!resources) return setup();
    const currentSlot = slot.current;
    resources.update(currentSlot, setup, dependencies);
    return () => {
      if (resources.isVisible()) resources.release(currentSlot);
    };
    // Activity 隐藏会清理组件 effect，资源归外层页面内容作用域持有。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resources, ...dependencies]);
}

export function usePageResourceReset() {
  const resources = useContext(ResourceContext);
  return () => resources?.clear();
}
