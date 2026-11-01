import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  PluginContext,
  PluginExcerptEntry,
  PluginExcerptProviderDefinition,
} from "@tau/plugins";
import type { ExcerptsAdapter, MaterialsAdapter } from "@tau/plugins/host";
import type { MobileDataAdapter } from "./data";
import { parseExcerptMaterialRef } from "@tau/plugins/material-ref";

export interface MobileExcerptMaterial {
  entry: PluginExcerptEntry;
  sourceType: string;
  sourceKey: string;
  title: string;
  label: string;
  createdAt: number;
  updatedAt: number;
}

export function createMobileExcerpts(
  database: string,
  token: string,
  data: Pick<MobileDataAdapter, "prepareContent">,
  changed: () => void
) {
  let disposed = false;
  const providers = new Map<
    string,
    {
      context: PluginContext;
      definition: PluginExcerptProviderDefinition;
      ready: Promise<void>;
      release: () => void;
    }
  >();
  const active = () => {
    if (disposed) throw new Error("摘录工作区已失效");
  };
  const check = (context: PluginContext) => {
    active();
    context.signal.throwIfAborted();
    if (context.workspaceId !== database) throw new Error("摘录工作区已切换");
  };
  const call = async <T>(context: PluginContext, request: unknown, write = false): Promise<T> => {
    check(context);
    const result = await invoke<T>("plugin_excerpts", {
      database,
      token,
      pluginId: context.pluginId,
      request,
    });
    if (write && !disposed) changed();
    check(context);
    return result;
  };
  const registered = async (context: PluginContext) => {
    check(context);
    const provider = providers.get(context.pluginId);
    if (!provider || provider.context !== context) throw new Error("写入摘录前须先注册摘录提供方");
    await provider.ready;
    check(context);
    if (providers.get(context.pluginId) !== provider) throw new Error("摘录提供方已注销");
    return provider;
  };
  const excerpts: ExcerptsAdapter = {
    register(context, definition) {
      check(context);
      if (providers.has(context.pluginId)) throw new Error("摘录提供方已注册");
      const ready = call<void>(context, { method: "register", label: definition.label }, true);
      void ready.catch(() => undefined);
      const provider = {
        context,
        definition,
        ready,
        release() {
          if (providers.get(context.pluginId) === provider) providers.delete(context.pluginId);
          context.signal.removeEventListener("abort", provider.release);
        },
      };
      providers.set(context.pluginId, provider);
      context.signal.addEventListener("abort", provider.release, { once: true });
      return { dispose: provider.release };
    },
    async replace(context, source, items) {
      await registered(context);
      return call(context, { method: "replace", source, items }, true);
    },
    async patch(context, source, change) {
      await registered(context);
      return call(context, { method: "patch", source, change }, true);
    },
    sources: context => call(context, { method: "sources" }),
    items: (context, sourceKey) => call(context, { method: "items", sourceKey }),
  };

  const materials: MaterialsAdapter = {
    async actions(context, ref) {
      check(context);
      if (
        !ref ||
        !["excerpt", "pdf-annotation", "web-clip"].includes(ref.kind) ||
        !Number.isSafeInteger(ref.id) ||
        ref.id <= 0
      )
        throw new Error("材料地址无效");
      if (ref.kind !== "excerpt") return [];
      const expected = parseExcerptMaterialRef(ref);
      const target = { kind: ref.kind, id: ref.id, identity: ref.identity };
      const identity = await call<MobileExcerptMaterial>(context, {
        method: "material",
        ref: target,
      });
      if (
        identity.sourceType !== expected.provider ||
        identity.entry.externalId !== expected.externalId
      )
        throw new Error("摘录身份不匹配，请重新读取");
      return [
        {
          id: "card",
          label: "转为卡片",
          async run() {
            const material = await call<MobileExcerptMaterial>(context, {
              method: "material",
              ref: target,
            });
            if (
              material.sourceType !== identity.sourceType ||
              material.entry.externalId !== identity.entry.externalId ||
              material.createdAt !== identity.createdAt
            )
              throw new Error("摘录身份已变化，请重新获取材料动作");
            const { quote, note, location, url } = material.entry;
            if (!quote && !note) throw new Error("这条划线没有可转的文字");
            const host = (value: string) => {
              try {
                return new URL(value).host;
              } catch {
                return "";
              }
            };
            const source =
              material.title.trim() || host(url ?? "") || host(material.sourceKey) || "未知来源";
            const meta = [material.label, source, location.trim()].filter(Boolean).join(" · ");
            const quoted = quote
              .split("\n")
              .map(line => line.trim())
              .filter(Boolean)
              .map(line => `> ${line}`)
              .join("\n");
            const markdown = [quoted, note.trim(), `—— ${meta}`].filter(Boolean).join("\n\n");
            const content = await data.prepareContent(context, { markdown });
            check(context);
            await invoke("plugin_material_card", {
              database,
              token,
              pluginId: context.pluginId,
              request: { ref: target, expected: material, content },
            });
            if (!disposed) changed();
            check(context);
          },
        },
      ];
    },
  };

  return {
    excerpts,
    materials,
    async open(id: number, guard: () => void = () => undefined) {
      active();
      guard();
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("摘录编号无效");
      const target = await invoke<MobileExcerptMaterial>("excerpt_open_target", {
        database,
        token,
        id,
      });
      active();
      guard();
      const provider = providers.get(target.sourceType);
      if (provider?.definition.open) {
        await provider.ready;
        check(provider.context);
        guard();
        if (providers.get(target.sourceType) !== provider) throw new Error("摘录提供方已注销");
        await provider.definition.open({
          sourceKey: target.sourceKey,
          externalId: target.entry.externalId,
        });
        check(provider.context);
        guard();
        return;
      }
      if (target.entry.url) {
        const url = new URL(target.entry.url);
        if (!["http:", "https:"].includes(url.protocol))
          throw new Error("摘录外链必须是 http(s) 地址");
        active();
        guard();
        await openUrl(target.entry.url);
        active();
        guard();
        return;
      }
      throw new Error(`需启用「${target.label}」插件才能打开到原处`);
    },
    dispose() {
      disposed = true;
      for (const provider of providers.values()) provider.release();
      providers.clear();
    },
  };
}

export type MobileExcerpts = ReturnType<typeof createMobileExcerpts>;
