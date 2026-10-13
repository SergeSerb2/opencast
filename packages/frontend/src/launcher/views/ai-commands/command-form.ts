import type { AICommand, AICommandOutput, BackendParams, Creativity } from "@surgecast/protocol";
import { DEFAULT_AI_ICON, type ReasoningEffort } from "../ai-shared/options";
import { promptProblem } from "./placeholders";

export type EditorMode = "create" | "edit" | "duplicate";

/** Editor state for an AI command; "" means "use the default" for icon, model and reasoning effort. */
export interface CommandDraft {
  name: string;
  icon: string;
  prompt: string;
  model: string;
  creativity: Creativity;
  output: AICommandOutput;
  reasoningEffort: ReasoningEffort | "";
  highlightEdits: boolean;
  webSearch: boolean;
  tags: string[];
}

export type CommandDraftErrors = Partial<Record<"name" | "prompt", string>>;

export function emptyCommandDraft(prompt = ""): CommandDraft {
  return { name: "", icon: "", prompt, model: "", creativity: "medium", output: "quick-ai", reasoningEffort: "", highlightEdits: false, webSearch: false, tags: [] };
}

export function commandDraft(command: AICommand | undefined, mode: EditorMode): CommandDraft {
  if (!command) return emptyCommandDraft();
  return {
    name: mode === "duplicate" ? `${command.name} Copy` : command.name,
    icon: typeof command.icon === "string" ? command.icon : "",
    prompt: command.prompt,
    model: command.model ?? "",
    creativity: command.creativity,
    output: command.output,
    reasoningEffort: command.reasoningEffort ?? "",
    highlightEdits: command.highlightEdits ?? false,
    webSearch: command.webSearch ?? false,
    tags: command.tags ?? [],
  };
}

export function validateCommandDraft(draft: CommandDraft): CommandDraftErrors {
  const errors: CommandDraftErrors = {};
  if (!draft.name.trim()) errors.name = "Enter a name";
  const problem = promptProblem(draft.prompt);
  if (problem) errors.prompt = problem;
  return errors;
}

/**
 * `ai.commands.upsert` params. Edits pass the id; a cleared icon is sent as
 * the default tile because the backend keeps the old value for missing fields.
 */
export function commandUpsertParams(draft: CommandDraft, existing?: AICommand): BackendParams<"ai.commands.upsert"> {
  const clearedIcon = !draft.icon && existing?.icon !== undefined;
  return {
    ...(existing ? { id: existing.id } : {}),
    name: draft.name.trim(),
    prompt: draft.prompt,
    icon: draft.icon || (clearedIcon ? DEFAULT_AI_ICON : undefined),
    model: draft.model || undefined,
    creativity: draft.creativity,
    output: draft.output,
    reasoningEffort: draft.reasoningEffort || undefined,
    highlightEdits: draft.highlightEdits,
    webSearch: draft.webSearch,
    tags: [...new Set(draft.tags.map((t) => t.trim()).filter(Boolean))],
  };
}

/** Tags used by any command, sorted, for the tag filter. */
export function commandTags(commands: AICommand[]): string[] {
  return [...new Set(commands.flatMap((c) => c.tags ?? []))].sort((a, b) => a.localeCompare(b));
}
