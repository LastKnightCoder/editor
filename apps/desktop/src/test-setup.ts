import "vitest-canvas-mock";

if (typeof URL !== "undefined" && typeof URL.createObjectURL !== "function") {
  (URL as any).createObjectURL = () => "blob:mock-url";
}

if (typeof URL !== "undefined" && typeof URL.revokeObjectURL !== "function") {
  (URL as any).revokeObjectURL = () => {};
}
