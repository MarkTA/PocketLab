/* tests/voltageGraphUtils.test.mjs */

import test from "node:test";
import assert from "node:assert/strict";
import { prepareVoltageSeries } from "../src/features/dmm/graph/voltageGraphUtils.ts";

const end = 100_000;
const voltage = (timestamp, value) => ({
  timestamp,
  value,
  mode: "VOLTAGE",
  unit: "V",
  overload: false,
});

test("plots only voltage samples within the last 30 seconds", () => {
  const result = prepareVoltageSeries([
    voltage(end - 31_000, 1),
    voltage(end - 15_000, 2),
    voltage(end, 3),
    voltage(end + 100, 4),
  ], end);
  assert.deepEqual(result.points.map((point) => point.value), [2, 3]);
});

test("ignores resistance, overload, missing, and invalid values", () => {
  const result = prepareVoltageSeries([
    voltage(end - 1000, 2.5),
    { ...voltage(end - 900, 12), mode: "RESISTANCE", unit: "OHM" },
    { ...voltage(end - 800, null), overload: true },
    voltage(end - 700, NaN),
    voltage(end - 600, Infinity),
  ], end);
  assert.equal(result.points.length, 1);
  assert.equal(result.points[0].value, 2.5);
});

test("preserves timestamps and sorts samples chronologically", () => {
  const result = prepareVoltageSeries([voltage(end, 3), voltage(end - 700, 2)], end);
  assert.deepEqual(result.points.map((point) => point.timestamp), [end - 700, end]);
});

test("provides a nonzero padded Y range for a constant voltage", () => {
  const result = prepareVoltageSeries([voltage(end, 3.3)], end);
  assert.ok(result.yMin < 3.3);
  assert.ok(result.yMax > 3.3);
});

test("auto-scales to include negative and positive voltages", () => {
  const result = prepareVoltageSeries([voltage(end - 1000, -1.2), voltage(end, 4.8)], end);
  assert.ok(result.yMin < -1.2);
  assert.ok(result.yMax > 4.8);
});

test("computes min, max, average, and peak-to-peak for visible points", () => {
  const result = prepareVoltageSeries([
    voltage(end - 30_500, 100), // Outside the graph window.
    voltage(end - 20_000, -1),
    voltage(end - 10_000, 1),
    voltage(end, 3),
  ], end);

  assert.deepEqual(result.statistics, {
    count: 3,
    minimum: -1,
    maximum: 3,
    average: 1,
    peakToPeak: 4,
  });
});

test("statistics ignore invalid, overloaded, and resistance samples", () => {
  const result = prepareVoltageSeries([
    voltage(end - 500, 4.28),
    voltage(end - 400, 4.29),
    voltage(end - 300, Infinity),
    { ...voltage(end - 200, 99), mode: "RESISTANCE", unit: "OHM" },
    { ...voltage(end - 100, null), overload: true },
  ], end);

  assert.equal(result.statistics?.count, 2);
  assert.equal(result.statistics?.minimum, 4.28);
  assert.equal(result.statistics?.maximum, 4.29);
  assert.ok(Math.abs(result.statistics.average - 4.285) < 1e-12);
  assert.ok(Math.abs(result.statistics.peakToPeak - 0.01) < 1e-12);
});

test("no visible samples means no statistics", () => {
  const result = prepareVoltageSeries([voltage(end - 40_000, 5)], end);
  assert.equal(result.statistics, null);
});

test("constant voltage has zero peak-to-peak; single sample has a valid average", () => {
  const stable = prepareVoltageSeries([voltage(end - 200, 3.3), voltage(end, 3.3)], end);
  assert.equal(stable.statistics?.peakToPeak, 0);
  assert.equal(stable.statistics?.average, 3.3);

  const single = prepareVoltageSeries([voltage(end, -0.25)], end);
  assert.equal(single.statistics?.count, 1);
  assert.equal(single.statistics?.average, -0.25);
});
