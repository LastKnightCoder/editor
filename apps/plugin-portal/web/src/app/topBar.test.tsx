// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { UiProvider } from "@tau/ui";
import { createMockApi } from "../api/mock/mockApi";
import { ApiProvider, createQueryClient } from "./api";
import { TopBar } from "./TopBar";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("窄屏顶栏将导航独立成第二行，品牌和导航文字保持单行", () => {
  const api = createMockApi();
  render(
    <MemoryRouter initialEntries={["/plugins/example.counter"]}>
      <UiProvider>
        <ApiProvider api={api}>
          <QueryClientProvider client={createQueryClient()}>
            <TopBar />
          </QueryClientProvider>
        </ApiProvider>
      </UiProvider>
    </MemoryRouter>
  );

  const brand = screen.getByRole("link", { name: "Tau 插件" });
  expect(brand.className).toContain("shrink-0");
  expect(brand.className).toContain("whitespace-nowrap");

  const navigation = screen.getByRole("navigation", { name: "主导航" });
  expect(navigation.className).toContain("order-3");
  expect(navigation.className).toContain("w-full");
  expect(navigation.className).toContain("overflow-x-auto");
  expect(navigation.className).toContain("sm:order-none");
  for (const link of within(navigation).getAllByRole("link")) {
    expect(link.className).toContain("shrink-0");
    expect(link.className).toContain("whitespace-nowrap");
  }
});
