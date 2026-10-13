import { describe, expect, it } from "vitest";
import type { ScriptCommand } from "@opencast/protocol";
import {
  ALL_PACKAGES,
  abbreviateHome,
  argumentValues,
  firstMissingArgument,
  languageName,
  packageNames,
  refreshLabel,
  SCRIPT_TILE,
  scriptDeeplink,
  scriptIcon,
  scriptSections,
  scriptUsage,
} from "./script-list";

const script = (over: Partial<ScriptCommand>): ScriptCommand => ({ path: "/Users/me/scripts/a.sh", title: "A", mode: "compact", arguments: [], ...over });

const scripts = [
  script({ path: "/Users/me/scripts/uptime.sh", title: "System Uptime", packageName: "System", description: "Shows load averages" }),
  script({ path: "/Users/me/scripts/dns.sh", title: "Flush DNS Cache", packageName: "System" }),
  script({ path: "/Users/me/dev/uuid.py", title: "Generate UUID", packageName: "Developer Utils", author: "Ada" }),
  script({ path: "/Users/me/dev/loose.sh", title: "Loose Script" }),
];

describe("scriptSections", () => {
  it("groups by package (default package for scripts without one), sorted by name", () => {
    const sections = scriptSections(scripts, "");
    expect(sections.map((s) => [s.title, s.subtitle])).toEqual([
      ["Developer Utils", "1 Script Command"],
      ["Script Commands", "1 Script Command"],
      ["System", "2 Script Commands"],
    ]);
    expect(sections[2].scripts.map((s) => s.title)).toEqual(["Flush DNS Cache", "System Uptime"]);
  });

  it("filters on title, description, package, author and path", () => {
    const titles = (query: string) => scriptSections(scripts, query).flatMap((s) => s.scripts.map((x) => x.title));
    expect(titles("load")).toEqual(["System Uptime"]);
    expect(titles("ada")).toEqual(["Generate UUID"]);
    expect(titles("dev/")).toEqual(["Generate UUID", "Loose Script"]);
    expect(titles("SYSTEM")).toEqual(["Flush DNS Cache", "System Uptime"]);
    expect(titles("nothing")).toEqual([]);
  });

  it("filters by package", () => {
    expect(scriptSections(scripts, "", "System").map((s) => s.title)).toEqual(["System"]);
    expect(scriptSections(scripts, "", ALL_PACKAGES)).toHaveLength(3);
    expect(packageNames(scripts)).toEqual(["Developer Utils", "Script Commands", "System"]);
  });
});

describe("scriptIcon", () => {
  it("resolves emoji, URLs, absolute paths, relative images and dark variants", () => {
    expect(scriptIcon(script({}))).toEqual(SCRIPT_TILE);
    expect(scriptIcon(script({ icon: "🤖" }))).toBe("🤖");
    expect(scriptIcon(script({ icon: "https://example.com/i.png" }))).toBe("https://example.com/i.png");
    expect(scriptIcon(script({ icon: "/opt/icons/i.png" }))).toBe("/opt/icons/i.png");
    expect(scriptIcon(script({ icon: "images/logo.png" }))).toBe("/Users/me/scripts/images/logo.png");
    expect(scriptIcon(script({ icon: "./logo.svg", iconDark: "logo-dark.svg" }))).toEqual({ source: { light: "/Users/me/scripts/logo.svg", dark: "/Users/me/scripts/logo-dark.svg" } });
  });
});

describe("arguments", () => {
  const withArgs = script({
    path: "/Users/me/dev/kill-port.sh",
    arguments: [
      { name: "argument1", type: "text", placeholder: "Port", required: true },
      { name: "argument2", type: "dropdown", placeholder: "Signal", required: false, data: [{ title: "TERM", value: "TERM" }] },
    ],
  });

  it("orders values and finds the first missing required one", () => {
    expect(argumentValues(withArgs, { argument2: "TERM" })).toEqual(["", "TERM"]);
    expect(firstMissingArgument(withArgs, { argument1: "  " })).toBe(0);
    expect(firstMissingArgument(withArgs, { argument1: "3000" })).toBe(-1);
  });

  it("previews the command line", () => {
    expect(scriptUsage(withArgs)).toBe("~/dev/kill-port.sh <Port> [Signal]");
  });
});

describe("helpers", () => {
  it("abbreviates the home folder", () => {
    expect(abbreviateHome("/Users/me/scripts/a.sh")).toBe("~/scripts/a.sh");
    expect(abbreviateHome("/Users/me")).toBe("~");
    expect(abbreviateHome("/opt/scripts")).toBe("/opt/scripts");
  });

  it("describes inline refresh intervals", () => {
    expect(refreshLabel("1m")).toBe("Every minute");
    expect(refreshLabel("30s")).toBe("Every 30 seconds");
    expect(refreshLabel("12h")).toBe("Every 12 hours");
    expect(refreshLabel("soon")).toBeUndefined();
  });

  it("builds title deeplinks", () => {
    expect(scriptDeeplink({ title: "Kill Port / Process" })).toBe("opencast://script-commands/Kill%20Port%20%2F%20Process");
  });

  it("names the language from the shebang or the extension", () => {
    expect(languageName({ language: "/usr/bin/env python3", path: "/a/x" })).toBe("Python");
    expect(languageName({ language: "/usr/bin/env -S node --no-warnings", path: "/a/x" })).toBe("Node.js");
    expect(languageName({ language: "/bin/bash", path: "/a/x.sh" })).toBe("Bash");
    expect(languageName({ language: "/usr/bin/osascript", path: "/a/x" })).toBe("AppleScript");
    expect(languageName({ path: "/a/x.rb" })).toBe("Ruby");
    expect(languageName({ path: "/a/x" })).toBeUndefined();
  });
});
