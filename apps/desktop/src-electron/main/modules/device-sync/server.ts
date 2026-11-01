import { TransferFiles, TRANSFER_CHUNK_BYTES } from "./transfer-files";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:https";
import { networkInterfaces, hostname } from "node:os";
import { join } from "node:path";
import type {
  DeviceOffer,
  DeviceState,
  RowChange,
} from "@tau/collaboration/src/device-sync/protocol";
import { DeviceSyncEngine } from "@tau/collaboration/src/device-sync/engine";
import type { DeviceAssetStore } from "./asset-store";
import { deviceCertificate } from "./certificate";
import { writeDeviceState } from "./atomic-file";
import { DEVICE_SYNC_PROTOCOL } from "@tau/collaboration/src/device-sync/protocol";

const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");
const MAX_BYTES = 64 * 1024 * 1024;
interface Peer {
  id: string;
  name: string;
  hash: string;
}
export class DeviceSyncServer {
  private server?: Server;
  private port = 0;
  private active = false;
  private inFlight = 0;
  private transfers?: TransferFiles;
  private readonly peers: Peer[];
  private pairing?: { secret: string; expires: number; node?: string; token?: string };
  readonly certificate: { cert: string; key: string };
  private checkpoint?: { epoch: string; revision: number; head: string; state?: DeviceState };
  constructor(
    private readonly directory: string,
    private readonly engine: DeviceSyncEngine,
    private readonly assets: DeviceAssetStore,
    private readonly prepare: () => Promise<void>,
    private readonly changed: (changes: RowChange[]) => void,
    private readonly canReadAsset?: (name: string) => boolean
  ) {
    this.certificate = deviceCertificate(directory);
    const path = join(directory, "peers.json");
    this.peers = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
    const checkpoint = join(directory, "canonical-head.json");
    if (existsSync(checkpoint)) this.checkpoint = JSON.parse(readFileSync(checkpoint, "utf8"));
  }
  private confirmHead(state: DeviceState) {
    if (
      this.checkpoint?.epoch === state.epoch &&
      (this.checkpoint.revision > state.revision ||
        (this.checkpoint.revision === state.revision && this.checkpoint.head !== state.head))
    )
      throw new Error(
        "DEVICE_SYNC_AUTHORITY_BEHIND: 排序库已回退，已停止发布旧快照，请检查整库备份"
      );
    if (
      this.checkpoint?.epoch === state.epoch &&
      this.checkpoint.head === state.head &&
      this.checkpoint.state
    )
      return;
    const checkpoint = { epoch: state.epoch, revision: state.revision, head: state.head, state },
      path = join(this.directory, "canonical-head.json");
    writeDeviceState(path, checkpoint);
    this.checkpoint = checkpoint;
  }
  private save() {
    const path = join(this.directory, "peers.json");
    writeDeviceState(path, this.peers);
  }
  listPeers() {
    return this.peers.map(({ id, name }) => ({ id, name }));
  }
  revoke(id: string) {
    for (let index = this.peers.length - 1; index >= 0; index--)
      if (this.peers[index].id === id) this.peers.splice(index, 1);
    this.save();
  }
  async listen(port = 24721) {
    if (this.server) return;
    this.confirmHead((await this.engine.offer()).state);
    this.transfers = new TransferFiles();
    this.server = createServer(
      { ...this.certificate, minVersion: "TLSv1.2" },
      async (request, response) => {
        let admitted = false;
        try {
          if (
            request.method !== "POST" ||
            request.headers.origin ||
            request.url !== "/device-sync/v1"
          )
            throw new Error("DEVICE_SYNC_REQUEST: 请求不被允许");
          const supplied = request.headers.authorization?.replace(/^Bearer /, "");
          if (supplied && !this.peers.some(peer => peer.hash === hash(supplied)))
            throw new Error("DEVICE_SYNC_UNTRUSTED: 此设备尚未配对或授权已撤销");
          if (this.inFlight >= 2) throw new Error("DEVICE_SYNC_BUSY: 同步繁忙，稍后自动重试");
          this.inFlight++;
          admitted = true;
          const limit = supplied ? MAX_BYTES : 16 * 1024;
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of request) {
            size += chunk.length;
            if (size > limit) throw new Error("DEVICE_SYNC_BUDGET: 请求超过预算");
            chunks.push(Buffer.from(chunk));
          }
          let body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const assertActive = () => {
            if (supplied && !this.peers.some(peer => peer.hash === hash(supplied)))
              throw new Error("DEVICE_SYNC_UNTRUSTED: 设备授权已撤销");
            if (!this.active)
              throw new Error("DEVICE_SYNC_CLOSED: 局域网连接已停止，原有改动仍保留");
          };
          assertActive();
          const transfers = this.transfers;
          if (!transfers) throw new Error("DEVICE_SYNC_CLOSED: 文件传输已停止");
          if (body.kind === "transfer-use") {
            if (!supplied) throw new Error("DEVICE_SYNC_UNTRUSTED: 文件传输需要设备授权");
            body = transfers.consume(body.id, hash(supplied));
            if (body?.kind !== "sync")
              throw new Error("DEVICE_SYNC_TRANSFER: 文件载荷不是同步请求");
          }
          let result: unknown;
          if (typeof body.kind === "string" && body.kind.startsWith("transfer-")) {
            if (!supplied) throw new Error("DEVICE_SYNC_UNTRUSTED: 文件传输需要设备授权");
            const owner = hash(supplied);
            if (body.kind === "transfer-begin") result = transfers.begin(body.file, owner);
            else if (body.kind === "transfer-write") {
              transfers.write(body.id, body.chunk, owner);
              result = { ok: true };
            } else if (body.kind === "transfer-read")
              result = transfers.read(body.id, body.offset, owner);
            else if (body.kind === "transfer-drop") {
              transfers.drop(body.id, owner);
              result = { ok: true };
            } else throw new Error("DEVICE_SYNC_REQUEST: 未知文件传输操作");
          } else if (body.kind === "pair") {
            const pairing = this.pairing;
            if (
              !pairing ||
              pairing.expires < Date.now() ||
              typeof body.secret !== "string" ||
              hash(body.secret) !== hash(pairing.secret) ||
              !/^[a-f0-9-]{36}$/.test(body.node) ||
              (pairing.node && pairing.node !== body.node)
            )
              throw new Error("DEVICE_SYNC_PAIR_EXPIRED: 配对信息无效或已过期");
            const authorizePair = () => {
              assertActive();
              if (this.pairing !== pairing || pairing.expires < Date.now())
                throw new Error("DEVICE_SYNC_PAIR_EXPIRED: 配对信息已过期");
            };
            await this.prepare();
            const offer = await this.engine.offer();
            const reply = body.existing
              ? {
                  protocol: DEVICE_SYNC_PROTOCOL,
                  kind: "delta",
                  state: offer.state,
                  changes: [],
                  documents: [],
                }
              : await this.engine.accept(
                  {
                    ...offer,
                    state: { ...offer.state, node: body.node, ackHead: "" },
                    sequence: 0,
                    changes: [],
                    documents: [],
                  },
                  authorizePair
                );
            authorizePair();
            if (!pairing.token) {
              pairing.node = body.node;
              pairing.token = randomBytes(32).toString("base64url");
              this.revoke(body.node);
              this.peers.push({
                id: body.node,
                name: typeof body.name === "string" ? body.name.slice(0, 80) : "移动设备",
                hash: hash(pairing.token),
              });
              this.save();
            }
            result = { reply, token: pairing.token };
          } else {
            const token = request.headers.authorization?.replace(/^Bearer /, "") ?? "";
            const digest = Buffer.from(hash(token), "hex");
            const peer = this.peers.find(peer => {
              const expected = Buffer.from(peer.hash, "hex");
              return expected.length === digest.length && timingSafeEqual(expected, digest);
            });
            if (!peer) throw new Error("DEVICE_SYNC_UNTRUSTED: 此设备尚未配对或授权已撤销");
            if (body.kind === "head") result = await this.engine.head(peer.id);
            else if (body.kind === "download") {
              await this.prepare();
              result = await this.engine.download(peer.id, () => {
                assertActive();
                if (!this.peers.includes(peer))
                  throw new Error("DEVICE_SYNC_UNTRUSTED: 设备授权已撤销");
              });
            } else if (body.kind === "sync") {
              if ((body.offer as DeviceOffer)?.state?.node !== peer.id)
                throw new Error("DEVICE_SYNC_PEER: 设备身份不匹配");
              await this.prepare();
              const authorize = () => {
                assertActive();
                if (!this.peers.includes(peer))
                  throw new Error("DEVICE_SYNC_UNTRUSTED: 设备授权已撤销");
              };
              result = await this.engine.accept(body.offer, authorize);
              authorize();
              if (body.offer.changes?.length || body.offer.documents?.length)
                this.changed(body.offer.changes ?? []);
            } else if (body.kind === "asset-has") result = { exists: this.assets.has(body.name) };
            else if (body.kind === "asset-read") {
              if (this.canReadAsset && !this.canReadAsset(body.name))
                throw new Error("DEVICE_SYNC_ASSET_SCOPE: 图片不属于此资料库");
              result = this.assets.read(body.name, body.offset);
            } else if (body.kind === "asset-write") {
              this.assets.write(body.name, body.offset, body.size, body.bytes, body.sha256);
              result = { ok: true };
            } else throw new Error("DEVICE_SYNC_REQUEST: 未知操作");
          }
          assertActive();
          const header =
            (result as { state?: DeviceState; reply?: { state: DeviceState } }).state ??
            (result as { reply?: { state: DeviceState } }).reply?.state;
          if (header) this.confirmHead(header);
          const bytes = Buffer.from(JSON.stringify(result));
          const fileResponse =
            bytes.length > TRANSFER_CHUNK_BYTES && ["sync", "pair", "download"].includes(body.kind);
          const token = (result as { token?: string }).token;
          const payload = fileResponse
            ? Buffer.from(
                JSON.stringify({
                  transfer: transfers.publish(bytes, hash(supplied ?? token ?? "")),
                  ...(token ? { token } : {}),
                })
              )
            : bytes;
          response.writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          response.end(payload);
        } catch (error) {
          if (response.headersSent) {
            response.destroy();
            return;
          }
          const message = error instanceof Error ? error.message : "DEVICE_SYNC_FAILED: 同步失败";
          response.writeHead(message.includes("UNTRUSTED") ? 401 : 409, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          response.end(JSON.stringify({ error: message }));
        } finally {
          if (admitted) this.inFlight--;
        }
      }
    );
    this.server.requestTimeout = 30000;
    this.server.headersTimeout = 10000;
    this.server.maxConnections = 8;
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(port, "0.0.0.0", () => resolve());
    });
    this.port = (this.server.address() as { port: number }).port;
    this.active = true;
  }
  async pairingCode() {
    if (!this.server) throw new Error("DEVICE_SYNC_DISABLED: 请先开启设备同步");
    this.pairing = {
      secret: randomBytes(32).toString("base64url"),
      expires: Date.now() + 5 * 60_000,
    };
    const view = await this.engine.offer();
    const addresses = Object.values(networkInterfaces())
      .flat()
      .filter(
        address =>
          address?.family === "IPv4" &&
          !address.internal &&
          /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address)
      )
      .map(address => address!.address)
      .slice(0, 12);
    const host = hostname().split(".")[0];
    if (/^[a-zA-Z0-9-]{1,63}$/.test(host)) addresses.push(host, `${host}.local`);
    const code = {
      protocol: DEVICE_SYNC_PROTOCOL,
      addresses,
      port: this.port,
      certificate: this.certificate.cert,
      secret: this.pairing.secret,
      library: view.state.library,
      expires: this.pairing.expires,
    };
    return {
      code: `tau-pair:v1:${Buffer.from(JSON.stringify(code)).toString("base64url")}`,
      expires: this.pairing.expires,
      addresses,
    };
  }
  async close() {
    this.active = false;
    const server = this.server;
    this.server = undefined;
    this.pairing = undefined;
    this.transfers?.close();
    this.transfers = undefined;
    if (server) {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }
}
