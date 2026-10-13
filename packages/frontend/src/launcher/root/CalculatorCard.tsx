import { memo, type ReactNode } from "react";
import type { CalculatorResult } from "@surgecast/protocol";
import { Icon } from "../../icons/Icon";
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
  return (
    <div className="sc-calc" data-kind={result.kind}>
      <div className="sc-calc__half">
        <div className="sc-calc__value sc-truncate" title={result.input}>
          <span className="sc-calc__text">
            <Question text={result.interpreted} />
          </span>
        </div>
        <span className="sc-calc__pill">{result.inputLabel ?? "Expression"}</span>
      </div>
      <div className="sc-calc__divider" aria-hidden="true">
        <span className="sc-calc__line" />
        <Icon name="arrow-right-16" size={16} className="sc-calc__arrow" />
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
