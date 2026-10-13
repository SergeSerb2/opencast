import React, { createContext, useContext, useState, useRef, useCallback, useMemo } from "react";
import { randomId } from "./bridge";
export interface Navigation { push(component: React.ReactNode, onPop?: () => void): void; pop(): void; }
export const NavigationContext = createContext<Navigation | null>(null);
export function useNavigation(): Navigation {
  const value = useContext(NavigationContext);
  if (!value) throw new Error("useNavigation must be used inside an extension view");
  return value;
}
interface Route { id: string; element: React.ReactNode; onPop?: () => void; }
export function NavigationStack({ element, controller }: { element: React.ReactNode; controller: { current?: Navigation; depth: number } }) {
  const [routes, setRoutes] = useState<Route[]>(() => [{ id: randomId(), element }]);
  const latest = useRef(routes); latest.current = routes;
  const push = useCallback((component: React.ReactNode, onPop?: () => void) => { setRoutes((old) => { const next = [...old, { id: randomId(), element: component, onPop }]; latest.current = next; return next; }); }, []);
  const pop = useCallback(() => {
    const old = latest.current;
    if (old.length < 2) return;
    latest.current = old.slice(0, -1); setRoutes(latest.current); old.at(-1)?.onPop?.();
  }, []);
  const value = useMemo(() => ({ push, pop }), [push, pop]);
  controller.current = value; controller.depth = routes.length;
  return React.createElement(NavigationContext.Provider, { value }, React.createElement("__stack", {}, routes.map((route, i) => React.createElement("__route", { key: route.id, id: route.id, active: i === routes.length - 1 }, route.element))));
}
