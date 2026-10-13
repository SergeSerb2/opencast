import { describe, expect, it } from "vitest";
import { ignoredPath, spotlightQuery } from "../../src/services/core/files";
import { parseProcessList } from "../../src/services/core/processes";
describe("file and process parsers", () => {
  it("quotes Spotlight metacharacters without allowing query injection", () => {
    expect(spotlightQuery('name" || kMDItemFSName == "*')).toBe(
      'kMDItemDisplayName == "*name\\" || kMDItemFSName == \\"\\**"cd',
    );
  });
  it("matches ignored path segments and globs and optionally hides dot files", () => {
    expect(
      ignoredPath("/Users/person/node_modules/package/file", ["node_modules"]),
    ).toBe(true);
    expect(ignoredPath("/Users/person/test.log", ["*.log"])).toBe(true);
    expect(
      ignoredPath("/Users/person/my-node_modules/file", ["node_modules"]),
    ).toBe(false);
    expect(ignoredPath("/Users/person/.private/file", [], false)).toBe(true);
    expect(ignoredPath("/Users/person/.private/file", [], true)).toBe(false);
  });
  it("parses executable names and resource usage without including process arguments", () => {
    expect(
      parseProcessList(
        " 123 5.2 1024 /Applications/Example App.app/Contents/MacOS/Example App\ninvalid\n",
      ),
    ).toEqual([
      {
        pid: 123,
        cpuPercent: 5.2,
        memoryBytes: 1048576,
        name: "Example App",
        executable: "/Applications/Example App.app/Contents/MacOS/Example App",
      },
    ]);
  });
});
