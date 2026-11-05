import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import TeamSyncPanel from "./TeamSyncPanel";
const status = {
  environment: { git: "git 2", lfs: "lfs 3" },
  repository: true,
  branch: "scene/test",
  files: [{ path: "game/script.rpy", status: " M", conflicted: false }],
  history: [],
};
afterEach(() => {
  cleanup();
  Object.defineProperty(window, "electronAPI", {
    value: undefined,
    writable: true,
  });
});
function api() {
  const team = vi.fn().mockResolvedValue({ ok: true, value: "Committed" });
  Object.defineProperty(window, "electronAPI", {
    value: {
      nightfall: {
        status: vi.fn().mockResolvedValue({ ok: true, value: status }),
        team,
        onProgress: () => () => {},
      },
    },
    writable: true,
  });
  return team;
}
describe("team commit safeguards", () => {
  it("blocks a commit while the editor contains unsaved changes", async () => {
    const team = api();
    render(<TeamSyncPanel dirty />);
    await screen.findByText("game/script.rpy");
    fireEvent.click(screen.getByLabelText("选择 game/script.rpy"));
    fireEvent.change(screen.getByLabelText("提交说明"), {
      target: { value: "Scene edit" },
    });
    expect(screen.getByRole("button", { name: "提交所选文件" })).toBeDisabled();
    expect(team).not.toHaveBeenCalled();
  });
  it("submits only the selected files and the explicit message", async () => {
    const team = api();
    render(<TeamSyncPanel dirty={false} />);
    await screen.findByText("game/script.rpy");
    fireEvent.click(screen.getByLabelText("选择 game/script.rpy"));
    fireEvent.change(screen.getByLabelText("提交说明"), {
      target: { value: "Scene edit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交所选文件" }));
    await screen.findByText("Committed");
    expect(team).toHaveBeenCalledWith("commit", {
      files: ["game/script.rpy"],
      message: "Scene edit",
    });
  });
});
