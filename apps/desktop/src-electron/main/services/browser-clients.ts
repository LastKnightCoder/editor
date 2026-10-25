import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  BrowserClientRejection,
  BrowserClientView,
  BrowserCompanionSnapshot,
} from "@/types/browser-companion";
import {
  COMPANION_SCOPES,
  REQUIRED_SCOPES,
  type ClientInfo,
  type CompanionScope,
} from "@tau/shared/browser-companion";

/** 已授权的浏览器扩展实例；token 只存 SHA-256 */
export interface BrowserClientRecord {
  clientId: string;
  info: ClientInfo;
  origin: string;
  tokenHash: string;
  scopes: CompanionScope[];
  createdAt: number;
  lastSeenAt: number;
}

export type BrowserClientsSnapshot = Omit<BrowserCompanionSnapshot, "online">;

interface ClientsFile {
  version: 1;
  acceptNew: boolean;
  clients: BrowserClientRecord[];
  rejections: BrowserClientRejection[];
}

const MAX_REJECTIONS = 20;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** 常量时间比较 token 哈希，避免按字节提前返回泄露信息 */
export const tokenMatches = (token: string, tokenHash: string): boolean => {
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(tokenHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

/** 授予的权限：必需项总在，可选项只认白名单 */
export const normalizeScopes = (scopes: unknown): CompanionScope[] => {
  const requested = new Set(Array.isArray(scopes) ? scopes : []);
  return COMPANION_SCOPES.filter(scope => REQUIRED_SCOPES.includes(scope) || requested.has(scope));
};

const emptyFile = (): ClientsFile => ({ version: 1, acceptNew: true, clients: [], rejections: [] });

function parse(raw: string): ClientsFile {
  const value = JSON.parse(raw) as ClientsFile;
  if (value?.version !== 1 || !Array.isArray(value.clients))
    throw new Error("浏览器授权文件格式无效");
  return { ...emptyFile(), ...value };
}

const toView = ({ tokenHash: _tokenHash, ...rest }: BrowserClientRecord): BrowserClientView => rest;

/** 主进程单实例串行读改写（与插件权限同一做法）；损坏文件不覆盖，保留给用户排查 */
export class BrowserClientStore {
  private pending: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly filename: string,
    private readonly now: () => number = Date.now
  ) {}

  private transact<T>(operation: (file: ClientsFile) => T, save = true): Promise<T> {
    const result = this.pending.then(async () => {
      let file: ClientsFile;
      try {
        file = parse(await readFile(this.filename, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        file = emptyFile();
      }
      const value = operation(file);
      if (save) {
        await mkdir(path.dirname(this.filename), { recursive: true });
        const temporary = `${this.filename}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, JSON.stringify(file), { flag: "wx", mode: 0o600 });
          await rename(temporary, this.filename);
        } finally {
          await rm(temporary, { force: true });
        }
      }
      return structuredClone(value);
    });
    this.pending = result.catch(() => undefined);
    return result;
  }

  snapshot(): Promise<BrowserClientsSnapshot> {
    return this.transact(
      file => ({
        acceptNew: file.acceptNew,
        clients: file.clients.map(toView),
        rejections: file.rejections,
      }),
      false
    );
  }

  get(clientId: string): Promise<BrowserClientRecord | undefined> {
    return this.transact(file => file.clients.find(item => item.clientId === clientId), false);
  }

  acceptsNew(): Promise<boolean> {
    return this.transact(file => file.acceptNew, false);
  }

  setAcceptNew(acceptNew: boolean): Promise<void> {
    return this.transact(file => {
      file.acceptNew = acceptNew === true;
    });
  }

  /** 授权（同一 clientId 重新配对时覆盖），返回明文 token，只此一次 */
  async grant(
    clientId: string,
    info: ClientInfo,
    origin: string,
    scopes: unknown
  ): Promise<{ token: string; scopes: CompanionScope[] }> {
    const token = Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32))).toString(
      "base64url"
    );
    const granted = normalizeScopes(scopes);
    const now = this.now();
    await this.transact(file => {
      file.clients = file.clients.filter(item => item.clientId !== clientId);
      file.clients.push({
        clientId,
        info,
        origin,
        tokenHash: hashToken(token),
        scopes: granted,
        createdAt: now,
        lastSeenAt: now,
      });
    });
    return { token, scopes: granted };
  }

  /** 校验 hello：clientId 存在、Origin 与授权时一致、token 匹配；成功顺带刷新活跃时间 */
  verify(
    clientId: string,
    token: string,
    origin: string
  ): Promise<BrowserClientRecord | "unknown-client" | "bad-token"> {
    return this.transact(file => {
      const record = file.clients.find(item => item.clientId === clientId);
      if (!record) return "unknown-client" as const;
      if (record.origin !== origin || !tokenMatches(token, record.tokenHash)) {
        return "bad-token" as const;
      }
      record.lastSeenAt = this.now();
      return record;
    });
  }

  setScopes(clientId: string, scopes: unknown): Promise<CompanionScope[] | null> {
    return this.transact(file => {
      const record = file.clients.find(item => item.clientId === clientId);
      if (!record) return null;
      record.scopes = normalizeScopes(scopes);
      return record.scopes;
    });
  }

  revoke(clientId: string): Promise<boolean> {
    return this.transact(file => {
      const before = file.clients.length;
      file.clients = file.clients.filter(item => item.clientId !== clientId);
      return file.clients.length !== before;
    });
  }

  recordRejection(rejection: Omit<BrowserClientRejection, "at">): Promise<void> {
    return this.transact(file => {
      file.rejections = [{ ...rejection, at: this.now() }, ...file.rejections].slice(
        0,
        MAX_REJECTIONS
      );
    });
  }
}
