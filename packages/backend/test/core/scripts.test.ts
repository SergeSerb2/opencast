import { describe, expect, it } from "vitest";
import {
  parseScriptMetadata,
  refreshInterval,
} from "../../src/services/core/scripts";
const source =
  '#!/bin/bash\n# @raycast.schemaVersion 1\n# @raycast.title Example\n# @raycast.mode fullOutput\n# @raycast.argument1 {"placeholder":"Name","secure":true,"percentEncoded":true}\n# @raycast.needsConfirmation true\n# @raycast.currentDirectoryPath ~/Documents\necho "$1"';
describe("script metadata", () => {
  it.each(["opencast", "surgecast", "OPENCAST"])("discovers complete @%s script metadata", prefix => {
    expect(parseScriptMetadata(source.replaceAll("@raycast.", `@${prefix}.`), "/scripts/example.sh"))
      .toEqual(parseScriptMetadata(source, "/scripts/example.sh"));
  });
  it("allows OpenCast metadata to override fields in a Raycast script", () => {
    expect(parseScriptMetadata(`${source}\n# @opencast.title Renamed`, "/scripts/example.sh"))
      .toMatchObject({ title: "Renamed", mode: "fullOutput", arguments: [{ type: "password" }] });
  });
  it("parses complete metadata and secure positional arguments", () => {
    expect(parseScriptMetadata(source, "/scripts/example.sh")).toMatchObject({
      title: "Example",
      mode: "fullOutput",
      needsConfirmation: true,
      language: "/bin/bash",
      currentDirectoryPath: "~/Documents",
      arguments: [
        {
          name: "argument1",
          type: "password",
          required: true,
          secure: true,
          percentEncoded: true,
        },
      ],
    });
  });
  it("supports comment forms, case insensitive keys and overwrite semantics", () => {
    expect(
      parseScriptMetadata(
        "REM @raycast.schemaVersion 1\n:: @raycast.title First\n// @raycast.TITLE Last\n# @raycast.mode UNKNOWN",
        "/tools/test.sh",
      ),
    ).toMatchObject({ title: "Last", mode: "compact", packageName: "tools" });
  });
  it("rejects missing metadata and skips malformed argument descriptors", () => {
    expect(parseScriptMetadata("echo hi", "/test.sh")).toBeNull();
    expect(
      parseScriptMetadata(
        source.replace(
          '{"placeholder":"Name","secure":true,"percentEncoded":true}',
          "invalid",
        ),
        "/test.sh",
      )?.arguments,
    ).toEqual([]);
  });
  it("requires valid inline refresh and retains confirmation without inline arguments", () => {
    const inline = source.replace("fullOutput", "inline");
    expect(parseScriptMetadata(inline, "/test.sh")?.mode).toBe("compact");
    expect(
      parseScriptMetadata(`${inline}\n# @raycast.refreshTime 30s`, "/test.sh"),
    ).toMatchObject({
      mode: "inline",
      arguments: [],
      needsConfirmation: true,
    });
    expect(refreshInterval("9s")).toBeNull();
    expect(refreshInterval("2m")).toBe(120000);
  });
});
