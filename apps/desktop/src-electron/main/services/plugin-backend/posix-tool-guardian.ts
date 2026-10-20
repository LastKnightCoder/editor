/** 仅执行固定的工具监督逻辑，不加载插件；父 IPC 断开时回收工具进程组。 */
export const POSIX_TOOL_GUARDIAN = String.raw`
const { spawn } = require('node:child_process');
let child;
let stopping = false;
function terminate() {
  if (!child || !child.pid) return;
  try { process.kill(-child.pid, 'SIGKILL'); } catch (error) {
    if (error.code !== 'ESRCH') child.kill('SIGKILL');
  }
}
function stop() { stopping = true; terminate(); process.exit(1); }
process.on('disconnect', stop);
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
let input = '';
const interactive = process.env.TAU_PLUGIN_TOOL_CONFIG;
function start(input) {
  if (stopping || (!interactive && !process.connected)) return stop();
  try {
    const config = JSON.parse(input);
    if (interactive) {
      if (!Number.isSafeInteger(config.parentId) || config.parentId !== process.ppid) return stop();
      setInterval(() => { if (process.ppid !== config.parentId) stop(); }, 250).unref();
    }
    const env = { ...process.env, ...config.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.TAU_PLUGIN_TOOL_CONFIG;
    child = spawn(config.command, config.args, { cwd: config.cwd, env, shell: false, detached: true, stdio: [interactive ? 'inherit' : 'ignore', 'inherit', 'inherit'] });
    if (child.pid && process.send) process.send({ pid: child.pid });
    child.once('error', error => { process.stderr.write(error.message); terminate(); process.exit(1); });
    child.once('exit', code => { terminate(); process.exit(code === null ? 1 : code); });
  } catch (error) { process.stderr.write(error.message); stop(); }
}
if (interactive) start(interactive);
else {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; if (input.length > 300000) stop(); });
  process.stdin.on('end', () => start(input));
}
`;
