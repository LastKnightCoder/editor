import type {
  PluginContext,
  PluginDecorationBlock,
  PluginDecorationPreviewTarget,
  PluginContentSnapshot,
  PluginDecorationSource,
  PluginTextDecorationAppearance,
  PluginTextDecorationCandidate,
  PluginTextDecorationProvider,
  PluginTextDecorationTone,
} from "@tau/plugins";
import type { DataAdapter } from "@tau/plugins/host";
import type { DesktopPermissionBroker } from "./permissions";

const appearances = new Set<string>(["reference", "ghost", "marker", "tint", "wavy", "dot"]);
const clickable = new Set<string>(["reference", "ghost", "dot"]);
const tones = new Set<string>(["accent", "info", "warn", "muted"]);
// 旧插件包仍可能返回第一版外观名。
const legacy: Record<string, PluginTextDecorationAppearance> = {
  link: "reference",
  highlight: "marker",
};

export type DecorationActivation = (
  choice?: string
) => Promise<readonly PluginTextDecorationCandidate[] | undefined>;

export interface DecorationPreview {
  target: PluginDecorationPreviewTarget;
  title: string;
  snapshot: PluginContentSnapshot;
  open(): Promise<void>;
}

export class DecorationHit {
  constructor(
    readonly start: number,
    readonly end: number,
    readonly appearance: PluginTextDecorationAppearance,
    readonly tone: PluginTextDecorationTone,
    readonly label: string | undefined,
    readonly pluginName: string,
    readonly activate?: DecorationActivation,
    readonly preview?: (
      choice: string | undefined,
      signal: AbortSignal
    ) => Promise<DecorationPreview | undefined>,
    readonly lifetime?: AbortSignal
  ) {}
}

function readCandidates(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap(item =>
    item &&
    typeof item === "object" &&
    typeof item.key === "string" &&
    typeof item.title === "string"
      ? [
          Object.freeze({
            key: item.key,
            title: item.title,
            description: typeof item.description === "string" ? item.description : undefined,
          }),
        ]
      : []
  );
}

type Provider = {
  context: PluginContext;
  definition: PluginTextDecorationProvider;
  name: string;
};

export class DesktopTextDecorations {
  private readonly providers = new Set<Provider>();
  private readonly listeners = new Set<
    (provider: Provider, source?: PluginDecorationSource) => void
  >();

  constructor(
    private readonly permissions?: Pick<DesktopPermissionBroker, "rowState" | "subscribe">,
    private readonly data?: Pick<DataAdapter, "get" | "readContent">
  ) {}

  private allowed(provider: Provider, kind: PluginDecorationSource["kind"]) {
    const state = this.permissions?.rowState(provider.context.pluginId, `${kind}s:read`);
    return (
      this.providers.has(provider) &&
      provider.definition.sources.includes(kind) &&
      (state === "always" || state === "once")
    );
  }

  subscribe(source: PluginDecorationSource, invalidate: () => void) {
    const readable = () =>
      [...this.providers].filter(provider => this.allowed(provider, source.kind));
    // 来源仍可读时撤销另一个类型的权限，也要收起该类型的预览。
    const previewGrants = () =>
      readable()
        .filter(p => p.definition.getPreview)
        .map(p =>
          (["cards:read", "articles:read", "documents:read"] as const)
            .map(permission => this.permissions?.rowState(p.context.pluginId, permission))
            .join(",")
        )
        .join("|");
    let grants = previewGrants();
    let previous = readable();
    const listener = (provider: Provider, target?: PluginDecorationSource) => {
      if (
        !provider.definition.sources.includes(source.kind) ||
        (target && (target.kind !== source.kind || target.id !== source.id))
      )
        return;
      previous = readable();
      grants = previewGrants();
      invalidate();
    };
    this.listeners.add(listener);
    const unsubscribe = this.permissions?.subscribe(() => {
      const current = readable();
      const nextGrants = previewGrants();
      if (
        grants === nextGrants &&
        current.length === previous.length &&
        current.every((item, i) => item === previous[i])
      )
        return;
      grants = nextGrants;
      previous = current;
      invalidate();
    });
    return () => {
      this.listeners.delete(listener);
      unsubscribe?.();
    };
  }

  hasProviders(source: PluginDecorationSource) {
    return [...this.providers].some(provider => this.allowed(provider, source.kind));
  }

  register(
    context: PluginContext,
    definition: PluginTextDecorationProvider,
    owner: { readonly name: string }
  ) {
    const provider = { context, definition, name: owner.name };
    const invalidate = (scope?: { source: PluginDecorationSource }) => {
      if (!this.providers.has(provider)) return;
      if (
        scope !== undefined &&
        (!scope?.source ||
          !definition.sources.includes(scope.source.kind) ||
          typeof scope.source.id !== "string")
      )
        throw new Error("无效的文字装饰刷新范围");
      for (const listener of this.listeners) listener(provider, scope?.source);
    };
    const dispose = () => {
      context.signal.removeEventListener("abort", dispose);
      if (this.providers.delete(provider))
        for (const listener of this.listeners) listener(provider);
    };
    context.signal.throwIfAborted();
    this.providers.add(provider);
    context.signal.addEventListener("abort", dispose, { once: true });
    invalidate();
    return { invalidate, dispose };
  }

  private async readPreview(
    context: PluginContext,
    target: PluginDecorationPreviewTarget,
    live: () => boolean
  ) {
    const { kind, id } = target.ref;
    const block = target.at?.block;
    if (
      !this.data ||
      !["card", "article", "document"].includes(kind) ||
      typeof id !== "string" ||
      !id ||
      (target.at !== undefined &&
        (typeof block !== "number" || !Number.isSafeInteger(block) || block < 0))
    )
      return;
    const ref = Object.freeze({ kind, id });
    const at = block === undefined ? undefined : Object.freeze({ block });
    const permission = `${kind}s:read` as const;
    const permitted = async () =>
      live() && (await context.permissions.query(permission)) === "granted" && live();
    if (!(await permitted())) return;
    const row = await this.data.get(context, kind, id);
    if (
      !live() ||
      !row ||
      typeof row !== "object" ||
      !("contentRef" in row) ||
      typeof row.contentRef !== "string" ||
      !("title" in row) ||
      typeof row.title !== "string" ||
      !(await permitted())
    )
      return;
    const body = await this.data.readContent(context, row.contentRef, "nodes");
    if (!body?.owners.includes(kind) || !body.snapshot.nodes || !(await permitted())) return;
    if (block !== undefined && block >= body.snapshot.nodes.length) return;
    return {
      target: { ref, at },
      title: row.title,
      snapshot: body.snapshot,
      open: async () => {
        if (!(await permitted())) return;
        const current = await this.data?.get(context, kind, id);
        if (
          !current ||
          typeof current !== "object" ||
          !("contentRef" in current) ||
          current.contentRef !== row.contentRef
        )
          throw new Error("预览目标已变化，请重新打开。");
        if (await permitted()) await context.app.open(ref, at ? { at } : undefined);
      },
    };
  }

  async resolve(block: PluginDecorationBlock, signal: AbortSignal): Promise<DecorationHit[]> {
    const groups = await Promise.all(
      [...this.providers].map(async provider => {
        const { definition, context } = provider;
        const live = () => !signal.aborted && this.allowed(provider, block.source.kind);
        if (!live()) return [];
        try {
          const values = await definition.getDecorations(block, signal);
          if (!live()) return [];
          const hits: DecorationHit[] = [];
          for (const value of values) {
            const { start, end, key, label } = value;
            const appearance = legacy[value.appearance] ?? value.appearance;
            const tone = value.tone ?? "accent";
            if (
              !Number.isInteger(start) ||
              !Number.isInteger(end) ||
              start < 0 ||
              start >= end ||
              end > block.text.length ||
              !appearances.has(appearance) ||
              !tones.has(tone)
            )
              continue;
            const action = definition.onActivate;
            const activate: DecorationActivation | undefined =
              typeof key === "string" && action
                ? async choice => {
                    if (!live()) return undefined;
                    const result = await action(
                      Object.freeze(
                        choice === undefined
                          ? { key, source: block.source }
                          : { key, source: block.source, choice }
                      )
                    );
                    return live() ? readCandidates(result) : undefined;
                  }
                : undefined;
            if (clickable.has(appearance) && !activate) continue;
            hits.push(
              new DecorationHit(
                start,
                end,
                appearance,
                tone,
                typeof label === "string" && label.trim() ? label.trim() : undefined,
                provider.name,
                activate,
                typeof key === "string" && definition.getPreview
                  ? async (choice, hoverSignal) => {
                      const combined = AbortSignal.any([signal, context.signal, hoverSignal]);
                      const valid = () => !combined.aborted && live();
                      if (!valid()) return;
                      const target = await definition.getPreview!(
                        Object.freeze({
                          key,
                          source: block.source,
                          ...(choice === undefined ? {} : { choice }),
                        }),
                        combined
                      );
                      if (!valid() || !target?.ref) return;
                      return this.readPreview(context, target, valid);
                    }
                  : undefined,
                signal
              )
            );
          }
          hits.sort((a, b) => a.start - b.start);
          if (hits.some((hit, i) => i > 0 && hits[i - 1].end > hit.start))
            throw new Error("同一提供方的文字装饰范围不能重叠");
          return hits;
        } catch (error) {
          if (live()) console.error("插件文字装饰计算失败", context.pluginId, error);
          return [];
        }
      })
    );
    // 不同插件竞争同一段文字时按起点排序，同起点按登记顺序。
    let end = 0;
    return groups
      .flat()
      .sort((a, b) => a.start - b.start)
      .filter(hit => {
        if (hit.start < end) return false;
        end = hit.end;
        return true;
      });
  }
}
