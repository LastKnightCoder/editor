import { beforeEach, describe, expect, it } from "vitest";
import {
  TOAST_DEFAULT_DURATION,
  TOAST_MAX_COUNT,
  toast,
  useToastStore,
} from "../toast";

describe("toast store", () => {
  beforeEach(() => {
    useToastStore.getState().clearAll();
  });

  it("success/info/error/warning 均可入队", () => {
    toast.success("ok");
    toast.info("info");
    toast.warning("warn");

    const toasts = useToastStore.getState().toasts;
    expect(toasts.map((item) => item.type)).toEqual([
      "success",
      "info",
      "warning",
    ]);

    useToastStore.getState().clearAll();
    toast.error("failed");
    expect(useToastStore.getState().toasts[0]?.type).toBe("error");
  });

  it("超过上限时丢弃最旧消息", () => {
    toast({ id: "t1", type: "info", text: "1" });
    toast({ id: "t2", type: "info", text: "2" });
    toast({ id: "t3", type: "info", text: "3" });
    toast({ id: "t4", type: "info", text: "4" });

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(TOAST_MAX_COUNT);
    expect(toasts.map((item) => item.id)).toEqual(["t2", "t3", "t4"]);
  });

  it("返回的移除函数可手动删除 toast", () => {
    const dispose = toast.success("待移除");
    expect(useToastStore.getState().toasts).toHaveLength(1);

    dispose();

    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("支持默认与显式持续时间", () => {
    toast.info("默认时长");
    expect(useToastStore.getState().toasts[0]?.duration).toBe(
      TOAST_DEFAULT_DURATION,
    );

    useToastStore.getState().clearAll();
    toast.warning("自定义时长", 1200);
    expect(useToastStore.getState().toasts[0]?.duration).toBe(1200);

    useToastStore.getState().clearAll();
    toast({
      id: "manual-id",
      type: "success",
      text: "manual",
      duration: 4500,
    });
    const last = useToastStore.getState().toasts[0];
    expect(last?.id).toBe("manual-id");
    expect(last?.duration).toBe(4500);
  });
});
