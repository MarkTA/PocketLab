import type { Expression } from "../../registry/expression";
const variable = (id: string): Expression => ({ type: "variable", id });
const text = (value: string): Expression => ({ type: "text", value });
const fraction = (numerator: Expression, denominator: Expression): Expression => ({ type: "fraction", numerator, denominator });
const product = (ids: string[]): Expression => ({ type: "row", children: ids.flatMap((id, index) => index ? [text(" · "), variable(id)] : [variable(id)]) });
export const rcEquations: Record<string, Expression> = {
  fc: fraction(text("1"), { type: "row", children: [text("2π · "), product(["r", "c"]) ] }),
  r: fraction(text("1"), { type: "row", children: [text("2π · "), product(["fc", "c"]) ] }),
  c: fraction(text("1"), { type: "row", children: [text("2π · "), product(["fc", "r"]) ] }),
};
