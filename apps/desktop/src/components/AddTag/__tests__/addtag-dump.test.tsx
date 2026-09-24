import { writeFileSync } from "node:fs";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { it, vi } from "vitest";
import AddTag from "@/components/AddTag";

vi.mock("react-dnd", () => ({
  useDrag: () => [{ isDragging: false }, (ref: unknown) => ref],
  useDrop: () => [{}, (ref: unknown) => ref],
}));

it("dumps markup", () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => {
    root.render(<AddTag tags={["a"]} addTag={() => {}} removeTag={() => {}} />);
  });
  writeFileSync("/tmp/addtag-dump.html", host.innerHTML);
});
