import type { CommandInfo, LaunchResult } from "@surgecast/protocol";
import { createAiMock } from "./ai";
import { TEAM_B_COMMANDS, TEAM_B_VIEWS } from "./commands";
import { createDataMock } from "./data";
import { createScriptsMock } from "./scripts";
import { createStoreMock } from "./store";
import { createSystemMock } from "./system";
import { createThemeMock } from "./theme";
import { createTranslatorMock } from "./translator";
import type { MockContext, MockHandlers } from "./types";

/**
 * Mock backend pieces for the Team B launcher views (window management,
 * menu items, calendar, processes, scripts, data, store/extensions, AI
 * commands/presets, theme studio, translator).
 */
export function createTeamBMock(ctx: MockContext): {
  commands: CommandInfo[];
  handlers: MockHandlers;
  launch: (command: CommandInfo, args?: Record<string, string>, fallbackText?: string) => LaunchResult | undefined;
} {
  const areas = [createSystemMock(ctx), createScriptsMock(ctx), createDataMock(ctx), createStoreMock(ctx), createAiMock(ctx), createThemeMock(ctx), createTranslatorMock(ctx)];
  const handlers: MockHandlers = Object.assign({}, ...areas.map((area) => area.handlers));
  return {
    commands: [...TEAM_B_COMMANDS, ...areas.flatMap((area) => area.commands ?? [])],
    handlers,
    launch(command, args, fallbackText) {
      for (const area of areas) {
        const result = area.launch?.(command, args, fallbackText);
        if (result) return result;
      }
      const view = TEAM_B_VIEWS[command.id];
      if (!view) return undefined;
      return { kind: "view", view: { id: view.id, title: command.title, props: { ...view.props, query: fallbackText, arguments: args } } };
    },
  };
}
