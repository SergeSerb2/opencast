import { useMemo } from "react";
import type { AICommand, AIModelOption, AIPreset } from "@opencast/protocol";
import { useBackend } from "../../bridge/hooks";
import { toolsetsFromTools, type Toolset } from "../model/mentions";

export interface AIResources {
  models: AIModelOption[];
  /** False until the model list has loaded (or failed). */
  modelsReady: boolean;
  modelsError: unknown;
  retryModels: () => void;
  toolsets: Toolset[];
  commands: AICommand[];
  presets: AIPreset[];
}

const NONE: never[] = [];

/** Models, tools, AI Commands and presets for pickers and menus; each refetches when its data changes. */
export function useAIResources(): AIResources {
  const models = useBackend("ai.models.list", {});
  const tools = useBackend("ai.tools.list", undefined);
  const commands = useBackend("ai.commands.list", undefined);
  const presets = useBackend("ai.presets.list", undefined);
  const toolsets = useMemo(() => toolsetsFromTools(tools.data ?? NONE), [tools.data]);
  return {
    models: models.data ?? NONE,
    modelsReady: models.data !== undefined || models.error !== undefined,
    modelsError: models.error,
    retryModels: models.refetch,
    toolsets,
    commands: commands.data ?? NONE,
    presets: presets.data ?? NONE,
  };
}
