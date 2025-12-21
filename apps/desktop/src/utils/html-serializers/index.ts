import { htmlSerializerRegistry } from "../htmlSerializerRegistry";
import { blockSerializers } from "./block-serializers";
import { inlineSerializers } from "./inline-serializers";

// Register all serializers
htmlSerializerRegistry.registerMany(blockSerializers);
htmlSerializerRegistry.registerMany(inlineSerializers);

export { htmlSerializerRegistry };
export { blockSerializers } from "./block-serializers";
export { inlineSerializers } from "./inline-serializers";
