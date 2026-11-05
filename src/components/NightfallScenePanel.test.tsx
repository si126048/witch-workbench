import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import NightfallScenePanel from "./NightfallScenePanel";
import {
  sampleScene,
  serializeScene,
  generateScene,
} from "../lib/sceneDocument.js";
afterEach(() => {
  cleanup();
  Object.defineProperty(window, "electronAPI", {
    value: undefined,
    writable: true,
  });
});
it("keeps a new invalid scene dirty so it cannot be silently discarded", async () => {
  const onDirtyChange = vi.fn();
  Object.defineProperty(window, "electronAPI", {
    value: {
      nightfall: {
        sceneList: vi.fn().mockResolvedValue({ ok: true, value: [] }),
        sceneLoad: vi
          .fn()
          .mockResolvedValue({
            ok: true,
            value: {
              scene: null,
              document: null,
              script: null,
              revision: { document: null, script: null },
            },
          }),
        sceneDraftRead: vi.fn().mockResolvedValue({ ok: true, value: null }),
        sceneDraftWrite: vi.fn().mockResolvedValue({ ok: true }),
      },
    },
    writable: true,
  });
  render(
    <NightfallScenePanel root="D:/project" onDirtyChange={onDirtyChange} />,
  );
  const add = screen.getByRole("button", { name: "添加图层" });
  await waitFor(() => expect(add).toBeEnabled());
  fireEvent.click(add);
  await screen.findByRole("alert");
  expect(onDirtyChange.mock.calls.at(-1)?.[0]).toBe(true);
});
it("retains edited content when a stale disk revision rejects the save", async () => {
  const scene = sampleScene();
  const value = {
    scene,
    document: serializeScene(scene),
    script: generateScene(scene),
    revision: { document: "old-doc", script: "old-script" },
  };
  const sceneSave = vi
    .fn()
    .mockResolvedValue({ ok: false, error: "Scene changed on disk." });
  const sceneDraftClear = vi.fn();
  Object.defineProperty(window, "electronAPI", {
    value: {
      nightfall: {
        sceneList: vi.fn().mockResolvedValue({ ok: true, value: ["opening"] }),
        sceneLoad: vi.fn().mockResolvedValue({ ok: true, value }),
        sceneDraftRead: vi.fn().mockResolvedValue({ ok: true, value: null }),
        sceneDraftWrite: vi.fn().mockResolvedValue({ ok: true }),
        sceneSave,
        sceneDraftClear,
      },
    },
    writable: true,
  });
  render(<NightfallScenePanel root="D:/project" onDirtyChange={() => {}} />);
  const title = await screen.findByDisplayValue("序章 · 雨停之前");
  fireEvent.change(title, { target: { value: "My retained draft" } });
  fireEvent.click(screen.getByRole("button", { name: "审阅生成差异" }));
  fireEvent.click(
    screen.getAllByRole("button", { name: "确认成对保存" }).at(-1)!,
  );
  await screen.findByRole("alert");
  expect(title).toHaveValue("My retained draft");
  expect(sceneDraftClear).not.toHaveBeenCalled();
  expect(sceneSave.mock.calls[0][1]).toEqual({
    document: "old-doc",
    script: "old-script",
  });
});
