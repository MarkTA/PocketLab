import assert from "node:assert/strict";
import test from "node:test";

import {
  parseDmmReading,
  parseDmmState,
} from "../src/features/device/dmm/dmmProtocol.ts";

test("parses voltage readings", () => {
  assert.deepEqual(parseDmmReading("DMM:VALUE -2.5;UNIT=V"), {
    reading: { value: -2.5, unit: "V", overload: false },
    inferredState: null,
  });
});

test("parses resistance readings including RANGE and RREF", () => {
  assert.deepEqual(parseDmmReading("DMM:VALUE 998.4;UNIT=OHM;RANGE=AUTO;RREF=10000"), {
    reading: { value: 998.4, unit: "OHM", overload: false },
    inferredState: { mode: "RESISTANCE", range: "AUTO", rrefOhms: 10000 },
  });
});

test("handles resistance overload without treating it as an error", () => {
  assert.deepEqual(parseDmmReading("DMM:VALUE OL;UNIT=OHM"), {
    reading: { value: null, unit: "OHM", overload: true },
    inferredState: null,
  });
});

test("parses state responses with and without RREF", () => {
  assert.deepEqual(parseDmmState("DMM:STATE MODE=RESISTANCE;RANGE=AUTO;RREF=1000"), {
    mode: "RESISTANCE",
    range: "AUTO",
    rrefOhms: 1000,
  });
  assert.deepEqual(parseDmmState("DMM:STATE MODE=VOLTAGE;RANGE=30V"), {
    mode: "VOLTAGE",
    range: "30V",
    rrefOhms: null,
  });
});

test("parses continuity state and reading without changing mode to resistance", () => {
  assert.deepEqual(parseDmmState("DMM:STATE MODE=CONTINUITY;RANGE=10K;RREF=10000"), {
    mode: "CONTINUITY", range: "10K", rrefOhms: 10000,
  });
  assert.deepEqual(
    parseDmmReading("DMM:VALUE 2.500;UNIT=OHM;MODE=CONTINUITY;CONT=1;RANGE=10K;RREF=10000"),
    {
      reading: { value: 2.5, unit: "OHM", overload: false, continuity: true },
      inferredState: { mode: "CONTINUITY", range: "10K", rrefOhms: 10000 },
    }
  );
  assert.deepEqual(
    parseDmmReading("DMM:VALUE OL;UNIT=OHM;MODE=CONTINUITY;CONT=0;RANGE=10K;RREF=10000"),
    {
      reading: { value: null, unit: "OHM", overload: true, continuity: false },
      inferredState: { mode: "CONTINUITY", range: "10K", rrefOhms: 10000 },
    }
  );
});

test("rejects malformed continuity metadata", () => {
  assert.throws(
    () => parseDmmReading("DMM:VALUE 5;UNIT=OHM;MODE=CONTINUITY;CONT=maybe"),
    /Invalid continuity status/
  );
});

test("rejects malformed DMM readings", () => {
  assert.throws(() => parseDmmReading("WRONG"), /Unexpected DMM reading response/);
  assert.throws(() => parseDmmReading("DMM:VALUE "), /Missing DMM value/);
  assert.throws(() => parseDmmReading("DMM:VALUE hello;UNIT=V"), /Invalid DMM value/);
  assert.throws(() => parseDmmReading("DMM:VALUE OL;UNIT=V"), /OL is only valid/);
  assert.throws(() => parseDmmReading("DMM:VALUE 1;UNIT=INVALID"), /Invalid DMM unit/);
});

test("rejects malformed state responses", () => {
  assert.throws(() => parseDmmState("WRONG"), /Unexpected DMM state response/);
  assert.throws(
    () => parseDmmState("DMM:STATE MODE=INVALID;RANGE=AUTO"),
    /Invalid DMM mode/
  );
  assert.throws(() => parseDmmState("DMM:STATE MODE=VOLTAGE"), /Missing DMM range/);
  assert.throws(
    () => parseDmmState("DMM:STATE MODE=RESISTANCE;RANGE=AUTO;RREF=oops"),
    /Invalid DMM RREF/
  );
});
