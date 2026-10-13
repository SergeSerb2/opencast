import { useEffect, useRef, type ReactNode } from "react";
import type { ImageLike } from "@opencast/protocol";
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
  const focused = useRef(false);
  // Focus the first field once it exists (fields may arrive after loading), and again
  // whenever the form becomes the top view.
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
      focused.current = true;
    }
  });
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
