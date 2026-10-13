import type { ScriptCommand } from "@opencast/protocol";
import { confirmAlert } from "../../../components";

/** Inline refreshes never prompt; manually launched scripts can opt into confirmation. */
export function confirmScriptRun(script: ScriptCommand): Promise<boolean> {
  if (!script.needsConfirmation || script.mode === "inline") return Promise.resolve(true);
  return confirmAlert({
    title: `Run “${script.title}”?`,
    message: script.description || "This script asks for confirmation before it runs.",
    primaryAction: { title: "Run Script" },
  });
}
