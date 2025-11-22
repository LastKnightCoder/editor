const { createRequire } = require("module");
const path = require("path");
const fs = require("fs");
const os = require("os");
const PREFIX = "[tailwind-worker]";
const nodeRequire = createRequire(__filename);
const tailwindPackageRoot = path.dirname(
  nodeRequire.resolve("tailwindcss/package.json"),
);
const tailwindRequire = createRequire(
  path.join(tailwindPackageRoot, "package.json"),
);
const { compile: compileTailwind } = nodeRequire("tailwindcss");
const { Scanner } = nodeRequire("@tailwindcss/oxide");

if (typeof compileTailwind !== "function") {
  console.error(
    `${PREFIX} Missing tailwindcss compile API. Please ensure tailwindcss@4+ is installed.`,
  );
  process.exit(1);
}

const BASE_CSS = `@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));
`;

/**
 * @typedef {{ id: number; content: string; extension?: string }} CompileJob
 */

const queue = [];
let running = false;
const tempDir = path.join(os.tmpdir(), "custom-block-tailwind");
fs.mkdirSync(tempDir, { recursive: true });

async function runJob(job) {
  const content = job.content ?? "";
  const extension = normalizeExtension(job.extension);
  const nonce = `${process.pid}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
  const tempFilePath = path.join(tempDir, `custom-block-${nonce}.${extension}`);
  const normalizedPath = tempFilePath.replace(/\\/g, "/");
  const runtimeCss = `${BASE_CSS}\n@source "${normalizedPath}";\n`;

  try {
    await fs.promises.writeFile(tempFilePath, content, "utf8");

    const builder = await compileTailwind(runtimeCss, {
      from: "custom-block-inline.css",
      async loadStylesheet(id, base) {
        const normalizedId = id?.replace(/\\/g, "/");
        if (normalizedId === normalizedPath) {
          const fileContent = await fs.promises.readFile(tempFilePath, "utf8");
          return {
            path: normalizedPath,
            base: path.dirname(normalizedPath),
            content: fileContent,
          };
        }
        const resolved = resolveStylesheet(id, base);
        const fileContent = await fs.promises.readFile(resolved, "utf8");
        return {
          path: resolved,
          base: path.dirname(resolved),
          content: fileContent,
        };
      },
    });

    const scanner = new Scanner({
      sources: [
        {
          base: path.dirname(tempFilePath),
          pattern: path.basename(tempFilePath),
          negated: false,
        },
      ],
    });

    const candidates = scanner
      .scan([
        {
          extension,
        },
      ])
      .map((entry) =>
        typeof entry === "string" ? entry : (entry?.candidate ?? ""),
      )
      .filter(Boolean);

    const css = builder.build(candidates);
    if (process.send) {
      process.send({ ok: true, id: job.id, css });
    }
  } catch (error) {
    const message =
      error && error.stack ? String(error.stack) : String(error ?? "Unknown");
    console.error(`${PREFIX} compile error:\n${message}`);
    if (process.send) {
      process.send({
        ok: false,
        id: job.id,
        error: message,
      });
    }
  } finally {
    await fs.promises.unlink(tempFilePath).catch(() => {});
  }
}

function flush() {
  if (running) return;
  const job = queue.shift();
  if (!job) {
    running = false;
    return;
  }
  running = true;
  runJob(job)
    .catch(() => {})
    .finally(() => {
      running = false;
      flush();
    });
}

process.on("message", (msg) => {
  queue.push(msg);
  flush();
});

process.on("uncaughtException", (error) => {
  console.error(`${PREFIX} uncaught exception`, error);
});

process.on("unhandledRejection", (reason) => {
  console.error(`${PREFIX} unhandled rejection`, reason);
});

function resolveStylesheet(id, base = process.cwd()) {
  if (!id) {
    throw new Error("Unknown stylesheet request");
  }

  const isTailwindImport =
    id === "tailwindcss" || id.startsWith("tailwindcss/");
  if (isTailwindImport) {
    const suffix = id === "tailwindcss" ? "index.css" : `${id.slice(12)}.css`;
    const candidate = path.join(tailwindPackageRoot, suffix);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const absolute = path.isAbsolute(id)
    ? id
    : path.resolve(base || process.cwd(), id);

  if (!fs.existsSync(absolute)) {
    throw new Error(`Unable to resolve stylesheet "${id}" from "${base}"`);
  }

  return absolute;
}

function normalizeExtension(ext) {
  const fallback = "tsx";
  if (!ext) return fallback;
  const clean = String(ext)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!clean) return fallback;
  return clean;
}
