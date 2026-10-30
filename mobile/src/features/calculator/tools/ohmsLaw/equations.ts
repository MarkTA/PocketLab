import type { Expression } from "../../registry/expression";
const variable = (id: string): Expression => ({ type: "variable", id });
const row = (...children: Expression[]): Expression => ({ type: "row", children });
const text = (value: string): Expression => ({ type: "text", value });
const fraction = (numerator: Expression, denominator: Expression): Expression => ({ type: "fraction", numerator, denominator });

export const ohmsEquations: Record<string, Expression> = {
  voltage: row(variable("current"), text(" × "), variable("resistance")),
  current: fraction(variable("voltage"), variable("resistance")),
  resistance: fraction(variable("voltage"), variable("current")),
};
export const powerEquations: Record<string, Expression> = {
  power: row(variable("voltage"), text(" × "), variable("current")),
  voltage: fraction(variable("power"), variable("current")),
  current: fraction(variable("power"), variable("voltage")),
};

/** Equivalent power relationships for a resistive load. Each variant has its own independent inputs. */
export const powerCurrentResistanceEquations: Record<string, Expression> = {
  power: row(variable("current"), text("² × "), variable("resistance")),
  current: row(text("√"), fraction(variable("power"), variable("resistance"))),
  resistance: fraction(variable("power"), row(variable("current"), text("²"))),
};
export const powerVoltageResistanceEquations: Record<string, Expression> = {
  power: fraction(row(variable("voltage"), text("²")), variable("resistance")),
  voltage: row(text("√("), variable("power"), text(" × "), variable("resistance"), text(")")),
  resistance: fraction(row(variable("voltage"), text("²")), variable("power")),
};
