import type { DividerMode } from "./interactiveDividerMath";
import type { Expression } from "../../registry/expression";
const v = (id: string): Expression => ({ type: "variable", id });
const t = (value: string): Expression => ({ type: "text", value });
const row = (...children: Expression[]): Expression => ({ type: "row", children });
const frac = (numerator: Expression, denominator: Expression): Expression => ({ type: "fraction", numerator, denominator });
const sum = (a: Expression, b: Expression) => row(a, t(" + "), b);
const diff = (a: Expression, b: Expression) => row(a, t(" − "), b);
const product = (a: Expression, b: Expression) => row(a, t(" × "), b);
const parens = (x: Expression) => row(t("("), x, t(")"));
const parallel = () => parens(row(v("r2"), t(" ∥ "), v("rl")));

/** Preserve a true typographic fraction for every rearranged equation. */
export function dividerEquation(mode: DividerMode, result: string): Expression {
  const vin = v("vin"), vout = v("vout"), r1 = v("r1"), r2 = v("r2"), rl = v("rl");
  const p = () => parallel();
  if (mode === "unloaded") {
    switch (result) {
      case "vin": return product(vout, frac(sum(r1, r2), r2));
      case "r1": return product(r2, parens(diff(frac(vin, vout), t("1"))));
      case "r2": return frac(product(vout, r1), diff(vin, vout));
      default: return product(vin, frac(r2, sum(r1, r2)));
    }
  }
  switch (result) {
    case "vin": return product(vout, frac(sum(r1, p()), p()));
    case "r1": return product(p(), parens(diff(frac(vin, vout), t("1"))));
    case "r2": {
      const q = () => frac(product(vout, r1), diff(vin, vout));
      return frac(product(q(), rl), diff(rl, q()));
    }
    case "rl": {
      const q = () => frac(product(vout, r1), diff(vin, vout));
      return frac(product(q(), r2), diff(r2, q()));
    }
    default: return product(vin, frac(p(), sum(r1, p())));
  }
}

