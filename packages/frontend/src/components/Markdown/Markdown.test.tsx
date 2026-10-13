import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Markdown, markdownUrlTransform } from "./Markdown";

afterEach(cleanup);

describe("Markdown upgrade compatibility", () => {
  it("renders saved legacy deep links and file images", () => {
    const link = "surgecast://extensions/surgecast/notes/openNotes";
    const image = "surgecast-file:///tmp/saved-image.png";
    const view = render(<Markdown>{`[Open notes](${link})\n\n![Saved image](${image})`}</Markdown>);
    expect(view.getByRole("link").getAttribute("href")).toBe(link);
    expect(view.getByRole("img").getAttribute("src")).toBe(image);
    expect(markdownUrlTransform("opencast://commands/notes")).toBe("opencast://commands/notes");
    expect(markdownUrlTransform("opencast-file:///tmp/new.png")).toBe("opencast-file:///tmp/new.png");
  });
  it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "surgecast-script:alert(1)"])
    ("still removes unsafe URLs: %s", url => expect(markdownUrlTransform(url)).toBe(""));
});
