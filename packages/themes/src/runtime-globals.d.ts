// 根入口不引 DOM lib；console 在浏览器与 Node 都存在，只声明用到的部分
declare const console: { warn(...args: unknown[]): void };
