import { describe, expect, it } from "vitest";
import { createScriptParams, scriptDestination, scriptFileName, validateCreateScript, type CreateScriptValues } from "./script-create";

const values = (over: Partial<CreateScriptValues> = {}): CreateScriptValues => ({ language: "bash", mode: "compact", title: "Hello World", packageName: "", icon: "", directory: "/Users/me/scripts", ...over });

describe("scriptFileName", () => {
  it("slugs the title like the backend and uses the template's extension", () => {
    expect(scriptFileName("Hello World!", "bash")).toBe("hello-world.sh");
    expect(scriptFileName("Café Menü", "python")).toBe("cafe-menu.py");
    expect(scriptFileName("🚀", "node")).toBe("script.js");
    expect(scriptFileName("Open Tab", "applescript")).toBe("open-tab.applescript");
  });

  it("previews the destination once a title and directory are set", () => {
    expect(scriptDestination(values())).toBe("~/scripts/hello-world.sh");
    expect(scriptDestination(values({ directory: "/opt/scripts/" }))).toBe("/opt/scripts/hello-world.sh");
    expect(scriptDestination(values({ title: " " }))).toBeUndefined();
  });
});

describe("validateCreateScript", () => {
  const directories = ["/Users/me/scripts"];

  it("requires a title and a configured directory", () => {
    expect(validateCreateScript(values(), directories)).toEqual({});
    expect(validateCreateScript(values({ title: "  " }), directories)).toEqual({ title: "Title is required" });
    expect(validateCreateScript(values({ directory: "" }), directories)).toEqual({ directory: "Choose a directory" });
    expect(validateCreateScript(values({ directory: "" }), [])).toEqual({ directory: "Add a script directory first" });
    expect(validateCreateScript(values({ directory: "/tmp" }), directories)).toEqual({ directory: "Choose one of your script directories" });
  });
});

describe("createScriptParams", () => {
  it("trims and omits empty optional metadata", () => {
    expect(createScriptParams(values({ title: " Hi ", packageName: " Tools ", icon: "" }))).toEqual({ directory: "/Users/me/scripts", title: "Hi", mode: "compact", language: "bash", packageName: "Tools", icon: undefined });
  });
});
