import { describe, expect, it } from "vitest";
import { createScriptParams, scriptDestination, scriptFileName, validateCreateScript, type CreateScriptValues } from "./script-create";

const values = (over: Partial<CreateScriptValues> = {}): CreateScriptValues => ({ language: "bash", mode: "compact", title: "Hello World", packageName: "", icon: "", directory: "/Users/me/scripts", needsConfirmation: false, refreshTime: "1m", ...over });

describe("scriptFileName", () => {
  it("slugs the title like the backend and uses the template's extension", () => {
    expect(scriptFileName("Hello World!", "bash")).toBe("hello-world.sh");
    expect(scriptFileName("Café Menü", "python")).toBe("cafe-menu.py");
    expect(scriptFileName("🚀", "node")).toBe("script.js");
    expect(scriptFileName("Open Tab", "applescript")).toBe("open-tab.applescript");
    expect(scriptFileName("Typed Script", "typescript")).toBe("typed-script.ts");
    expect(scriptFileName("Go Script", "go")).toBe("go-script.go");
    expect(scriptFileName("Dotnet Script", "csharp")).toBe("dotnet-script.cs");
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
  it("applies confirmation to manual commands and refresh intervals to inline commands", () => {
    expect(createScriptParams(values({ needsConfirmation: true }))).toMatchObject({ needsConfirmation: true });
    const inline = createScriptParams(values({ mode: "inline", needsConfirmation: true, refreshTime: "15m" }));
    expect(inline.refreshTime).toBe("15m");
    expect(inline.needsConfirmation).toBeUndefined();
    expect(validateCreateScript(values({ mode: "inline", refreshTime: "invalid" }), ["/Users/me/scripts"]).refreshTime).toBeTruthy();
  });
});
