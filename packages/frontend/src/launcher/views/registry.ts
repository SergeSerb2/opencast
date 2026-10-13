import type { ComponentType } from "react";
import type { BuiltinView, ImageLike } from "@surgecast/protocol";

/** Props every registered launcher view receives. */
export interface LauncherViewProps<P = Record<string, unknown>> {
  /** `BuiltinView.props` from the `LaunchResult`. */
  props: P;
  /** Navigation title (command title) and icon for the footer pill. */
  title?: string;
  icon?: ImageLike;
  /** Id of the command that opened the view, if any. */
  commandId?: string;
  view: BuiltinView;
}

const views = new Map<string, ComponentType<LauncherViewProps<never>>>();

/**
 * Register the React component for a `BuiltinView.id` (e.g. "clipboard-history",
 * "snippets.search", "quick-ai"). Call at module load and import the module from
 * `launcher/views/index.ts`.
 */
export function registerView<P>(id: string, component: ComponentType<LauncherViewProps<P>>): void {
  views.set(id, component as ComponentType<LauncherViewProps<never>>);
}

export function getView(id: string): ComponentType<LauncherViewProps<Record<string, unknown>>> | undefined {
  return views.get(id) as ComponentType<LauncherViewProps<Record<string, unknown>>> | undefined;
}
