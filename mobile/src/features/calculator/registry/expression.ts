export type Expression =
  | { type: "variable"; id: string }
  | { type: "text"; value: string }
  | { type: "row"; children: Expression[] }
  | { type: "fraction"; numerator: Expression; denominator: Expression };

