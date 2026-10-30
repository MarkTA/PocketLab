/** Resolve a passive DC resistor's V, I, R, P from two independent inputs.
 * The source polarity and clockwise current arrow define positive V and I.
 * Equations with square roots choose the positive branch when sign is unknown.
 */
export function resolveOhmsValues(inputs: Record<string, number>): Record<string, number> {
  const out = { ...inputs };
  const has = (key: string): boolean => Number.isFinite(out[key]);
  const put = (key: string, value: number) => {
    if (!has(key) && Number.isFinite(value) && (key !== "resistance" || value >= 0)) out[key] = value;
  };
  // Only derive if two independent input values are present. Derivations never
  // overwrite user-entered values, even when the input combination is invalid.
  if (Object.keys(inputs).length < 2) return out;
  const { voltage: v, current: i, resistance: r, power: p } = inputs;
  if (has("voltage") && has("current")) {
    if (i !== 0) put("resistance", v / i);
  } else if (has("voltage") && has("resistance")) {
    if (r !== 0) put("current", v / r);
  } else if (has("current") && has("resistance")) {
    put("voltage", i * r);
  } else if (has("power") && has("voltage")) {
    if (v !== 0) put("current", p / v);
    if (p !== 0) put("resistance", v * v / p);
  } else if (has("power") && has("current")) {
    if (i !== 0) {
      put("voltage", p / i);
      put("resistance", p / (i * i));
    }
  } else if (has("power") && has("resistance")) {
    if (p >= 0 && r >= 0) {
      // This pair gives only the magnitude; use the positive reference branch.
      put("voltage", Math.sqrt(p * r));
      if (r !== 0) put("current", Math.sqrt(p / r));
    }
  }
  if (has("voltage") && has("current")) put("power", out.voltage * out.current);
  if (has("current") && has("resistance")) put("power", out.current * out.current * out.resistance);
  return out;
}
