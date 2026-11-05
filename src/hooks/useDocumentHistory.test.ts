import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useDocumentHistory } from "./useDocumentHistory";
it("undoes the first edit and drops redo after a different edit", () => {
  const { result } = renderHook(() =>
    useDocumentHistory({ title: "Original" }),
  );
  act(() => result.current.setState({ title: "First edit" }));
  act(() => result.current.undo());
  expect(result.current.state.title).toBe("Original");
  expect(result.current.canRedo).toBe(true);
  act(() => result.current.redo());
  expect(result.current.state.title).toBe("First edit");
  act(() => result.current.undo());
  act(() => result.current.setState({ title: "Different edit" }));
  expect(result.current.canRedo).toBe(false);
});
it("does not restore a different scene after loading a new document", () => {
  const { result } = renderHook(() => useDocumentHistory({ title: "Scene A" }));
  act(() => result.current.setState({ title: "Edited A" }));
  act(() => result.current.reset({ title: "Scene B" }));
  act(() => result.current.undo());
  expect(result.current.state.title).toBe("Scene B");
  expect(result.current.canUndo).toBe(false);
});
