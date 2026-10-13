import { describe, expect, it } from "vitest";
import { isLayoutThumbnail, layoutThumbnail } from "./thumbnail";

describe("automatic layout thumbnail compatibility", () => {
  const rect = { x: 0, y: 0, width: 0.5, height: 1 };
  const current = layoutThumbnail(rect);
  const legacy = current.replace(encodeURIComponent('data-opencast="layout-thumbnail"'),
    encodeURIComponent('data-surgecast="layout-thumbnail"'));

  it("recognizes both old and new generated icons as automatic", () => {
    for (const icon of [legacy, current]) {
      expect(isLayoutThumbnail(icon)).toBe(true);
    }
  });

  it("does not treat custom icons as automatic thumbnails", () => {
    for (const icon of [undefined, "app-window-16", { source: "custom.png" },
      "data:image/svg+xml," + encodeURIComponent('<svg data-opencast="custom-icon"/>')]) {
      expect(isLayoutThumbnail(icon)).toBe(false);
    }
  });
});
