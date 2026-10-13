import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Grid } from "./Grid";

beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each(["surgecast-file", "opencast-file"])("renders %s images with the Grid fit and inset", scheme => {
  const url = `${scheme}:///tmp/saved-image.png`;
  const view = render(<Grid columns={4} fit="fill" inset="small">
    <Grid.Item title="Saved image" content={url} />
  </Grid>);
  const image = view.getByRole("gridcell", { name: "Saved image" }).querySelector("img")!;
  expect(image.getAttribute("src")).toBe(url);
  const frame = image.closest<HTMLElement>(".sc-grid-cell__image");
  expect(frame?.getAttribute("data-fit")).toBe("fill");
  expect(frame?.style.padding).toBe("32px");
});
