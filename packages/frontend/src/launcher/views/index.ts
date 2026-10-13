/**
 * Registers every launcher view. Feature teams add one import line per module
 * that calls `registerView(...)`.
 */
import { ApplicationsView } from "./applications/ApplicationsView";
import { registerView } from "./registry";
import { ExtensionPreferencesView } from "./ExtensionPreferencesView";
import { ScriptOutputView } from "./ScriptOutputView";
import "./team-a";
import "./team-b";
import "./quick-ai";

registerView("script-output", ScriptOutputView);
registerView("extension.preferences", ExtensionPreferencesView);

registerView("applications", ApplicationsView);
