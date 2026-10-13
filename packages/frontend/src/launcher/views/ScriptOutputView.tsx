import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { backend } from "../../bridge/backend";
import { useBackend, useLatest } from "../../bridge/hooks";
import { native } from "../../bridge/native";
import { Action, ActionPanel, ScrollArea, ViewFrame, showFailureToast, showToast, useNavigation, useRegisterActions, useViewController } from "../../components";
import type { ActionsProp } from "../../components";
import { eventKey, matchesShortcut, sc } from "../../lib/keyboard";
import { hideLauncher } from "../launch";
import type { LauncherViewProps } from "./registry";
import { recentLaunchArguments, scriptExecutions, trackScriptExecutions, type ScriptExecution } from "./scripts/executions";
import { outputStatus, terminalText, visibleOutput, type OutputPhase, type StatusTone } from "./scripts/output";
import { basename } from "./scripts/script-list";
import { ScriptArgumentsForm } from "./scripts/ScriptArgumentsForm";
import "./scripts/scripts.css";

// Chunks can arrive before this view mounts; buffer them from launcher boot.
trackScriptExecutions();

export interface ScriptOutputProps {
  /** Streamed run started by `commands.launch` or `scripts.start`. */
  executionId?: string;
  /** Script path: enables Run Again, Show in Finder and Open Script. */
  path?: string;
  title?: string;
  /** A finished result passed directly instead of an execution. */
  output?: string;
  exitCode?: number;
  /** Argument values of the run, for Run Again. */
  arguments?: string[];
}

interface RunState {
  executionId?: string;
  args?: string[];
  starting: boolean;
  cancelled: boolean;
}

const STOP = sc("ctrl", "c");
const STOP_ALT = sc("cmd", ".");
const COPY = sc("cmd", "shift", "c");
const SCROLL_STEP = 40;

function useExecution(executionId: string | undefined): ScriptExecution | undefined {
  const subscribe = useCallback((listener: () => void) => (executionId ? scriptExecutions.subscribe(executionId, listener) : () => undefined), [executionId]);
  return useSyncExternalStore(subscribe, () => (executionId ? scriptExecutions.get(executionId) : undefined));
}

/** Output of a `fullOutput` script command: live while it runs, then the result with re-run and copy. */
export function ScriptOutputView({ props, title, icon }: LauncherViewProps<ScriptOutputProps>) {
  const navigation = useNavigation();
  const { path } = props;
  const scriptTitle = title ?? props.title ?? (path ? basename(path) : "Script Output");
  const [run, setRun] = useState<RunState>(() => ({ executionId: props.executionId, args: props.arguments ?? (path ? recentLaunchArguments(path) : undefined), starting: false, cancelled: false }));
  const execution = useExecution(run.executionId);
  const { data: scripts } = useBackend("scripts.list", undefined, [], { enabled: Boolean(path) });
  const script = scripts?.find((s) => s.path === path);

  const raw = run.starting ? "" : run.executionId ? execution?.output || execution?.completion?.output || "" : (props.output ?? "");
  const text = useMemo(() => terminalText(raw), [raw]);
  const completion = execution?.completion;
  const phase: OutputPhase = run.starting
    ? { kind: "starting" }
    : !run.executionId
      ? { kind: "finished", exitCode: props.exitCode ?? 0, cancelled: false }
      : completion
        ? { kind: "finished", exitCode: completion.exitCode, durationMs: completion.durationMs, error: completion.error, cancelled: run.cancelled }
        : { kind: "running" };
  const running = phase.kind !== "finished";
  const status = outputStatus(phase, scriptTitle);

  const copyOutput = async () => {
    try {
      await native.call("clipboard.write", { content: { kind: "text", text: text.trimEnd() } });
      showToast({ style: "success", title: "Copied Output" });
    } catch (error) {
      showFailureToast("Failed to copy", error);
    }
  };

  const stop = async () => {
    const { executionId } = run;
    if (!executionId || !running) return;
    setRun((r) => ({ ...r, cancelled: true }));
    try {
      await backend.call("scripts.cancel", { executionId });
    } catch (error) {
      // The script may have finished on its own in the meantime.
      if (!scriptExecutions.get(executionId)?.completion) {
        setRun((r) => ({ ...r, cancelled: false }));
        showFailureToast("Could not stop the script", error);
      }
    }
  };

  const start = async (args: string[]) => {
    if (!path) return;
    const previous = run;
    setRun({ args, starting: true, cancelled: false });
    try {
      const { executionId } = await backend.call("scripts.start", { path, arguments: args.length ? args : undefined });
      setRun({ executionId, args, starting: false, cancelled: false });
    } catch (error) {
      setRun(previous);
      showFailureToast("Could not run the script", error);
    }
  };

  const runAgain = () => {
    if (!path) return;
    if (run.args) return start(run.args);
    if (script?.arguments.length) {
      navigation.push(<ScriptArgumentsForm script={script} icon={icon} onSubmit={(values) => void start(values)} />);
      return;
    }
    return start([]);
  };

  const fileActions = path && (
    <ActionPanel.Section>
      <Action.ShowInFinder path={path} shortcut={sc("cmd", "shift", "f")} />
      <Action title="Open Script" icon="arrow-ne-16" shortcut={sc("cmd", "o")} onAction={() => native.call("open.path", { path }).then(hideLauncher)} />
    </ActionPanel.Section>
  );

  const actions = running ? (
    <ActionPanel title={scriptTitle}>
      {run.executionId && <Action title="Stop Script" icon="stop-16" shortcut={STOP} onAction={stop} />}
      <Action title="Copy Output" icon="copy-clipboard-16" shortcut={COPY} onAction={copyOutput} />
      {fileActions}
    </ActionPanel>
  ) : (
    <ActionPanel title={scriptTitle}>
      <Action title="Copy Output" icon="copy-clipboard-16" shortcut={sc("return")} onAction={copyOutput} />
      {path && <Action title="Run Again" icon="arrow-clockwise-16" shortcut={sc("cmd", "r")} onAction={runAgain} />}
      {fileActions}
    </ActionPanel>
  );

  return (
    <ViewFrame navigationTitle={scriptTitle} navigationIcon={icon} isLoading={running}>
      <OutputBody text={text} error={phase.kind === "finished" && !phase.cancelled ? phase.error : undefined} status={status} running={running} actions={actions} onStop={stop} onCopy={copyOutput} />
    </ViewFrame>
  );
}

interface OutputBodyProps {
  text: string;
  error?: string;
  status: { text: string; tone: StatusTone };
  running: boolean;
  actions: ActionsProp;
  onStop: () => void;
  onCopy: () => void;
}

function OutputBody({ text, error, status, running, actions, onStop, onCopy }: OutputBodyProps) {
  useRegisterActions(actions);
  const view = useViewController();
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);
  const visible = useMemo(() => visibleOutput(text), [text]);
  const stopRef = useLatest(onStop);
  const copyRef = useLatest(onCopy);

  // Follow new output while the user stays at the bottom.
  useLayoutEffect(() => {
    const viewport = scrollRef.current;
    if (viewport && running && pinnedToBottom.current) viewport.scrollTop = viewport.scrollHeight;
  }, [visible.text, running]);

  useEffect(
    () =>
      view.registerKeyHandler((event) => {
        const viewport = scrollRef.current;
        // ⌘. also stops, and ⌘⇧C copies even when Copy Output is the ↵ action.
        if (matchesShortcut(event, STOP_ALT)) {
          stopRef.current();
          return true;
        }
        if (matchesShortcut(event, COPY)) {
          copyRef.current();
          return true;
        }
        if (!viewport || event.metaKey || event.ctrlKey || event.altKey) return false;
        const page = viewport.clientHeight - 120;
        const deltas: Record<string, number> = { arrowDown: SCROLL_STEP, arrowUp: -SCROLL_STEP, pageDown: page, pageUp: -page, space: event.shiftKey ? -page : page };
        const key = eventKey(event);
        if (key === "home" || key === "end") {
          viewport.scrollTop = key === "home" ? 0 : viewport.scrollHeight;
          return true;
        }
        if (!(key in deltas)) return false;
        viewport.scrollBy({ top: deltas[key] });
        return true;
      }),
    [view, stopRef, copyRef],
  );

  const separator = visible.text ? (visible.text.endsWith("\n") ? "\n" : "\n\n") : "";
  return (
    <ScrollArea
      ref={scrollRef}
      className="sc-script-output"
      fade={{ top: 96, bottom: 72 }}
      thumbInset={{ top: 64, bottom: 52 }}
      onMetrics={({ scrollTop, clientHeight, scrollHeight }) => {
        pinnedToBottom.current = scrollHeight - scrollTop - clientHeight < 24;
      }}
    >
      <div className="sc-script-output__inner">
        <pre className="sc-script-output__text" data-selectable="true">
          {visible.truncated && <span className="sc-script-output__note">{"Earlier output is hidden. Copy Output includes all of it.\n\n"}</span>}
          {visible.text}
          {separator}
          {error && <span className="sc-script-output__error">{`${error}\n\n`}</span>}
          <span className="sc-script-output__status" data-tone={status.tone} role="status">
            {status.text}
          </span>
        </pre>
      </div>
    </ScrollArea>
  );
}
