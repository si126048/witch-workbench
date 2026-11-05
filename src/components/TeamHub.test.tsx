import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TeamHub from "./TeamHub";
const profile = {
  kind: "nightfall-team",
  version: 1,
  name: "Demo Team",
  remote: "https://example.invalid/team/game.git",
  branch: "main",
  sdkVersion: "8.5.3",
};
const hub = vi.fn(),
  onOpen = vi.fn().mockResolvedValue(undefined),
  setOpen = vi.fn();
const props = {
  open: true,
  setOpen,
  root: null,
  dirty: false,
  onOpen,
  onSdk: vi.fn().mockResolvedValue(undefined),
  sdkPath: "",
};
beforeEach(() => {
  vi.clearAllMocks();
  hub.mockImplementation(async (action: string) => ({
    ok: true,
    value:
      action === "environment"
        ? {
            git: "git 2",
            lfs: "lfs 3",
            name: "Member",
            email: "member@example.invalid",
          }
        : action === "recent"
          ? []
          : null,
  }));
  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    value: { nightfall: { hub, onTeamRequest: vi.fn(() => () => {}) } },
  });
});
describe("team launch flows", () => {
  it("offers explicit saving without clearing the unsaved-edit guard itself", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<TeamHub {...props} root="D:/owner" dirty onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "负责人建队" }));
    fireEvent.click(screen.getByRole("button", { name: "保存剧本与项目设置" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("button", { name: "配置当前游戏仓库" }),
    ).toBeDisabled();
  });
  it("does not overwrite identity entered while environment detection is pending", async () => {
    let finish: (value: unknown) => void = () => {};
    hub.mockImplementation(async (action: string) =>
      action === "environment"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : { ok: true, value: action === "recent" ? [] : null },
    );
    render(<TeamHub {...props} root="D:/member" />);
    fireEvent.click(screen.getByRole("button", { name: "日常开工" }));
    fireEvent.change(screen.getByLabelText("提交姓名"), {
      target: { value: "New Member" },
    });
    fireEvent.change(screen.getByLabelText("提交邮箱"), {
      target: { value: "new@example.invalid" },
    });
    finish({
      ok: true,
      value: {
        git: "git detected",
        lfs: "lfs detected",
        name: "Old Identity",
        email: "old@example.invalid",
      },
    });
    await waitFor(() =>
      expect(screen.getByText(/git detected/)).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("提交姓名")).toHaveValue("New Member");
    expect(screen.getByLabelText("提交邮箱")).toHaveValue(
      "new@example.invalid",
    );
  });
  it("imports a member profile and opens the cloned worktree", async () => {
    hub.mockImplementation(async (action: string) => ({
      ok: true,
      value:
        action === "environment"
          ? { git: "git 2", lfs: "lfs 3" }
          : action === "recent"
            ? []
            : action === "import"
              ? profile
              : action === "join"
                ? { profile, root: "D:/member" }
                : null,
    }));
    render(<TeamHub {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "导入团队配置" }));
    await waitFor(() =>
      expect(screen.getByLabelText("游戏仓库地址")).toHaveValue(profile.remote),
    );
    fireEvent.click(screen.getByRole("button", { name: "选择目录并加入团队" }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("D:/member"));
    expect(screen.getByText("当前副本：D:/member")).toBeInTheDocument();
  });
  it("keeps authentication failure visible without claiming that a clone succeeded", async () => {
    hub.mockImplementation(async (action: string) =>
      action === "join"
        ? { ok: false, error: "Authentication required" }
        : {
            ok: true,
            value:
              action === "environment"
                ? { git: "git 2", lfs: "lfs 3" }
                : action === "recent"
                  ? []
                  : action === "import"
                    ? profile
                    : null,
          },
    );
    render(<TeamHub {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "导入团队配置" }));
    await waitFor(() =>
      expect(screen.getByLabelText("游戏仓库地址")).toHaveValue(profile.remote),
    );
    fireEvent.click(screen.getByRole("button", { name: "选择目录并加入团队" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Authentication required",
    );
    expect(onOpen).not.toHaveBeenCalled();
  });
  it("daily shortcut fetches and opens automatically, but blocks unsaved project switching", async () => {
    hub.mockImplementation(async (action: string) => ({
      ok: true,
      value:
        action === "startup"
          ? { profile, root: "D:/member" }
          : action === "daily"
            ? { warning: "", status: { ahead: 0, behind: 0 } }
            : action === "environment"
              ? { git: "git 2", lfs: "lfs 3" }
              : [],
    }));
    const view = render(<TeamHub {...props} />);
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("D:/member"));
    expect(hub).toHaveBeenCalledWith("daily", "D:/member");
    expect(setOpen).toHaveBeenCalledWith(false);
    view.unmount();
    vi.clearAllMocks();
    render(<TeamHub {...props} dirty />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "当前编辑尚未保存",
    );
    expect(onOpen).not.toHaveBeenCalled();
  });
  it("exports the owner package and preserves explicit installer choice", async () => {
    render(<TeamHub {...props} root="D:/owner" />);
    fireEvent.click(screen.getByRole("button", { name: "负责人建队" }));
    fireEvent.change(screen.getByLabelText("游戏仓库地址"), {
      target: { value: profile.remote },
    });
    fireEvent.click(screen.getByLabelText("导出时选择并附带工作台安装包"));
    fireEvent.click(screen.getByRole("button", { name: "生成成员加入包" }));
    await waitFor(() =>
      expect(hub).toHaveBeenCalledWith(
        "export",
        expect.objectContaining({ remote: profile.remote }),
        false,
      ),
    );
  });
});
