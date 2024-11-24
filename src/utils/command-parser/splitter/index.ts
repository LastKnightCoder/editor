import { Command } from '../index';

import CodeSplitter from "./code-spliter.ts";
import TextSplitter from './text-splitter.ts';

const splitterMap: Record<string, any | null> = {
  'insert-text': TextSplitter,
  'insert-code': CodeSplitter,
  'insert-inline-code': CodeSplitter,
};

export const getCommandSplitter = (command: Command) => {
  const { type } = command;
  const Splitter = splitterMap[type];
  if (!Splitter) return null;
  return new Splitter(command);
}
