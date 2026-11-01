import { generateKeyPairSync, randomBytes, sign, X509Certificate } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeDeviceState } from "./atomic-file";
import { join } from "node:path";

const der = (tag: number, ...parts: Uint8Array[]): Buffer => {
  const body = Buffer.concat(parts),
    length: number[] = [];
  if (body.length < 128) length.push(body.length);
  else {
    let size = body.length;
    while (size) {
      length.unshift(size & 255);
      size >>>= 8;
    }
    length.unshift(128 | length.length);
  }
  return Buffer.concat([Buffer.from([tag, ...length]), body]);
};
const sequence = (...parts: Uint8Array[]) => der(48, ...parts);
const oid = (text: string) => {
  const [first, second, ...rest] = text.split(".").map(Number),
    bytes = [first * 40 + second];
  for (let value of rest) {
    const arc = [value & 127];
    while ((value >>>= 7)) arc.unshift(128 | (value & 127));
    bytes.push(...arc);
  }
  return der(6, Buffer.from(bytes));
};
const pem = (type: string, bytes: Uint8Array) =>
  `-----BEGIN ${type}-----\n${Buffer.from(bytes)
    .toString("base64")
    .match(/.{1,64}/g)!
    .join("\n")}\n-----END ${type}-----\n`;
const time = (date: Date) =>
  der(23, Buffer.from(date.toISOString().replace(/[-:T]/g, "").slice(2, 14) + "Z"));

/** 只生成标准 X.509 自签叶证书，握手与身份校验由原生 TLS 实现。 */
export function deviceCertificate(directory: string): { cert: string; key: string } {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "identity.json");
  if (existsSync(path)) {
    const value = JSON.parse(readFileSync(path, "utf8")) as { cert: string; key: string };
    const cert = new X509Certificate(value.cert);
    if (
      !cert.verify(cert.publicKey) ||
      !cert.checkHost("tau-device.local") ||
      Date.parse(cert.validTo) < Date.now()
    )
      throw new Error("DEVICE_SYNC_CERTIFICATE: 配对证书已失效，请重新建立设备信任");
    return value;
  }
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const algorithm = sequence(oid("1.2.840.10045.4.3.2"));
  const name = sequence(der(49, sequence(oid("2.5.4.3"), der(12, Buffer.from("Tau Device Sync")))));
  const now = new Date(),
    start = new Date(now.getTime() - 86400000),
    end = new Date(now.getTime() + 5 * 365 * 86400000);
  const serial = randomBytes(16);
  serial[0] &= 127;
  serial[0] |= 1;
  const extension = (id: string, bytes: Buffer) => sequence(oid(id), der(4, bytes));
  const tbs = sequence(
    der(160, der(2, Buffer.from([2]))),
    der(2, serial),
    algorithm,
    name,
    sequence(time(start), time(end)),
    name,
    keys.publicKey.export({ format: "der", type: "spki" }),
    der(
      163,
      sequence(
        extension("2.5.29.17", sequence(der(130, Buffer.from("tau-device.local")))),
        extension("2.5.29.19", sequence()),
        extension("2.5.29.37", sequence(oid("1.3.6.1.5.5.7.3.1")))
      )
    )
  );
  const bytes = sequence(
    tbs,
    algorithm,
    der(3, Buffer.from([0]), sign("sha256", tbs, keys.privateKey))
  );
  const value = {
    cert: pem("CERTIFICATE", bytes),
    key: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
  const certificate = new X509Certificate(value.cert);
  if (!certificate.verify(keys.publicKey)) throw new Error("DEVICE_SYNC_CERTIFICATE: 证书生成失败");
  writeDeviceState(path, value);
  return value;
}
