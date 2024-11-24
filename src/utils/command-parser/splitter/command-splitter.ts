import { Command } from '../index';

export default abstract class CommandSplitterBase<T extends Command> {
  command: T;

  protected constructor(command: T) {
    this.command = command;
  }

  abstract split(): T[];
}
