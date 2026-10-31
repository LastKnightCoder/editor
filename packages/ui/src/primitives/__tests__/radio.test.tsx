/** Radio / RadioGroup 的组语义、受控互斥、标签关联与禁用行为。 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Radio } from "../Radio";
import { RadioGroup } from "../RadioGroup";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(ui: ReactNode): { root: Root; container: HTMLElement; cleanup: () => void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return {
    root,
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}
const click = (el: Element) =>
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));

function Controlled({ initial }: { initial: "a" | "b" }) {
  const [value, setValue] = useState(initial);
  return (
    <RadioGroup label="组名" value={value} onValueChange={setValue}>
      <Radio value="a" label="选项 A" />
      <Radio value="b" label="选项 B" />
    </RadioGroup>
  );
}

describe("Radio / RadioGroup", () => {
  let cleanups: Array<() => void> = [];
  afterEach(() => {
    cleanups.forEach(fn => fn());
    cleanups = [];
  });

  it("组语义：fieldset/legend 渲染、同 name、checked 由组 value 驱动", () => {
    const h = render(
      <RadioGroup label="导入方式" value="a">
        <Radio value="a" label="追加" />
        <Radio value="b" label="覆盖" />
      </RadioGroup>
    );
    cleanups.push(h.cleanup);
    const fieldset = h.container.querySelector("fieldset")!;
    expect(fieldset.querySelector("legend")!.textContent).toBe("导入方式");
    const inputs = [...fieldset.querySelectorAll("input")] as HTMLInputElement[];
    expect(inputs.map(i => i.type)).toEqual(["radio", "radio"]);
    expect(new Set(inputs.map(i => i.name)).size).toBe(1); // 同 name 才互斥/成组
    expect(inputs[0].checked).toBe(true);
    expect(inputs[1].checked).toBe(false);
  });

  it("受控契约：点另一项回报 onValueChange 且互斥切换", () => {
    const h = render(<Controlled initial="a" />);
    cleanups.push(h.cleanup);
    const inputs = [...h.container.querySelectorAll("input")] as HTMLInputElement[];
    click(inputs[1]);
    expect(inputs[0].checked).toBe(false);
    expect(inputs[1].checked).toBe(true);
    click(inputs[0]);
    expect(inputs[0].checked).toBe(true);
  });

  it("非受控：defaultValue 起步，点击自切换", () => {
    const onValueChange = vi.fn();
    const h = render(
      <RadioGroup label="组名" defaultValue="a" onValueChange={onValueChange}>
        <Radio value="a" label="A" />
        <Radio value="b" label="B" />
      </RadioGroup>
    );
    cleanups.push(h.cleanup);
    const inputs = [...h.container.querySelectorAll("input")] as HTMLInputElement[];
    expect(inputs[0].checked).toBe(true);
    click(inputs[1]);
    expect(onValueChange).toHaveBeenCalledWith("b");
    expect(inputs[1].checked).toBe(true);
  });

  it("label 文字点击 → 选中路径（点文字同选）", () => {
    const h = render(
      <RadioGroup label="组名" defaultValue="a">
        <Radio value="a" label="追加导入" description="不动现有内容" />
        <Radio value="b" label="覆盖导入" />
      </RadioGroup>
    );
    cleanups.push(h.cleanup);
    const labels = [...h.container.querySelectorAll("label")];
    click(labels[1].querySelector("span:last-child")!); // 点「覆盖导入」文字
    const inputs = [...h.container.querySelectorAll("input")] as HTMLInputElement[];
    expect(inputs[1].checked).toBe(true);
  });

  it("禁用：单项原生透传 + 整项降透明；组级 fieldset[disabled] 压全组", () => {
    const h = render(
      <RadioGroup label="组名">
        <Radio value="a" label="锁定项" disabled />
      </RadioGroup>
    );
    cleanups.push(h.cleanup);
    expect(h.container.querySelector("input")!.disabled).toBe(true);
    expect(h.container.querySelector("label")!.className).toContain("has-[:disabled]:opacity-55");
    const h2 = render(
      <RadioGroup label="组名" disabled>
        <Radio value="a" label="A" />
      </RadioGroup>
    );
    cleanups.push(h2.cleanup);
    expect((h2.container.querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
  });

  it("组外独立：name/checked 原生透传，退化为裸 radio", () => {
    const h = render(<Radio value="solo" name="picked" defaultChecked aria-label="独立项" />);
    cleanups.push(h.cleanup);
    const input = h.container.querySelector("input") as HTMLInputElement;
    expect(h.container.querySelector("fieldset")).toBeNull();
    expect(input.name).toBe("picked");
    expect(input.checked).toBe(true);
    expect(input.getAttribute("aria-label")).toBe("独立项");
  });
});
