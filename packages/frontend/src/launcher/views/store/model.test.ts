import { describe, expect, it } from "vitest";
import type { StoreExtension } from "@opencast/protocol";
import {
  changelogUrl,
  developerUrl,
  EXTENSION_FALLBACK_ICON,
  formatCompactCount,
  formatVersion,
  mergeStorePages,
  pluralize,
  resolveReadmeLinks,
  storeDeveloper,
  storeIcon,
  storeSectionTitle,
  storeSlug,
  stripLeadingTitle,
  supportsMacOS,
} from "./model";

function listing(overrides: Partial<StoreExtension> = {}): StoreExtension {
  return {
    id: "id-1",
    name: "github",
    title: "GitHub",
    description: "Pull requests and issues",
    author: { handle: "mira", name: "Mira Okafor", avatar: "https://example.com/mira.png" },
    icon: { light: "https://example.com/light.png", dark: "https://example.com/dark.png" },
    downloadCount: 1200,
    categories: ["Developer Tools"],
    commands: [],
    updatedAt: 0,
    storeUrl: "https://www.raycast.com/mira/github",
    ...overrides,
  };
}

describe("store model", () => {
  it("builds the owner/name slug, preferring the owner", () => {
    expect(storeSlug(listing())).toBe("mira/github");
    expect(storeSlug(listing({ owner: { handle: "acme", name: "Acme" } }))).toBe("acme/github");
  });

  it("presents organisation listings by their owner", () => {
    expect(storeDeveloper(listing()).name).toBe("Mira Okafor");
    expect(storeDeveloper(listing({ owner: { handle: "acme", name: "Acme", avatar: "a.png" } }))).toEqual({ handle: "acme", name: "Acme", avatar: "a.png" });
    expect(storeDeveloper(listing({ owner: { handle: "mira", name: "Mira" } })).avatar).toBe("https://example.com/mira.png");
  });

  it("maps light/dark icons and falls back when both are missing", () => {
    expect(storeIcon({ light: "l.png", dark: "d.png" })).toEqual({ source: { light: "l.png", dark: "d.png" }, fallback: EXTENSION_FALLBACK_ICON });
    expect(storeIcon({ dark: "d.png" })).toEqual({ source: { light: "d.png", dark: "d.png" }, fallback: EXTENSION_FALLBACK_ICON });
    expect(storeIcon({})).toBe(EXTENSION_FALLBACK_ICON);
  });

  it("formats counts like the Store", () => {
    expect(formatCompactCount(412_880)).toBe("412.9K");
    expect(formatCompactCount(950)).toBe("950");
    expect(formatCompactCount(1_500_000)).toBe("1.5M");
    expect(pluralize(1, "Install")).toBe("1 Install");
    expect(pluralize(12_345, "Install")).toBe("12,345 Installs");
  });

  it("names the results section after the query and category", () => {
    expect(storeSectionTitle("", "all")).toBe("All Extensions");
    expect(storeSectionTitle("  ", "all")).toBe("All Extensions");
    expect(storeSectionTitle("git", "all")).toBe("Results");
    expect(storeSectionTitle("", "Media")).toBe("Results");
  });

  it("appends pages without duplicates", () => {
    const a = listing({ id: "a" });
    const b = listing({ id: "b" });
    const c = listing({ id: "c" });
    expect(mergeStorePages([a, b], [b, c]).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("shortens commit versions", () => {
    expect(formatVersion("0123456789abcdef0123456789abcdef01234567")).toBe("0123456");
    expect(formatVersion("1.9.2")).toBe("1.9.2");
  });

  it("derives developer and changelog links", () => {
    expect(developerUrl(listing())).toBe("https://www.raycast.com/mira");
    expect(developerUrl(listing({ storeUrl: "not a url" }))).toBeUndefined();
    expect(changelogUrl("https://github.com/o/r/tree/main/extensions/x/")).toBe("https://github.com/o/r/tree/main/extensions/x/CHANGELOG.md");
    expect(changelogUrl(undefined)).toBeUndefined();
  });

  it("treats listings without platforms as macOS-compatible", () => {
    expect(supportsMacOS(listing())).toBe(true);
    expect(supportsMacOS(listing({ platforms: ["Windows"] }))).toBe(false);
    expect(supportsMacOS(listing({ platforms: ["macOS", "Windows"] }))).toBe(true);
  });
});

describe("README links", () => {
  const readmeUrl = "https://github.com/acme/extensions/blob/main/extensions/github/README.md";

  it("points relative images at raw files and relative links at the web view", () => {
    const markdown = "![Shot](media/shot.png)\n[Docs](docs/setup.md \"Setup\")";
    expect(resolveReadmeLinks(markdown, readmeUrl)).toBe(
      "![Shot](https://raw.githubusercontent.com/acme/extensions/main/extensions/github/media/shot.png)\n[Docs](https://github.com/acme/extensions/blob/main/extensions/github/docs/setup.md \"Setup\")",
    );
  });

  it("leaves absolute URLs, anchors and data URLs alone", () => {
    const markdown = "[Site](https://example.com) [Top](#top) ![x](data:image/png;base64,AAAA)";
    expect(resolveReadmeLinks(markdown, readmeUrl)).toBe(markdown);
  });

  it("keeps the markdown unchanged without a README URL", () => {
    expect(resolveReadmeLinks("![a](a.png)", undefined)).toBe("![a](a.png)");
  });

  it("drops a leading title that repeats the extension name", () => {
    expect(stripLeadingTitle("# GitHub\n\nIntro", "GitHub")).toBe("Intro");
    expect(stripLeadingTitle("# Something else\n\nIntro", "GitHub")).toBe("# Something else\n\nIntro");
    expect(stripLeadingTitle("Intro", "GitHub")).toBe("Intro");
  });
});
