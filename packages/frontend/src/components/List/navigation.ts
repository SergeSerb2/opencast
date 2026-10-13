/**
 * Pure selection logic shared by List, Grid and menus. Rows are a flat array in
 * display order; `selectable[i]` is false for headers, spacers and disabled items.
 */

export type MoveIntent = "up" | "down" | "pageUp" | "pageDown" | "first" | "last";

export function firstSelectable(selectable: readonly boolean[]): number {
  return selectable.indexOf(true);
}

export function lastSelectable(selectable: readonly boolean[]): number {
  return selectable.lastIndexOf(true);
}

/** Next selectable index for an intent; stays put at the ends (no wrap-around). */
export function moveSelection(selectable: readonly boolean[], current: number, intent: MoveIntent, pageSize = 1): number {
  const first = firstSelectable(selectable);
  if (first === -1) return -1;
  if (current < 0 || current >= selectable.length || !selectable[current]) {
    return intent === "up" || intent === "pageUp" || intent === "last" ? lastSelectable(selectable) : first;
  }
  if (intent === "first") return first;
  if (intent === "last") return lastSelectable(selectable);
  const direction = intent === "up" || intent === "pageUp" ? -1 : 1;
  const steps = intent === "pageUp" || intent === "pageDown" ? Math.max(1, pageSize) : 1;
  let index = current;
  let moved = 0;
  for (let i = current + direction; i >= 0 && i < selectable.length; i += direction) {
    if (!selectable[i]) continue;
    index = i;
    moved += 1;
    if (moved === steps) break;
  }
  return index;
}

/**
 * Selection after the rows changed: keep the same id when it is still there,
 * otherwise the nearest selectable row at or before the old position.
 */
export function reconcileSelection(ids: readonly (string | null)[], selectable: readonly boolean[], previousId: string | null, previousIndex: number): number {
  if (previousId !== null) {
    const same = ids.indexOf(previousId);
    if (same !== -1 && selectable[same]) return same;
  }
  if (previousIndex < 0) return firstSelectable(selectable);
  for (let i = Math.min(previousIndex, selectable.length - 1); i >= 0; i--) if (selectable[i]) return i;
  return firstSelectable(selectable);
}

/**
 * Grid movement across sections with their own column counts. `sections`
 * lists item counts and columns in order; indices are flat item indices.
 */
export function moveGridSelection(sections: readonly { count: number; columns: number }[], current: number, intent: "up" | "down" | "left" | "right"): number {
  const total = sections.reduce((n, s) => n + s.count, 0);
  if (total === 0) return -1;
  if (current < 0 || current >= total) return 0;
  if (intent === "left") return Math.max(0, current - 1);
  if (intent === "right") return Math.min(total - 1, current + 1);

  // Locate section, row and column of the current item.
  let start = 0;
  let si = 0;
  while (si < sections.length && current >= start + sections[si].count) {
    start += sections[si].count;
    si++;
  }
  const section = sections[si];
  const local = current - start;
  const col = local % section.columns;
  const row = Math.floor(local / section.columns);
  const rows = Math.ceil(section.count / section.columns);

  if (intent === "down") {
    if (row < rows - 1) return start + Math.min(section.count - 1, (row + 1) * section.columns + col);
    // First row of the next non-empty section, same column when possible.
    let nextStart = start + section.count;
    for (let n = si + 1; n < sections.length; n++) {
      if (sections[n].count > 0) return nextStart + Math.min(sections[n].count - 1, Math.min(col, sections[n].columns - 1));
      nextStart += sections[n].count;
    }
    return current;
  }
  // up
  if (row > 0) return start + (row - 1) * section.columns + col;
  let prevEnd = start;
  for (let p = si - 1; p >= 0; p--) {
    const prev = sections[p];
    const prevStart = prevEnd - prev.count;
    if (prev.count > 0) {
      const lastRowStart = Math.floor((prev.count - 1) / prev.columns) * prev.columns;
      return prevStart + Math.min(prev.count - 1, lastRowStart + Math.min(col, prev.columns - 1));
    }
    prevEnd = prevStart;
  }
  return current;
}
