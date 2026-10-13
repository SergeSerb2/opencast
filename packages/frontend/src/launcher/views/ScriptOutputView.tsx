import { useState } from "react";
import { backend } from "../../bridge/backend";
import { Action, ActionPanel, Detail, Metadata, showFailureToast, showToast } from "../../components";
import { sc } from "../../lib/keyboard";
import type { LauncherViewProps } from "./registry";

export interface ScriptOutputProps {
  title?: string;
  output: string;
  exitCode?: number;
  /** Script path, enables "Run Again". */
  path?: string;
  arguments?: string[];
}

function fence(output: string): string {
  const longest = Math.max(2, ...(output.match(/`+/g) ?? []).map((m) => m.length));
  const marks = "`".repeat(longest + 1);
  return `${marks}\n${output.replace(/\n$/, "")}\n${marks}`;
}

/** Full output of a script command (`mode: fullOutput`) with copy and re-run. */
export function ScriptOutputView({ props, title, icon }: LauncherViewProps<ScriptOutputProps>) {
  const [result, setResult] = useState({ output: props.output, exitCode: props.exitCode });
  const [running, setRunning] = useState(false);

  const rerun = async () => {
    if (!props.path) return;
    setRunning(true);
    try {
      const next = await backend.call("scripts.run", { path: props.path, arguments: props.arguments });
      setResult({ output: next.output, exitCode: next.exitCode });
      if (next.exitCode !== 0) showToast({ style: "failure", title: `Exited with code ${next.exitCode}` });
    } catch (error) {
      showFailureToast("Script failed", error);
    } finally {
      setRunning(false);
    }
  };

  const failed = result.exitCode !== undefined && result.exitCode !== 0;
  return (
    <Detail
      navigationTitle={title ?? props.title}
      navigationIcon={icon}
      isLoading={running}
      markdown={result.output.trim() ? fence(result.output) : "*No output*"}
      metadata={
        result.exitCode !== undefined ? (
          <Metadata>
            <Metadata.Label title="Exit Code" text={{ value: String(result.exitCode), color: failed ? "raycast-red" : "raycast-green" }} />
            {props.path && <Metadata.Label title="Script" text={props.path.split("/").pop() ?? props.path} />}
          </Metadata>
        ) : undefined
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Output" content={result.output} />
          {props.path && <Action title="Run Again" icon="arrow-clockwise-16" shortcut={sc("cmd", "r")} onAction={rerun} />}
          {props.path && <Action.ShowInFinder path={props.path} shortcut={sc("cmd", "shift", "f")} />}
        </ActionPanel>
      }
    />
  );
}
