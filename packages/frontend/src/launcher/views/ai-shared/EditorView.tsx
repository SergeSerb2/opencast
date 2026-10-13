import { useEffect, useRef, type ReactNode } from "react";
import type { ImageLike } from "@surgecast/protocol";
import { ScrollArea, useNavigation, useRegisterActions, ViewFrame, type ActionsProp } from "../../../components";
import "./ai-shared.css";

export interface EditorViewProps {
  navigationTitle?: string;
  navigationIcon?: ImageLike;
  isLoading?: boolean;
  /** The first action is the submit action (⌘↵). */
  actions: ActionsProp;
  /** Left column (prompt or instructions); stays in place while the fields scroll. */
  main: ReactNode;
  /** Right column: `EditorField`s. */
  children: ReactNode;
}

/**
 * Two-column editor in the style of Raycast's AI command and snippet forms:
 * a large text editor on the left, labelled fields on the right, submit with ⌘↵.
 */
export function EditorView({ navigationTitle, navigationIcon, isLoading, actions, main, children }: EditorViewProps) {
  return (
    <ViewFrame navigationTitle={navigationTitle} navigationIcon={navigationIcon} isLoading={isLoading} primaryShortcut="cmd-enter">
      <EditorBody actions={actions} main={main}>
        {children}
      </EditorBody>
    </ViewFrame>
  );
}

const FOCUSABLE = "input:not([type=hidden]):not(:disabled), textarea:not(:disabled)";

function EditorBody({ actions, main, children }: Pick<EditorViewProps, "actions" | "main" | "children">) {
  useRegisterActions(actions);
  const navigation = useNavigation();
  const formRef = useRef<HTMLFormElement>(null);
  const focused = useRef(false);

  // Focus the editor once it exists (content may arrive after loading) and when the view is shown again.
  useEffect(() => {
    if (!navigation.isActive) {
      focused.current = false;
      return;
    }
    const form = formRef.current;
    if (!form || focused.current) return;
    if (form.contains(document.activeElement)) {
      focused.current = true;
      return;
    }
    const field = form.querySelector<HTMLElement>(FOCUSABLE);
    if (field) {
      field.focus({ preventScroll: true });
      // Like Raycast's prompt editor, start typing at the end of existing text.
      if (field instanceof HTMLTextAreaElement) field.setSelectionRange(field.value.length, field.value.length);
      focused.current = true;
    }
  });

  return (
    <div className="sc-ai-editor">
      <ScrollArea fade={{ bottom: 72 }} thumbInset={{ top: 64, bottom: 52 }}>
        <form ref={formRef} className="sc-ai-editor__layout" onSubmit={(e) => e.preventDefault()}>
          <div className="sc-ai-editor__main">{main}</div>
          <div className="sc-ai-editor__fields">{children}</div>
        </form>
      </ScrollArea>
    </div>
  );
}

export interface EditorFieldProps {
  label: string;
  /** Shown in red at the right of the label row (Raycast custom forms). */
  error?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

/** Label row (label left, error right) above a control; consecutive fields are 24px apart. */
export function EditorField({ label, error, htmlFor, children, className }: EditorFieldProps) {
  return (
    <div className={`sc-ai-editor__field${className ? ` ${className}` : ""}`}>
      <div className="sc-ai-editor__descriptive">
        <label className="sc-ai-editor__label" htmlFor={htmlFor}>
          {label}
        </label>
        {error && (
          <span className="sc-ai-editor__error" role="alert">
            {error}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
