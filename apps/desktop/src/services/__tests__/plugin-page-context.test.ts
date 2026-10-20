import { describe, expect, it } from "vitest";
import type { JsonValue } from "@tau/plugins";
import { createPluginPageContext, readPluginPageContext } from "../plugin-page-context";

const params = (id = "one") => ({
  pluginId: "sample",
  pageId: "detail",
  instanceId: id,
  params: JSON.stringify({ id }),
});

function setup(route = params()) {
  const controller = new AbortController();
  let available = true;
  const scope = createPluginPageContext({
    params: route,
    signal: controller.signal,
    isAvailable: () => available,
  });
  const unmount = scope.mount();
  return {
    ...scope,
    controller,
    unmount,
    hide: () => {
      available = false;
    },
  };
}

describe("插件页面上下文", () => {
  it.each<JsonValue>(["自由文本", 42, false, [1, "二"], { arbitrary: { nested: true } }, null])(
    "保留作者提供的任意 JSON 形状：%j",
    value => {
      const scope = setup();
      try {
        scope.pageContext.register(() => value);
        expect(readPluginPageContext(params())).toEqual(value);
      } finally {
        scope.unmount();
      }
    }
  );

  it("读取最新值并复制快照，多个参数实例互不混入", () => {
    const first = setup();
    const second = setup(params("two"));
    const value = { count: 1 };
    try {
      first.pageContext.register(() => value);
      second.pageContext.register(() => ["另一个实例"]);
      const snapshot = readPluginPageContext(params());
      value.count = 2;
      expect(snapshot).toEqual({ count: 1 });
      expect(readPluginPageContext(params())).toEqual({ count: 2 });
      expect(readPluginPageContext(params("two"))).toEqual(["另一个实例"]);
      expect(readPluginPageContext({ ...params(), params: "{}" })).toBeNull();
    } finally {
      first.unmount();
      second.unmount();
    }
  });

  it("重复登记拒绝，旧句柄不删除新登记，卸载及重新挂载可恢复", () => {
    const scope = setup();
    const old = scope.pageContext.register(() => "旧值");
    expect(() => scope.pageContext.register(() => "重复")).toThrow("已注册");
    old.dispose();
    scope.pageContext.register(() => "新值");
    old.dispose();
    expect(readPluginPageContext(params())).toBe("新值");
    scope.unmount();
    expect(readPluginPageContext(params())).toBeNull();
    expect(() => scope.pageContext.register(() => null)).toThrow("不可用");
    const unmount = scope.mount();
    try {
      scope.pageContext.register(() => "恢复");
      expect(readPluginPageContext(params())).toBe("恢复");
    } finally {
      unmount();
    }
  });

  it("失效实例和停用信号拒绝读取及迟到注册", () => {
    const scope = setup();
    try {
      scope.pageContext.register(() => "不应再读到");
      scope.hide();
      expect(readPluginPageContext(params())).toBeNull();
      scope.controller.abort();
      expect(readPluginPageContext(params())).toBeNull();
      expect(() => scope.pageContext.register(() => null)).toThrow("不可用");
    } finally {
      scope.unmount();
    }
  });

  it.each([
    () => {
      throw new Error("提供失败");
    },
    () => undefined,
    () => Infinity,
    () => {
      const cyclic: unknown[] = [];
      cyclic.push(cyclic);
      return cyclic;
    },
  ])("提供器异常或非法 JSON 不破坏读取", provide => {
    const scope = setup();
    try {
      scope.pageContext.register(provide as () => JsonValue);
      expect(readPluginPageContext(params())).toBeNull();
    } finally {
      scope.unmount();
    }
  });

  it("提供器执行期间注销自己的结果不再发布", () => {
    const scope = setup();
    try {
      const registration = scope.pageContext.register(() => {
        registration.dispose();
        return "旧结果";
      });
      expect(readPluginPageContext(params())).toBeNull();
    } finally {
      scope.unmount();
    }
  });
});
