import { useEffect, useRef, useState } from "react";

/** Characters revealed per frame: the backlog shrinks over ~8 frames, but never slower than 2 per frame. */
export function revealStep(backlog: number): number {
  return Math.max(2, Math.ceil(backlog / 8));
}

/**
 * Reveal streamed text at display rate so bursty provider chunks read as a
 * steady flow. Text that was complete when it first rendered shows at once;
 * anything that is not an extension of what is shown (an edit, a refetch)
 * replaces it immediately.
 */
export function useSmoothText(target: string, streaming: boolean): string {
  const [shown, setShown] = useState(() => (streaming ? "" : target));
  const shownRef = useRef(shown);
  const animate = useRef(streaming);
  if (streaming) animate.current = true;

  useEffect(() => {
    if (!animate.current || !target.startsWith(shownRef.current)) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    let frame = 0;
    const tick = () => {
      const current = shownRef.current;
      if (current.length >= target.length) return;
      const next = target.slice(0, current.length + revealStep(target.length - current.length));
      shownRef.current = next;
      setShown(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return shown;
}
