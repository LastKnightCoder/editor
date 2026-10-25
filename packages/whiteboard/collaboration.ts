export { createWhiteboardBinding, getWhiteboardDocument } from "./src/collaboration/binding";
export type { WhiteboardBindingOptions, WhiteboardCanvasType } from "./src/collaboration/binding";
export { WhiteboardContractCatalog } from "./src/collaboration/catalog";
export type { WhiteboardContractEntry } from "./src/collaboration/catalog";
export { prepareWhiteboardVersionUpgrade } from "./src/collaboration/migration";
export { hostWhiteboardExtensions } from "./src/extensions/authorApi";
export { assertWhiteboardElementVersions } from "./src/extensions/versions";

export { prepareBuiltinWhiteboardTypes } from "./src/collaboration/builtins";
