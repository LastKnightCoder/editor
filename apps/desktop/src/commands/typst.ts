import { invoke } from "@/electron";

export const compileTypst = async (
  code: string,
  inputs: Record<string, string> = {},
): Promise<string> => {
  return await invoke("compile-typst", code, inputs);
};
