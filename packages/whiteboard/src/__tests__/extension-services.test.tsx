import { useWhiteboardAPI } from "../extensions/context";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "@tau/ui";
import Board from "../Board";
import WhiteBoard from "../WhiteBoard";
import { createServiceId, createServiceRegistry } from "../extensions";
import {
  defineWhiteboardExtension,
  type WhiteboardAPI,
  type WhiteboardExtension,
  type WhiteboardExtensionError,
} from "../extensions/api";
import { createFileImportExtension } from "../extensions/builtins";
import {
  IWhiteboardRichText,
  createEmbeddedRichTextService,
  type WhiteboardRichTextService,
} from "../extensions/text";
import type { ServiceIdentifier } from "@tau/shared/service-contract";
import { IFileService, IResourceService, type ResourceService } from "@tau/shared/host-services";
import { IDownloadService, IMediaInfoService } from "@tau/shared/media-services";

const viewport = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };
const boards: Board[] = [];
const createBoard = () => {
  const board = new Board([], viewport, { selectedElements: [], selectArea: null });
  boards.push(board);
  return board;
};
const install = (
  board: Board,
  extensions: readonly WhiteboardExtension[],
  services?: ReturnType<typeof createServiceRegistry>
) => {
  const errors: WhiteboardExtensionError[] = [];
  board.installExtensions(extensions, error => errors.push(error), services);
  return errors;
};
afterEach(() => {
  boards.splice(0).forEach(board => board.destroy());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("白板扩展的宿主服务访问", () => {
  it("宿主可为每个扩展绑定同名服务的独立实例", () => {
    const token = createServiceId<{ owner: string }>("test.scoped");
    const seen: string[] = [];
    const board = createBoard();
    board.installExtensions(
      ["demo.first", "demo.second"].map(id =>
        defineWhiteboardExtension({
          id,
          requires: [token],
          create: api => {
            seen.push(api.getService(token).owner);
            return {};
          },
        })
      ),
      undefined,
      undefined,
      id => createServiceRegistry(register => register(token, { owner: id }))
    );
    expect(board.extensions?.getRejectedExtensions()).toEqual([]);
    expect(seen).toEqual(["demo.first", "demo.second"]);
  });
  it("宿主注册的服务经 requires 声明后，create 中 getService 拿到同一实例", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const resource: ResourceService = { upload: async () => "whiteboard://file" };
    const received: unknown[] = [];
    const errors = install(
      createBoard(),
      [
        defineWhiteboardExtension({
          id: "acme.upload",
          requires: [IResourceService],
          create: api => {
            received.push(api.getService(IResourceService));
            return {};
          },
        }),
      ],
      createServiceRegistry(register => register(IResourceService, resource))
    );
    expect(errors).toEqual([]);
    expect(received).toEqual([resource]);
  });

  it("requires 的服务未注册时扩展被拒（missing-service，target 为服务 id），其它扩展正常", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const board = createBoard();
    const errors = install(board, [
      defineWhiteboardExtension({
        id: "acme.needy",
        requires: [IFileService],
        create: () => ({}),
      }),
      defineWhiteboardExtension({
        id: "acme.ok",
        create: () => ({ commands: [{ id: "acme.ok.ping", execute: () => "pong" }] }),
      }),
    ]);
    expect(errors).toMatchObject([
      { extensionId: "acme.needy", reason: "missing-service", target: "fileService" },
    ]);
    await expect(board.extensions!.execute("acme.ok.ping")).resolves.toBe("pong");
  });

  it("optional 服务：缺失时 tryGetService 返回 undefined，已注册时拿到实例，getService 对 optional 抛错", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const resource: ResourceService = { upload: async () => "whiteboard://file" };
    let extensionApi: WhiteboardAPI | undefined;
    const errors = install(
      createBoard(),
      [
        defineWhiteboardExtension({
          id: "acme.flexible",
          requires: [IFileService],
          optional: [IResourceService],
          create: api => {
            extensionApi = api;
            return {};
          },
        }),
      ],
      createServiceRegistry(
        register =>
          register(IFileService, {
            select: async () => null,
            readText: async () => "",
            getBaseName: () => "",
            getHomeDir: async () => "",
          }),
        register => register(IResourceService, resource)
      )
    );
    expect(errors).toEqual([]);
    expect(extensionApi!.tryGetService(IResourceService)).toBe(resource);
    expect(extensionApi!.getService(IFileService)).toBeDefined();
    expect(() => extensionApi!.getService(IResourceService)).toThrow("请改用 tryGetService");

    let registrylessApi: WhiteboardAPI | undefined;
    const registryless = install(createBoard(), [
      defineWhiteboardExtension({
        id: "acme.flexible",
        optional: [IResourceService],
        create: api => {
          registrylessApi = api;
          return {};
        },
      }),
    ]);
    expect(registryless).toEqual([]);
    expect(registrylessApi!.tryGetService(IResourceService)).toBeUndefined();
  });

  it("取未声明的服务（getService 与 tryGetService）抛中文错误", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ITestEchoService = createServiceId<{ echo(): string }>("test.echo");
    let extensionApi: WhiteboardAPI | undefined;
    const errors = install(
      createBoard(),
      [
        defineWhiteboardExtension({
          id: "acme.declared",
          optional: [IFileService],
          create: api => {
            extensionApi = api;
            return {};
          },
        }),
      ],
      createServiceRegistry(register => register(IResourceService, { upload: async () => "" }))
    );
    expect(errors).toEqual([]);
    expect(() => extensionApi!.getService(ITestEchoService)).toThrow("未声明服务");
    expect(() => extensionApi!.tryGetService(ITestEchoService)).toThrow("未声明服务");
  });

  it("requires 中出现非服务标识的值时按 invalid-definition 拒绝", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const errors = install(createBoard(), [
      defineWhiteboardExtension({
        id: "acme.bogus",
        requires: ["oops" as unknown as ServiceIdentifier<unknown>],
        create: () => ({}),
      }),
    ]);
    expect(errors).toMatchObject([
      { extensionId: "acme.bogus", reason: "invalid-definition", target: "oops" },
    ]);
  });

  it("主 api 不提供服务访问，调用即抛错", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const board = createBoard();
    install(
      board,
      [defineWhiteboardExtension({ id: "acme.plain", create: () => ({}) })],
      createServiceRegistry(register => register(IResourceService, { upload: async () => "" }))
    );
    expect(() => board.extensions!.api.getService(IResourceService)).toThrow(
      "主 API 不提供宿主服务访问"
    );
    expect(() => board.extensions!.api.tryGetService(IResourceService)).toThrow(
      "主 API 不提供宿主服务访问"
    );
  });

  it("不传 services prop：声明 requires 的扩展被拒，无服务依赖的扩展正常装配", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    );
    const errors: WhiteboardExtensionError[] = [];
    const needy = defineWhiteboardExtension({
      id: "acme.needy",
      requires: [IResourceService],
      create: () => ({}),
    });
    const calm = defineWhiteboardExtension({
      id: "acme.calm",
      create: () => ({
        layers: [{ id: "acme.calm.layer", position: "outside", component: () => <g data-calm /> }],
      }),
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <WhiteBoard
            extensions={[needy, calm]}
            onExtensionError={error => errors.push(error)}
            initData={[]}
            initViewPort={viewport}
            showToolbar={false}
            showAttributeSetter={false}
            showStatusBar={false}
          />
        )
      );
      expect(errors).toMatchObject([
        { extensionId: "acme.needy", reason: "missing-service", target: "resourceService" },
      ]);
      expect(container.querySelector("[data-whiteboard-root]")).toBeTruthy();
      expect(container.querySelector("[data-calm]")).toBeTruthy();
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("组件传入 services prop 后扩展在 create 中拿到宿主服务实例", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    );
    const errors: WhiteboardExtensionError[] = [];
    const resource: ResourceService = { upload: async () => "whiteboard://file" };
    const received: unknown[] = [];
    const uploader = defineWhiteboardExtension({
      id: "acme.upload",
      requires: [IResourceService],
      create: api => {
        received.push(api.getService(IResourceService));
        return {};
      },
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <WhiteBoard
            extensions={[uploader]}
            onExtensionError={error => errors.push(error)}
            services={createServiceRegistry(register => register(IResourceService, resource))}
            initData={[]}
            initViewPort={viewport}
            showToolbar={false}
            showAttributeSetter={false}
            showStatusBar={false}
          />
        )
      );
      expect(errors).toEqual([]);
      expect(received).toEqual([resource]);
    } finally {
      await act(async () => root.unmount());
    }
  });
});

describe("内置与第三方扩展的媒体、富文本服务消费", () => {
  const stubResizeObserver = () =>
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    );

  it("第三方扩展 optional 富文本服务：宿主注册时元素 render 拿到宿主 Editor，无宿主时自行退回嵌入式实现", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubResizeObserver();
    const resolved: (WhiteboardRichTextService | undefined)[] = [];
    function HostEditor() {
      return <div data-host-editor />;
    }
    const rich = defineWhiteboardExtension({
      id: "acme.rich",
      optional: [IWhiteboardRichText],
      elements: [
        {
          type: "acme.rich",
          render: function ServiceElement() {
            const service = useWhiteboardAPI().tryGetService(IWhiteboardRichText);
            resolved.push(service);
            if (service) return <service.Editor />;
            return <g data-acme-embedded />;
          },
        },
      ],
      create: () => ({}),
    });
    const mount = async (services?: ReturnType<typeof createServiceRegistry>) => {
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      let markers: { hostEditor: Element | null; embedded: Element | null };
      try {
        await act(async () =>
          root.render(
            <WhiteBoard
              extensions={[rich]}
              services={services}
              initData={[{ id: "rich", type: "acme.rich", x: 0, y: 0, width: 10, height: 10 }]}
              initViewPort={viewport}
              showToolbar={false}
              showAttributeSetter={false}
              showStatusBar={false}
            />
          )
        );
        markers = {
          hostEditor: container.querySelector("[data-host-editor]"),
          embedded: container.querySelector("[data-acme-embedded]"),
        };
      } finally {
        await act(async () => root.unmount());
        container.remove();
      }
      return markers;
    };
    const withHost = await mount(
      createServiceRegistry(register =>
        register(IWhiteboardRichText, { ...createEmbeddedRichTextService(), Editor: HostEditor })
      )
    );
    expect(withHost.hostEditor).toBeTruthy();
    expect(resolved[0]?.Editor).toBe(HostEditor);

    const withoutHost = await mount();
    expect(withoutHost.hostEditor).toBeNull();
    expect(resolved[1]).toBeUndefined();
    expect(withoutHost.embedded).toBeTruthy();
    expect(typeof createEmbeddedRichTextService().Editor).toBe("function");
    expect(createEmbeddedRichTextService().content).toBeUndefined();
  });

  it("第三方扩展 requires IResourceService 上传文件得到宿主返回的 URL", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const upload = vi.fn(async (file: File) => `app://resources/${file.name}`);
    let uploadedUrl: string | undefined;
    const board = createBoard();
    install(
      board,
      [
        defineWhiteboardExtension({
          id: "acme.uploader",
          requires: [IResourceService],
          create: api => ({
            commands: [
              {
                id: "acme.uploader.upload",
                execute: async () => {
                  uploadedUrl = await api
                    .getService(IResourceService)
                    .upload(new File(["image"], "a.png", { type: "image/png" }));
                },
              },
            ],
          }),
        }),
      ],
      createServiceRegistry(register => register(IResourceService, { upload }))
    );
    await expect(board.extensions!.execute("acme.uploader.upload")).resolves.toBeUndefined();
    expect(upload).toHaveBeenCalledExactlyOnceWith(expect.any(File));
    expect(uploadedUrl).toBe("app://resources/a.png");
  });

  const pasteEvent = () => {
    const event = new Event("paste", { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        items: [
          {
            type: "image/png",
            getAsFile: () => new File(["image"], "a.png", { type: "image/png" }),
          },
        ],
        getData: () => "",
      },
    });
    return event;
  };

  it("内置 file-import：注册上传服务后粘贴走宿主上传；未注册时粘贴入口不接管", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const bare = createBoard();
    install(bare, [createFileImportExtension()]);
    expect(bare.extensions!.ingest("paste", pasteEvent())).toBe(false);
    bare.destroy();

    const board = createBoard();
    install(
      board,
      [createFileImportExtension()],
      createServiceRegistry(
        register => register(IResourceService, { upload: async () => "app://resources/a.png" }),
        register =>
          register(IMediaInfoService, {
            imageInfo: async () => ({ width: 120, height: 60 }),
            videoInfo: async () => null,
          })
      )
    );
    expect(board.extensions!.ingest("paste", pasteEvent())).toBe(true);
    await vi.waitFor(() => expect(board.children).toHaveLength(1));
    expect(board.children[0]).toMatchObject({ type: "image", src: "app://resources/a.png" });
    board.destroy();
  });

  it("上传服务按 shared 契约返回空串时统一视为失败：粘贴不插入元素", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const dismiss = vi.spyOn(toast, "dismiss");
    const board = createBoard();
    install(
      board,
      [createFileImportExtension()],
      createServiceRegistry(
        register => register(IResourceService, { upload: async () => "" }),
        register =>
          register(IMediaInfoService, {
            imageInfo: async () => ({ width: 120, height: 60 }),
            videoInfo: async () => null,
          })
      )
    );
    board.onPaste(pasteEvent());
    await vi.waitFor(() => expect(dismiss).toHaveBeenCalled());
    expect(board.children).toHaveLength(0);
    board.destroy();
  });
});
