import { useCallback, useRef, useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/core";
import { useNotesStore } from "../store";

function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((key) => Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/**
 * Derive UI state (active marks, list type, …) from the editor. Re-evaluates
 * on every transaction and when the document is replaced wholesale.
 */
export function useEditorSelector<T>(editor: Editor | null, selector: (editor: Editor) => T, fallback: T): T {
  const cache = useRef<{ value: T } | null>(null);
  useNotesStore((state) => state.docVersion);
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!editor) return () => undefined;
      editor.on("transaction", notify);
      editor.on("focus", notify);
      editor.on("blur", notify);
      return () => {
        editor.off("transaction", notify);
        editor.off("focus", notify);
        editor.off("blur", notify);
      };
    },
    [editor],
  );
  const getSnapshot = () => {
    const next = editor ? selector(editor) : fallback;
    if (cache.current && shallowEqual(cache.current.value, next)) return cache.current.value;
    cache.current = { value: next };
    return next;
  };
  return useSyncExternalStore(subscribe, getSnapshot);
}
