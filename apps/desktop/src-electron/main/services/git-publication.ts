import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  rename,
  rm,
  readdir,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { GitSnapshotRequest } from "@tau/plugins";
import type { IPublishPlan } from "@/types/publish";
import { publicationDestination } from "../modules/publish-destination";
import { stagePublication, publicationGitError } from "./git-publication-paths";

const execute = promisify(execFile);
interface Publication {
  owner: number;
  plan: IPublishPlan;
  signal: AbortSignal;
  controller: AbortController;
}

/** Git 只消费本轮发布句柄，不向插件开放命令或文件系统。 */
export class GitPublicationService {
  private readonly publications = new Map<string, Publication>();
  private readonly locks = new Set<string>();
  private saving: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly root: string,
    private readonly run: typeof execute = execute
  ) {}
  register(owner: number, plan: IPublishPlan, signal: AbortSignal) {
    const id = randomUUID();
    const controller = new AbortController();
    this.publications.set(id, {
      owner,
      plan,
      signal: AbortSignal.any([signal, controller.signal]),
      controller,
    });
    return {
      id,
      dispose: () => {
        this.publications.delete(id);
      },
    };
  }
  cancel(owner: number, id: string) {
    const publication = this.publications.get(id);
    if (publication?.owner === owner) publication.controller.abort();
  }
  private async directories(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await readFile(path.join(this.root, "git-cache-directories.json"), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }
  async registerDirectory(directory: string) {
    if (!path.isAbsolute(directory)) throw new Error("Git 缓存目录必须为绝对路径");
    const absolute = path.resolve(directory);
    const id = createHash("sha256").update(absolute).digest("hex");
    const operation = this.saving
      .catch(() => undefined)
      .then(async () => {
        const entries = await this.directories();
        await mkdir(this.root, { recursive: true });
        const file = path.join(this.root, "git-cache-directories.json");
        await writeFile(file + ".tmp", JSON.stringify({ ...entries, [id]: absolute }), {
          mode: 0o600,
        });
        await rename(file + ".tmp", file);
      });
    this.saving = operation;
    await operation;
    return { id, label: absolute };
  }
  async publish(owner: number, input: GitSnapshotRequest) {
    const publication = this.publications.get(input?.publicationId);
    if (!publication || publication.owner !== owner)
      throw new Error("发布快照已失效或不属于当前窗口");
    const { plan, signal } = publication;
    signal.throwIfAborted();
    const remote = new URL(input.remote);
    if (
      remote.protocol !== "https:" ||
      remote.username ||
      remote.password ||
      remote.search ||
      remote.hash
    )
      throw new Error("Git 远端必须为不含凭据的 HTTPS 地址");
    if (
      !input.author?.name ||
      !input.author?.email ||
      /[\r\n\0]/.test(input.author.name + input.author.email)
    )
      throw new Error("Git 提交者无效");
    if (
      !input.authentication ||
      typeof input.authentication.username !== "string" ||
      typeof input.authentication.password !== "string"
    )
      throw new Error("Git 认证无效");
    if (
      typeof input.branch !== "string" ||
      !input.branch ||
      input.branch.startsWith("-") ||
      /[\r\n\0]/.test(input.branch)
    )
      throw new Error("Git 分支无效");
    await this.saving;
    const directories = await this.directories();
    const base = input.cacheId
      ? directories[input.cacheId]
      : path.join(this.root, "git-publications");
    if (!base) throw new Error("Git 缓存目录授权已失效，请重新选择");
    await mkdir(base, { recursive: true });
    const working = path.join(
      await realpath(base),
      createHash("sha256").update(remote.href).digest("hex")
    );
    if (this.locks.has(working)) throw new Error("Git 发布缓存已有任务正在执行");
    this.locks.add(working);
    let temporary: string;
    try {
      temporary = await mkdtemp(path.join(os.tmpdir(), "tau-git-auth-"));
    } catch (error) {
      this.locks.delete(working);
      throw error;
    }
    try {
      const script = path.join(temporary, "askpass.cjs");
      const launcher = path.join(
        temporary,
        process.platform === "win32" ? "askpass.cmd" : "askpass.sh"
      );
      await writeFile(
        script,
        'process.stdout.write(/username/i.test(process.argv[2] || "") ? process.env.TAU_GIT_USERNAME : process.env.TAU_GIT_PASSWORD);',
        { mode: 0o600 }
      );
      await writeFile(
        launcher,
        process.platform === "win32"
          ? '@"%TAU_GIT_NODE%" "%TAU_GIT_SCRIPT%" %*\r\n'
          : '#!/bin/sh\nexec "$TAU_GIT_NODE" "$TAU_GIT_SCRIPT" "$@"\n',
        { mode: 0o700 }
      );
      const env = {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: launcher,
        ELECTRON_RUN_AS_NODE: "1",
        TAU_GIT_NODE: process.execPath,
        TAU_GIT_SCRIPT: script,
        TAU_GIT_USERNAME: input.authentication.username,
        TAU_GIT_PASSWORD: input.authentication.password,
      };
      const git = async (args: string[], cwd = working) => {
        signal.throwIfAborted();
        const { stdout } = await this.run(
          "git",
          [
            "-c",
            "credential.helper=",
            "-c",
            "core.hooksPath=" + temporary,
            "-c",
            "protocol.file.allow=never",
            ...args,
          ],
          { cwd, env, signal, maxBuffer: 8 * 1024 * 1024 }
        );
        signal.throwIfAborted();
        return stdout;
      };
      await mkdir(working, { recursive: true });
      await git(["check-ref-format", "--branch", input.branch]);
      const entries = await readdir(working);
      if (!entries.includes(".git")) {
        if (entries.length) throw new Error("Git 发布缓存非空且不是仓库");
        await git(["init"]);
        await git(["remote", "add", "origin", remote.href]);
      } else await git(["remote", "set-url", "origin", remote.href]);
      // 拉取失败不以旧缓存代替远端状态，防止推送覆盖未知更改。
      await git(["fetch", "origin"]);
      const remoteRef = "refs/remotes/origin/" + input.branch;
      const remoteExists = Boolean(
        (await git(["for-each-ref", "--format=%(refname)", remoteRef])).trim()
      );
      const localExists = Boolean(
        (await git(["for-each-ref", "--format=%(refname)", "refs/heads/" + input.branch])).trim()
      );
      if (localExists) {
        await git(["checkout", input.branch]);
        if (remoteExists) await git(["merge", "--ff-only", remoteRef]);
      } else if (remoteExists) await git(["checkout", "-b", input.branch, remoteRef]);
      else {
        await git(["checkout", "--orphan", input.branch]);
        await git(["rm", "-r", "--cached", "--ignore-unmatch", "."]);
      }
      const targets = new Map(
        [...plan.toDelete, ...plan.toUpload.map(file => file.path)].map(file => [
          file,
          publicationDestination(working, file),
        ])
      );
      for (const file of plan.toDelete) await rm(targets.get(file)!, { force: true });
      for (const file of plan.toUpload) {
        signal.throwIfAborted();
        await mkdir(path.dirname(targets.get(file.path)!), { recursive: true });
        await writeFile(targets.get(file.path)!, file.content);
      }
      await stagePublication(
        { raw: args => git(args) },
        plan.toUpload.map(file => file.path),
        plan.toDelete
      );
      const changes = await git(["diff", "--cached", "--name-only", "-z"]);
      if (changes)
        await git([
          "-c",
          "user.name=" + input.author.name,
          "-c",
          "user.email=" + input.author.email,
          "commit",
          "-m",
          "Publish at " + new Date().toISOString(),
        ]);
      if (plan.toUpload.length || plan.toDelete.length) {
        const head = (await git(["rev-parse", "HEAD"])).trim();
        try {
          await git(["push", "origin", "HEAD:refs/heads/" + input.branch]);
        } catch (error) {
          signal.throwIfAborted();
          const confirmed = (
            await git(["ls-remote", "--heads", "origin", "refs/heads/" + input.branch])
          ).split(/\s/)[0];
          if (confirmed !== head) throw error;
        }
      }
    } catch (error) {
      throw publicationGitError(error, [
        input.authentication.password,
        input.authentication.username,
      ]);
    } finally {
      this.locks.delete(working);
      await rm(temporary, { recursive: true, force: true });
    }
  }
}
