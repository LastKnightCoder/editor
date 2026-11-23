import { Element, Text, type Editor, type Path, type Range } from "slate";
import { ReactEditor } from "slate-react";
import type { PluginDecorationSource } from "@tau/plugins";
import type { DecorationHit, DesktopTextDecorations } from "@/app/plugins/text-decorations";

interface Part {
  path: Path;
  text: string;
  start: number;
}
interface Run {
  blockType: string;
  parts: Part[];
  text: string;
}

// 相邻格式叶子属于同一段，链接、代码和嵌套块都是边界。
function textRuns(editor: Editor, root: Element) {
  const runs: Run[] = [];
  function visit(element: Element, path: Path) {
    if (editor.isVoid(element) || editor.isInline(element) || element.type === "code-block") return;
    let run: Run | undefined;
    element.children.forEach((child, index) => {
      const childPath = [...path, index];
      if (Text.isText(child) && !child.code) {
        if (!child.text) return;
        if (!run) {
          run = { blockType: element.type, parts: [], text: "" };
          runs.push(run);
        }
        run.parts.push({ path: childPath, text: child.text, start: run.text.length });
        run.text += child.text;
      } else {
        run = undefined;
        if (Element.isElement(child)) visit(child, childPath);
      }
    });
  }
  visit(root, []);
  return runs;
}

async function resolveRanges(
  editor: Editor,
  element: Element,
  registry: DesktopTextDecorations,
  source: PluginDecorationSource,
  signal: AbortSignal
) {
  const groups = await Promise.all(
    textRuns(editor, element).map(async run => {
      const hits = await registry.resolve(
        Object.freeze({ source, blockType: run.blockType, text: run.text }),
        signal
      );
      // 起点落在下一片的开头，终点落在上一片的末尾，避免范围多出一个空叶子。
      const locate = (offset: number, end: boolean) => {
        const part =
          run.parts.find(({ start, text }) =>
            end ? start < offset && offset <= start + text.length : offset < start + text.length
          ) ?? run.parts[run.parts.length - 1];
        return { path: part.path, offset: offset - part.start };
      };
      return hits.flatMap(hit => {
        const whole = {
          anchor: locate(hit.start, false),
          focus: locate(hit.end, true),
          tauPluginDecoration: hit,
        };
        const ranges: Range[] = [whole];
        // 圆点只画在最后一个字符上；装饰被格式切成多片时也只有一个圆点。
        if (hit.appearance === "dot") {
          const pair = hit.end - hit.start > 1 && /[\uDC00-\uDFFF]/.test(run.text[hit.end - 1]);
          const tail = {
            anchor: locate(hit.end - (pair ? 2 : 1), false),
            focus: locate(hit.end, true),
            tauPluginDecorationTail: true,
          };
          ranges.push(tail);
        }
        return ranges;
      });
    })
  );
  return groups.flat();
}

interface Block {
  editor: Editor;
  element: Element;
  visible: boolean;
  controller?: AbortController;
  ranges?: Range[];
}

export class TextDecorationView {
  private readonly blocks = new Map<Element, Block>();
  private readonly hits = new WeakMap<HTMLElement, DecorationHit>();
  private readonly elements = new WeakMap<DecorationHit, Set<HTMLElement>>();
  /** DecorationLayer 挂载后接管悬停提示、忙碌态、候选菜单与错误提示。 */
  layer?: {
    hover(hit: DecorationHit, element: HTMLElement | null): void;
    activate(hit: DecorationHit, element: HTMLElement): void;
  };
  private readonly targets = new Map<HTMLElement, Block>();
  private observer?: IntersectionObserver;
  private revision = 0;
  private listener?: () => void;
  private frame?: number;

  constructor(
    private readonly registry: DesktopTextDecorations,
    private readonly source: PluginDecorationSource
  ) {}

  get enabled() {
    return this.registry.hasProviders(this.source);
  }
  snapshot = () => this.revision;
  subscribe = (listener: () => void) => {
    this.listener = listener;
    this.revision++;
    const unsubscribe = this.registry.subscribe(this.source, () => {
      for (const block of this.blocks.values()) {
        block.controller?.abort();
        block.controller = undefined;
        block.ranges = undefined;
        if (this.enabled && block.visible) this.schedule(block);
      }
      this.revision++;
      listener();
    });
    return () => {
      unsubscribe();
      this.listener = undefined;
      if (this.frame !== undefined) cancelAnimationFrame(this.frame);
      this.frame = undefined;
    };
  };

  ranges(element: Element, path: Path): Range[] {
    return (
      this.blocks.get(element)?.ranges?.map(range => ({
        ...range,
        anchor: { ...range.anchor, path: [...path, ...range.anchor.path] },
        focus: { ...range.focus, path: [...path, ...range.focus.path] },
      })) ?? []
    );
  }

  bind(element: HTMLElement, hit: DecorationHit) {
    this.hits.set(element, hit);
    let set = this.elements.get(hit);
    if (!set) this.elements.set(hit, (set = new Set()));
    set.add(element);
    return () => {
      this.hits.delete(element);
      set.delete(element);
    };
  }
  hitOf(element: HTMLElement) {
    return this.hits.get(element);
  }
  /** 同一装饰被格式切成多片时，悬停、忙碌等状态要落在每一片上。 */
  elementsOf(hit: DecorationHit) {
    return [...(this.elements.get(hit) ?? [])];
  }

  observe(editor: Editor, element: Element) {
    const dom = ReactEditor.toDOMNode(editor, element);
    const block: Block = { editor, element, visible: false };
    this.blocks.set(element, block);
    this.targets.set(dom, block);
    if (!this.observer && typeof IntersectionObserver !== "undefined") {
      this.observer = new IntersectionObserver(
        entries => {
          for (const entry of entries) {
            const current = this.targets.get(entry.target as HTMLElement);
            if (!current) continue;
            current.visible = entry.isIntersecting;
            if (current.visible) this.schedule(current);
          }
        },
        { rootMargin: "200px" }
      );
    }
    if (this.observer) this.observer.observe(dom);
    else {
      block.visible = true;
      this.schedule(block);
    }
    return () => {
      this.targets.delete(dom);
      this.blocks.delete(element);
      this.observer?.unobserve(dom);
      block.controller?.abort();
    };
  }

  private schedule(block: Block) {
    if (block.controller || !this.enabled) return;
    const controller = new AbortController();
    block.controller = controller;
    const { signal } = controller;
    const run = async () => {
      if (signal.aborted) return;
      if (!block.visible) {
        block.controller = undefined;
        return;
      }
      if (ReactEditor.isComposing(block.editor)) {
        ReactEditor.toDOMNode(block.editor, block.editor).addEventListener(
          "compositionend",
          () => queueMicrotask(() => void run()),
          { once: true, signal }
        );
        return;
      }
      const ranges = await resolveRanges(
        block.editor,
        block.element,
        this.registry,
        this.source,
        signal
      );
      if (signal.aborted) return;
      block.ranges = ranges;
      if (ranges.length && this.frame === undefined) {
        this.frame = requestAnimationFrame(() => {
          this.frame = undefined;
          this.revision++;
          this.listener?.();
        });
      }
    };
    const timer = setTimeout(() => void run(), 100);
    signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  }
}
