import type { ReactNode } from "react";
import { mountWindow } from "../app/mount";
import { NavigationContext, type NavigationApi } from "../components/View/contexts";
import { DetailDemo, EmptyDemo, FailureToastDemo, FormDemo, GridDemo, LargeListDemo, ListDemo, ListDetailDemo, ToastDemo } from "./demos";
import { Sheet } from "./Sheet";
import "./gallery.css";

/**
 * Dev-only component gallery.
 *   gallery.html                 every component in dark and light
 *   gallery.html#list|list-detail|list-large|grid|detail|form|empty|toast|toast-failure
 *                                a view demo inside the simulated launcher window
 */
const DEMOS: Record<string, () => ReactNode> = {
  list: () => <ListDemo />,
  "list-detail": () => <ListDetailDemo />,
  "list-large": () => <LargeListDemo />,
  grid: () => <GridDemo />,
  detail: () => <DetailDemo />,
  form: () => <FormDemo />,
  empty: () => <EmptyDemo />,
  toast: () => <ToastDemo />,
  "toast-failure": () => <FailureToastDemo />,
};

/** Demos render as pushed views (back chevron, command title in the footer). */
const PUSHED: NavigationApi = { depth: 1, isActive: true, push: () => undefined, pop: () => undefined, popToRoot: () => undefined };

const route = window.location.hash.replace(/^#/, "");
const demo = DEMOS[route];
if (demo)
  mountWindow(
    <div className="sc-launcher-scope gallery-demo">
      <NavigationContext.Provider value={PUSHED}>{demo()}</NavigationContext.Provider>
    </div>,
  );
else mountWindow(<Sheet />, { backdrop: false });
window.addEventListener("hashchange", () => window.location.reload());
