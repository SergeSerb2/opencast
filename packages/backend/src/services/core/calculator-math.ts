import { create, all, type MathNode, type Unit, type Complex } from "mathjs";

export const math = create(all, { number: "number" });
const FUNCTIONS = new Set(
  "abs acos acosh asin asinh atan atan2 atanh ceil cos cosh exp floor log log10 log2 max min mod pow round sign sin sinh sqrt tan tanh cbrt factorial gcd lcm hypot nthRoot".split(
    " ",
  ),
);

export function mathSource(
  expression: string,
  decimalSeparator?: string,
): string {
  let source = expression
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-");
  if (decimalSeparator === ",") source = source.replace(/(\d),(\d)/g, "$1.$2");
  return source;
}

export function prettyMath(expression: string): string {
  try {
    const percentages: string[] = [];
    const source = expression
      .replace(/(?:\d+(?:\.\d*)?|\.\d+)%/g, (value) => {
        percentages.push(value);
        return `PERCENT${percentages.length - 1}`;
      })
      .replace(/(PERCENT\d+)\s+of\s+/gi, "$1 * ");
    return math
      .parse(source)
      .toString()
      .replace(/ \* /g, " × ")
      .replace(/ \/ /g, " ÷ ")
      .replace(/(PERCENT\d+) × /g, "$1 of ")
      .replace(
        /PERCENT(\d+)/g,
        (_match, index: string) => percentages[Number(index)]!,
      );
  } catch {
    return expression.trim().replace(/\s+/g, " ");
  }
}

export function evaluateMath(source: string): number | Unit | Complex | null {
  if (!/\d/.test(source) || source.length > 512 || /[;\n]/.test(source))
    return null;
  source = source
    .replace(/([\d.]+)%/g, "surgecastPercent($1)")
    .replace(/\s+of\s+/gi, " * ")
    .replace(/\s+in\s+/gi, " to ");
  try {
    const percent = (node: MathNode): MathNode | undefined => {
      if (math.isParenthesisNode(node)) return percent(node.content);
      if (math.isFunctionNode(node) && node.fn.name === "surgecastPercent" && node.args.length === 1) return node.args[0];
      return undefined;
    };
    const percentages = (node: MathNode): MathNode => {
      if (math.isOperatorNode(node) && ["+", "-"].includes(node.op) && node.args.length === 2) {
        const amount = percent(node.args[1]);
        if (amount) {
          const base = percentages(node.args[0]);
          const fraction = new math.OperatorNode("/", "divide", [percentages(amount), new math.ConstantNode(100)]);
          return new math.OperatorNode(node.op, node.fn, [base, new math.OperatorNode("*", "multiply", [base, fraction])]);
        }
      }
      const amount = percent(node);
      if (amount) return new math.OperatorNode("/", "divide", [percentages(amount), new math.ConstantNode(100)]);
      return node.map(child => percentages(child));
    };
    const node = percentages(math.parse(source));
    let nodes = 0;
    node.traverse((child: MathNode) => {
      if (
        ++nodes > 100 ||
        ![
          "ConstantNode",
          "SymbolNode",
          "OperatorNode",
          "ParenthesisNode",
          "FunctionNode",
        ].includes(child.type)
      )
        throw new Error("Unsupported expression");
      if (math.isConstantNode(child) && typeof child.value === "string")
        throw new Error("Text is not math");
      if (math.isFunctionNode(child) && !FUNCTIONS.has(child.fn.name))
        throw new Error("Unsupported function");
      if (math.isOperatorNode(child)) {
        if (!["+", "-", "*", "/", "%", "^", "!", "to"].includes(child.op))
          throw new Error("Unsupported operator");
        if (child.op === "!" && Number(child.args[0].toString()) > 170)
          throw new Error("Factorial too large");
      }
    });
    const value: unknown = node.compile().evaluate();
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (math.isUnit(value))
      return Number.isFinite(value.toNumber(value.formatUnits()))
        ? value
        : null;
    if (
      math.isComplex(value) &&
      Number.isFinite(value.re) &&
      Number.isFinite(value.im)
    )
      return value;
    return null;
  } catch {
    return null;
  }
}

export function singleNumber(expression: string): boolean {
  return /^[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|0x[\da-f]+|0b[01]+|0o[0-7]+)$/i.test(
    expression.trim(),
  );
}
