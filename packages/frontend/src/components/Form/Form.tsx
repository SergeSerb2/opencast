import { useEffect, useRef, type ReactNode } from "react";
import type { ImageLike } from "@surgecast/protocol";
import type { ActionsProp } from "../actions/ActionPanel";
import { ScrollArea } from "../ScrollArea/ScrollArea";
import { useNavigation } from "../View/contexts";
import { useRegisterActions } from "../View/useRegisterActions";
import { ViewFrame } from "../View/ViewFrame";
import { Checkbox, DatePicker, Description, Dropdown, FilePicker, LinkAccessory, PasswordField, Separator, TagPicker, TextArea, TextField } from "./fields";
import { FormProvider } from "./FormContext";
import "./form.css";

export interface FormProps {
  children?: ReactNode;
  actions?: ActionsProp;
  navigationTitle?: string;
  navigationIcon?: ImageLike;
  isLoading?: boolean;
  /** Usually a `<Form.LinkAccessory>`. */
  searchBarAccessory?: ReactNode;
  /** Called whenever an uncontrolled field changes (drafts, extension renderer). */
  onValuesChange?: (values: Record<string, unknown>) => void;
}

/**
 * Raycast-style form: three-column rows (right-aligned labels, 360px fields,
 * errors), ⌘↵ runs the primary action (usually `<Action.SubmitForm>`).
 */
export function Form({ children, actions, navigationTitle, navigationIcon, isLoading, searchBarAccessory, onValuesChange }: FormProps) {
  return (
    <FormProvider onValuesChange={onValuesChange}>
      <ViewFrame navigationTitle={navigationTitle} navigationIcon={navigationIcon} isLoading={isLoading} headerAccessory={searchBarAccessory} primaryShortcut="cmd-enter">
        <FormBody actions={actions}>{children}</FormBody>
      </ViewFrame>
    </FormProvider>
  );
}

const FOCUSABLE = "input:not([type=hidden]):not(:disabled), textarea:not(:disabled), button.sc-dropdown, button.sc-file-picker";

function FormBody({ actions, children }: { actions?: ActionsProp; children?: ReactNode }) {
  useRegisterActions(actions);
  const navigation = useNavigation();
  const formRef = useRef<HTMLFormElement>(null);
  // Focus the first field on mount and whenever the form becomes the top view again.
  useEffect(() => {
    if (!navigation.isActive) return;
    const form = formRef.current;
    if (form && !form.contains(document.activeElement)) form.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
  }, [navigation.isActive]);
  return (
    <div className="sc-form-view">
      <ScrollArea fade={{ top: 96, bottom: 72 }} thumbInset={{ top: 64, bottom: 52 }}>
        <form ref={formRef} className="sc-form" onSubmit={(e) => e.preventDefault()}>
          {children}
        </form>
      </ScrollArea>
    </div>
  );
}

Form.TextField = TextField;
Form.PasswordField = PasswordField;
Form.TextArea = TextArea;
Form.Checkbox = Checkbox;
Form.Dropdown = Dropdown;
Form.TagPicker = TagPicker;
Form.DatePicker = DatePicker;
Form.FilePicker = FilePicker;
Form.Separator = Separator;
Form.Description = Description;
Form.LinkAccessory = LinkAccessory;
