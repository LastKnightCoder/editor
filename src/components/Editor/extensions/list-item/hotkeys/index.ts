import { indent } from "./indent.ts";
import { unindent } from "./unindent.ts";
import { move } from "./move.ts";

export default [...indent, ...unindent, ...move];
