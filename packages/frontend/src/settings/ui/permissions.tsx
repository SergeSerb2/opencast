import { useCallback, useEffect, useState } from "react";
import type { PermissionKind, PermissionStatus } from "@surgecast/protocol";
import { useNativeEvent } from "../../bridge/hooks";
import { native } from "../../bridge/native";
import { Button } from "../../components/Button/Button";
import { showFailureToast } from "../../components/feedback/toast-store";
import { Row } from "./layout";

/** Live macOS permission status from the native host (null while loading or without the host). */
export function usePermission(kind: PermissionKind): PermissionStatus | null {
  const [status, setStatus] = useState<PermissionStatus | null>(null);
  const load = useCallback(() => {
    native.call("permissions.status").then(
      (all) => setStatus(all[kind] ?? "unknown"),
      () => setStatus("unknown"),
    );
  }, [kind]);
  useEffect(load, [load]);
  useNativeEvent("permissions.changed", (event) => {
    if (event.kind === kind) setStatus(event.status);
  });
  // Users grant permissions in System Settings; re-check when the window regains focus.
  useNativeEvent("window.didBecomeKey", load);
  return status;
}

export interface PermissionRowProps {
  kind: PermissionKind;
  title: string;
  description: string;
}

/** Status of one macOS permission with a button to grant it in System Settings. */
export function PermissionRow({ kind, title, description }: PermissionRowProps) {
  const status = usePermission(kind);
  const granted = status === "granted";
  const openSettings = async () => {
    try {
      if (status === "notDetermined") {
        const next = await native.call("permissions.request", { kind });
        if (next === "granted") return;
      }
      await native.call("permissions.openSettings", { kind });
    } catch (error) {
      showFailureToast("Could not open System Settings", error);
    }
  };
  return (
    <Row title={title} description={description}>
      {status === null ? null : granted ? (
        <span className="sc-s-badge" data-tone="success">
          Granted
        </span>
      ) : (
        <>
          <span className="sc-s-badge" data-tone="warning">
            {status === "unknown" ? "Unknown" : "Not Granted"}
          </span>
          <Button size="small" onClick={() => void openSettings()}>
            Open System Settings
          </Button>
        </>
      )}
    </Row>
  );
}
