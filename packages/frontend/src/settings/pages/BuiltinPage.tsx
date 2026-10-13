import type { ReactNode } from "react";
import { BUILTIN_PAGES, commandGroup } from "../catalog";
import { useAllCommands } from "../data";
import { CommandsCard } from "../ui/commands";
import { Intro, Section } from "../ui/layout";
import { PageFrame } from "../ui/PageFrame";

export interface BuiltinPageProps {
  id: string;
  children?: ReactNode;
  /** Right-side header options. */
  actions?: ReactNode;
}

/**
 * Page for a built-in extension (§13.7): introduction, the extension's own
 * settings (children), then its commands with alias, hotkey and enabled state.
 */
export function BuiltinPage({ id, children, actions }: BuiltinPageProps) {
  const page = BUILTIN_PAGES.find((p) => p.id === id);
  const { data: commands } = useAllCommands();
  if (!page) return null;
  const own = (commands ?? []).filter((c) => page.commandGroups?.includes(commandGroup(c) ?? "")).sort((a, b) => a.title.localeCompare(b.title));
  return (
    <PageFrame title={page.title} actions={actions}>
      <Intro icon={page.icon} title={page.title} description={page.summary} />
      {children}
      {own.length > 0 && (
        <Section title="Commands" card={false}>
          <CommandsCard commands={own} allCommands={commands ?? []} />
        </Section>
      )}
    </PageFrame>
  );
}
