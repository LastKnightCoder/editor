import "vitest-canvas-mock";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!URL.createObjectURL) URL.createObjectURL = () => "blob:mock-url";
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
