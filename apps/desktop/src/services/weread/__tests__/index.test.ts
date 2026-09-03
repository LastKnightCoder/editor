import { afterEach, describe, expect, it, vi } from "vitest";
import useSettingStore from "@/stores/useSettingStore";
import weReadService from "..";

const { nodeFetchMock } = vi.hoisted(() => ({
  nodeFetchMock: vi.fn(),
}));

vi.mock("@/commands/extra", () => ({
  nodeFetch: nodeFetchMock,
}));

describe("services/weread validateSession", () => {
  const initialSetting = structuredClone(useSettingStore.getState().setting);

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    useSettingStore.setState((state) => ({
      ...state,
      setting: structuredClone(initialSetting),
    }));
  });

  it("API Key 校验成功后应标记为 valid", async () => {
    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...state.setting,
        integration: {
          ...state.setting.integration,
          weread: {
            ...state.setting.integration.weread,
            apiKey: "wrk-test-key",
          },
        },
      },
    }));

    nodeFetchMock.mockResolvedValue({
      status: 200,
      data: {
        apis: [],
      },
    });

    await expect(weReadService.validateSession()).resolves.toBe(true);

    expect(nodeFetchMock).toHaveBeenCalledWith(
      "https://i.weread.qq.com/api/agent/gateway",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer wrk-test-key",
          "Content-Type": "application/json",
        },
        data: {
          api_name: "/_list",
          skill_version: "1.0.4",
        },
        isRaw: true,
        allowHttpErrorStatus: true,
      }),
    );

    const weread = useSettingStore.getState().setting.integration.weread;
    expect(weread.connectionStatus).toBe("valid");
    expect(weread.userInfo.isConnected).toBe(true);
    expect(weread.lastValidatedAt).toBeGreaterThan(0);
  });

  it("回包附带 upgrade_info 时不应中断同步，仅输出警告", async () => {
    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...state.setting,
        integration: {
          ...state.setting.integration,
          weread: {
            ...state.setting.integration.weread,
            apiKey: "wrk-test-key",
          },
        },
      },
    }));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    nodeFetchMock.mockResolvedValue({
      status: 200,
      data: {
        bookId: "book-1",
        book: {
          progress: 42,
          updateTime: 1710000000,
          recordReadingTime: 3600,
        },
        upgrade_info: {
          latest_version: "1.0.5",
          current_version: "1.0.4",
          message: "微信读书 Skill 有新版本，请立即从 upgrade_url 下载最新版",
          upgrade_url: "https://cdn.weread.qq.com/skills/weread-skills.zip",
        },
      },
    });

    const result = await weReadService.getBookProgress("book-1");

    expect(result?.book.readingTime).toBe(3600);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skill 版本待升级"),
    );

    warnSpy.mockRestore();
  });

  it("API Key 缺失时应返回 false 并重置状态", async () => {
    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...state.setting,
        integration: {
          ...state.setting.integration,
          weread: {
            ...state.setting.integration.weread,
            apiKey: "",
            connectionStatus: "valid",
            userInfo: {
              isConnected: true,
            },
          },
        },
      },
    }));

    await expect(weReadService.validateSession()).resolves.toBe(false);

    const weread = useSettingStore.getState().setting.integration.weread;
    expect(weread.connectionStatus).toBe("unknown");
    expect(weread.userInfo.isConnected).toBe(false);
  });

  it("同一个 API Key 并发校验时应复用同一次请求", async () => {
    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...state.setting,
        integration: {
          ...state.setting.integration,
          weread: {
            ...state.setting.integration.weread,
            apiKey: "wrk-test-key",
          },
        },
      },
    }));

    let resolveResponse: (value: any) => void = () => {};
    nodeFetchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveResponse = resolve;
      }),
    );

    const firstValidation = weReadService.validateSession();
    const secondValidation = weReadService.validateSession();

    expect(nodeFetchMock).toHaveBeenCalledTimes(1);

    resolveResponse({
      status: 200,
      data: {
        apis: [],
      },
    });

    await expect(
      Promise.all([firstValidation, secondValidation]),
    ).resolves.toEqual([true, true]);
  });

  it("应把书架里无笔记的书也纳入 metadata 列表", async () => {
    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...state.setting,
        integration: {
          ...state.setting.integration,
          weread: {
            ...state.setting.integration.weread,
            apiKey: "wrk-test-key",
          },
        },
      },
    }));

    nodeFetchMock
      .mockResolvedValueOnce({
        status: 200,
        data: {
          books: [
            {
              bookId: "shelf-only-book",
              title: "只有书架里有的书",
              author: "作者甲",
              cover: "https://example.com/cover-a.jpg",
              category: "小说",
              readUpdateTime: 1710000000,
            },
          ],
          albums: [],
          archive: [],
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          books: [],
          hasMore: 0,
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          bookId: "shelf-only-book",
          title: "只有书架里有的书",
          author: "作者甲",
          cover: "https://example.com/cover-a.jpg",
          intro: "这是简介",
          category: "小说",
          publisher: "出版社",
          wordCount: 12345,
          newRating: 850,
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          bookId: "shelf-only-book",
          book: {
            progress: 45,
            updateTime: 1710000000,
            recordReadingTime: 3600,
            isStartReading: 1,
          },
        },
      });

    const result = await weReadService.getMetadataList();

    expect(result.failedBookIds).toEqual([]);
    expect(result.metadataList).toHaveLength(1);
    expect(result.metadataList[0]).toMatchObject({
      bookId: "shelf-only-book",
      title: "只有书架里有的书",
      author: "作者甲",
      noteCount: 0,
      reviewCount: 0,
      bookmarkCount: 0,
      intro: "这是简介",
      publisher: "出版社",
      totalWords: 12345,
      rating: "8.5",
      readInfo: {
        readingProgress: 45,
        readingTime: 3600,
        readingBookDate: 1710000000,
        finishedDate: 0,
      },
    });
  });

  it("recordReadingTime 为 0 时应使用 readingTime 作为阅读时长", async () => {
    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...state.setting,
        integration: {
          ...state.setting.integration,
          weread: {
            ...state.setting.integration.weread,
            apiKey: "wrk-test-key",
          },
        },
      },
    }));

    nodeFetchMock.mockResolvedValue({
      status: 200,
      data: {
        bookId: "book-with-reading-time",
        book: {
          progress: 42,
          updateTime: 1710000000,
          startReadingTime: 1700000000,
          recordReadingTime: 0,
          readingTime: 22981,
          isStartReading: 1,
        },
      },
    });

    const result = await weReadService.getBookProgress(
      "book-with-reading-time",
    );

    expect(result?.book.readingTime).toBe(22981);
    expect(result?.book.startReadingTime).toBe(1700000000);
  });

  it("补全元数据失败时应保留基础数据并继续上报同步进度", async () => {
    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...state.setting,
        integration: {
          ...state.setting.integration,
          weread: {
            ...state.setting.integration.weread,
            apiKey: "wrk-test-key",
          },
        },
      },
    }));

    const progressUpdates: Array<{ completed: number; total: number }> = [];

    nodeFetchMock
      .mockResolvedValueOnce({
        status: 200,
        data: {
          books: [],
          albums: [],
          archive: [],
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          books: [
            {
              bookId: "notebook-book",
              book: {
                title: "有笔记的书",
                author: "作者乙",
                cover: "https://example.com/s_cover-b.jpg",
              },
              sort: 1710000000,
              noteCount: 1,
              reviewCount: 2,
              bookmarkCount: 3,
            },
          ],
          hasMore: 0,
        },
      })
      .mockResolvedValue({
        status: 500,
        data: {},
      });

    const result = await weReadService.getMetadataList({
      onProgress: (progress) => progressUpdates.push(progress),
    });

    expect(result.failedBookIds).toEqual([]);
    expect(result.metadataList).toHaveLength(1);
    expect(result.metadataList[0]).toMatchObject({
      bookId: "notebook-book",
      title: "有笔记的书",
      noteCount: 1,
      reviewCount: 2,
      bookmarkCount: 3,
    });
    expect(progressUpdates).toEqual([
      { completed: 0, total: 1 },
      { completed: 1, total: 1 },
    ]);
  });

  it("遇到 499 限速时应等待退避后重试", async () => {
    vi.useFakeTimers();
    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...state.setting,
        integration: {
          ...state.setting.integration,
          weread: {
            ...state.setting.integration.weread,
            apiKey: "wrk-test-key",
          },
        },
      },
    }));

    nodeFetchMock
      .mockResolvedValueOnce({
        status: 200,
        data: {
          books: [
            {
              bookId: "rate-limited-book",
              title: "被限速的书",
              author: "作者丙",
              cover: "https://example.com/cover-c.jpg",
            },
          ],
          albums: [],
          archive: [],
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          books: [],
          hasMore: 0,
        },
      })
      .mockResolvedValueOnce({
        status: 499,
        data: {},
      })
      .mockResolvedValueOnce({
        status: 499,
        data: {},
      })
      .mockResolvedValueOnce({
        status: 499,
        data: {},
      })
      .mockResolvedValueOnce({
        status: 499,
        data: {},
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          bookId: "rate-limited-book",
          title: "被限速的书",
          author: "作者丙",
          cover: "https://example.com/cover-c.jpg",
          intro: "重试后成功",
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          bookId: "rate-limited-book",
          book: {
            progress: 12,
            updateTime: 1710000000,
            recordReadingTime: 1200,
          },
        },
      });

    const pendingResult = weReadService.getMetadataList();

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(pendingResult).resolves.toMatchObject({
      failedBookIds: [],
      metadataList: [
        {
          bookId: "rate-limited-book",
          intro: "重试后成功",
          readInfo: {
            readingTime: 1200,
          },
        },
      ],
    });

    expect(nodeFetchMock).toHaveBeenCalledTimes(8);
  });

  it("评论分页游标不前进时应停止继续请求", async () => {
    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...state.setting,
        integration: {
          ...state.setting.integration,
          weread: {
            ...state.setting.integration.weread,
            apiKey: "wrk-test-key",
          },
        },
      },
    }));

    nodeFetchMock.mockResolvedValue({
      status: 200,
      data: {
        reviews: [
          {
            review: {
              reviewId: "review-1",
              bookId: "book-1",
              chapterUid: 1,
              content: "想法内容",
              createTime: 1710000000,
              type: 1,
            },
          },
        ],
        hasMore: 1,
        synckey: 0,
      },
    });

    const result = await weReadService.getNotebookReviews("book-1");

    expect(nodeFetchMock).toHaveBeenCalledTimes(1);
    expect(result.reviews).toHaveLength(1);
    expect(result.hasMore).toBe(0);
  });
});
