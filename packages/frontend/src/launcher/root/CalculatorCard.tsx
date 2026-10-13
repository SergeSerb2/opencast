import { memo, type ReactNode } from "react";
import type { CalculatorResult } from "@opencast/protocol";
import { useSetting } from "../../bridge/settings";
import "./calculator-card.css";

const OPERATOR = /(\s+(?:in|to|as|of)\s+|[+\-−×÷*/^%=]|\s+)/;

/** Render the interpreted question with operators and connective words dimmed. */
function Question({ text }: { text: string }): ReactNode {
  const parts = text.split(OPERATOR).filter((p) => p !== "");
  return parts.map((part, i) => {
    const trimmed = part.trim();
    const dim = trimmed !== "" && OPERATOR.test(part) && !/^\d/.test(trimmed);
    const shown = trimmed === "*" ? "×" : trimmed === "/" ? "÷" : part;
    return dim ? (
      <span key={i} className="sc-calc__op">
        {/\s/.test(part) ? ` ${trimmed} ` : shown}
      </span>
    ) : (
      <span key={i}>{shown}</span>
    );
  });
}

/** Root search calculator card: question → answer halves with label pills (124px row). */
export const CalculatorCard = memo(function CalculatorCard({ result }: { result: CalculatorResult }) {
  const highlight = useSetting("calculator.syntaxHighlighting");
  return (
    <div className="sc-calc" data-kind={result.kind}>
      <div className="sc-calc__half">
        <div className="sc-calc__value sc-truncate" title={result.input}>
          <span className="sc-calc__text">
            {highlight ? <Question text={result.interpreted} /> : result.interpreted}
          </span>
        </div>
        <span className="sc-calc__pill">{result.inputLabel ?? "Expression"}</span>
      </div>
      <div className="sc-calc__divider" aria-hidden="true">
        <span className="sc-calc__line" />
        <svg className="sc-calc__arrow" width="12" height="9" viewBox="0 0 12 9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M1 4.5h10M7.4 1 11 4.5 7.4 8" />
        </svg>
        <span className="sc-calc__line" />
      </div>
      <div className="sc-calc__half">
        <div className="sc-calc__value sc-truncate" title={result.result}>
          {result.color && <span className="sc-calc__swatch" style={{ background: result.color }} />}
          <span className="sc-calc__text">{result.result}</span>
        </div>
        {result.resultLabel && <span className="sc-calc__pill">{result.resultLabel}</span>}
      </div>
    </div>
  );
});
