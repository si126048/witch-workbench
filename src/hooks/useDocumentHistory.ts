import { useCallback, useReducer } from "react";
import type { SetStateAction } from "react";
interface History<T> {
  past: T[];
  present: T;
  future: T[];
}
type Action<T> =
  | { type: "edit"; update: SetStateAction<T> }
  | { type: "reset"; value: T }
  | { type: "undo" | "redo" };
function reduce<T>(state: History<T>, action: Action<T>): History<T> {
  if (action.type === "reset")
    return { past: [], present: action.value, future: [] };
  if (action.type === "undo")
    return state.past.length
      ? {
          past: state.past.slice(0, -1),
          present: state.past[state.past.length - 1],
          future: [state.present, ...state.future],
        }
      : state;
  if (action.type === "redo")
    return state.future.length
      ? {
          past: [...state.past, state.present].slice(-100),
          present: state.future[0],
          future: state.future.slice(1),
        }
      : state;
  if (action.type !== "edit") return state;
  const present =
    typeof action.update === "function"
      ? (action.update as (value: T) => T)(state.present)
      : action.update;
  return Object.is(present, state.present)
    ? state
    : { past: [...state.past, state.present].slice(-100), present, future: [] };
}
/** A document can undo its first edit; loading a different document clears the history. */
export function useDocumentHistory<T>(initial: T) {
  const [history, dispatch] = useReducer(reduce<T>, {
    past: [],
    present: initial,
    future: [],
  });
  const setState = useCallback(
    (update: SetStateAction<T>) => dispatch({ type: "edit", update }),
    [],
  );
  const reset = useCallback(
    (value: T) => dispatch({ type: "reset", value }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: "undo" }), []),
    redo = useCallback(() => dispatch({ type: "redo" }), []);
  return {
    state: history.present,
    setState,
    reset,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
