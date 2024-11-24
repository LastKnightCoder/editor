import { getCommandSplitter } from './splitter';

interface BaseCommand {
  type: string;
}

export interface InsertHeaderCommand extends BaseCommand {
  type: 'insert-header';
  level: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface InsertTextCommand extends BaseCommand {
  type: 'insert-text';
  text: string;
}

interface InsertBreakCommand extends BaseCommand {
  type: 'insert-break';
}

interface InsertCodeStartCommand extends BaseCommand {
  type: 'insert-code-start';
  language: string;
}

export interface InsertCodeCommand extends BaseCommand {
  type: 'insert-code';
  code: string;
}

interface InsertCodeEndCommand extends BaseCommand {
  type: 'insert-code-end';
}

interface InsertInlineCodeStartCommand extends BaseCommand {
  type: 'insert-inline-code-start';
}

export interface InsertInlineCodeCommand extends BaseCommand {
  type: 'insert-inline-code';
  code: string;
}

export interface InsertInlineCodeEndCommand extends BaseCommand {
  type: 'insert-inline-code-end';
}

interface InsertBulletedListCommand extends BaseCommand {
  type: 'insert-bulleted-list';
}

interface InsertNumberedListCommand extends BaseCommand {
  type: 'insert-numbered-list';
}

interface InsertListItemCommand extends BaseCommand {
  type: 'insert-list-item';
}

interface InsertBlockMathCommand extends BaseCommand {
  type: 'insert-block-math';
  math: string;
}

type CodeCommand =
  | InsertCodeStartCommand
  | InsertCodeCommand
  | InsertCodeEndCommand
  | InsertInlineCodeStartCommand
  | InsertInlineCodeCommand
  | InsertInlineCodeEndCommand;

export type Command =
  | InsertHeaderCommand
  | InsertTextCommand
  | CodeCommand
  | InsertBulletedListCommand
  | InsertNumberedListCommand
  | InsertListItemCommand
  | InsertBlockMathCommand
  | InsertBreakCommand;

export class CommandParser {
  private commands: Command[] = [];
  private readonly commandsQueue: Command[] = [];
  private currentCommand = '';
  private isFinished = false;

  constructor() {
    this.animateCommands();
  }

  addText(text: string): void {
    this.currentCommand += text;
    this.parseCommands();
  }

  animateCommands() {
    if (this.isFinished && this.commandsQueue.length === 0) {
      return;
    }

    const fetchCount = Math.max(1, Math.round(this.commandsQueue.length / 60));
    const commands = this.commandsQueue.slice(0, fetchCount);
    this.commandsQueue.splice(0, fetchCount);
    for (const command of commands) {
      this.commands.push(command);
    }

    requestAnimationFrame(this.animateCommands.bind(this));
  }

  finish(): void {
    console.log('%c finish', 'color: #f00', this.currentCommand);
    // console.log('%cfinish', 'color: #f00');
    this.parseCommands();
    console.log('%c finish', 'color: #f00', [...this.commandsQueue]);
    this.isFinished = true;
  }

  error(): void {
    this.commands = [];
    this.currentCommand = '';
    this.isFinished = true;
  }

  private parseCommands(): void {
    if (!this.currentCommand) return;

    // console.log('parseCommands: ', this.currentCommand)

    let startIndex = this.currentCommand.indexOf('{');
    while (startIndex !== -1) {
      try {
        // 找到可能的命令结束位置
        const endIndex = this.findClosingBrace(this.currentCommand, startIndex);
        if (endIndex === -1) break;

        // 尝试解析这段文本
        const jsonStr = this.currentCommand.substring(startIndex, endIndex + 1);
        const command = JSON.parse(jsonStr) as Command;

        if (this.isValidCommand(command)) {
          const splitter = getCommandSplitter(command);
          if (splitter) {
            const commands = splitter.split();
            for (const command of commands) {
              this.commandsQueue.push(command);
            }
          } else {
            this.commandsQueue.push(command)
          }

          // 移除已解析的命令
          this.currentCommand = this.currentCommand.slice(endIndex + 1);
          // 查找下一个命令的开始位置
          startIndex = this.currentCommand.indexOf('{');
        } else {
          // 如果命令格式无效，跳过这个命令
          startIndex = this.currentCommand.indexOf('{', startIndex + 1);
        }
      } catch (error) {
        console.error(this.currentCommand);
        console.error(error);
        // 如果解析失败，可能是不完整的命令，等待更多输入
        break;
      }
    }

    // 如果当前缓冲区已经为空或只包含空白字符，重置它
    if (this.currentCommand && this.currentCommand.trim() === '') {
      this.currentCommand = '';
    }
  }

  private findClosingBrace(text: string, startIndex: number): number {
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            return i;
          }
        }
      }
    }

    return -1;
  }

  private isValidCommand(command: any): command is Command {
    if (!command || typeof command.type !== 'string') return false;

    return !!command.type;
  }

  *[Symbol.iterator](): Iterator<Promise<Command | null>> {
    while (!this.isFinished || this.commandsQueue.length > 0 || this.commands.length > 0) {
      if (this.commands.length === 0) {
        yield new Promise<Command>(resolve => {
          const interval = setInterval(() => {
            if (this.commands.length > 0) {
              clearInterval(interval);
              resolve(this.commands.shift()!);
            } else if (this.isFinished) {
              clearInterval(interval);
              // @ts-ignore
              resolve(null);
            }
          }, 50)
        })
      } else {
        yield Promise.resolve(this.commands.shift()!);
      }
    }
  }
}

export default CommandParser;
