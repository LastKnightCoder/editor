import { expect, it, vi } from "vitest";
import { bindPluginServices, type PluginServices } from "../services";

it("取消由调用方或生命周期触发，迟到结果不会返回给已停用插件", async () => {
  const lifetime = new AbortController();
  let finish!: (value: { css: string }) => void;
  let signal!: AbortSignal;
  const compile = vi.fn((_input, options) => {
    signal = options.signal;
    return new Promise<{ css: string }>(resolve => {
      finish = resolve;
    });
  });
  const adapter = { tailwind: { compile } } as unknown as PluginServices;
  const services = bindPluginServices(adapter, lifetime.signal, () => undefined);
  const caller = new AbortController();
  const result = services.tailwind.compile({ source: "p-4" }, { signal: caller.signal });
  caller.abort();
  expect(signal.aborted).toBe(true);
  finish({ css: "late" });
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  const next = services.tailwind.compile({ source: "p-8" });
  lifetime.abort();
  expect(signal.aborted).toBe(true);
  finish({ css: "late" });
  await expect(next).rejects.toMatchObject({ name: "AbortError" });
  await expect(services.tailwind.compile({ source: "p-1" })).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(compile).toHaveBeenCalledTimes(2);
});

it("缺少适配器时明确报错，尚未开始的取消请求不会执行", async () => {
  const services = bindPluginServices(undefined, new AbortController().signal, () => undefined);
  await expect(services.tikz.compile({ source: "x" })).rejects.toThrow("未提供");
  const compile = vi.fn();
  const supported = bindPluginServices(
    { tailwind: { compile } } as unknown as PluginServices,
    new AbortController().signal,
    () => undefined
  );
  await expect(
    supported.tailwind.compile({ source: "x" }, { signal: AbortSignal.abort() })
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(compile).not.toHaveBeenCalled();
});
