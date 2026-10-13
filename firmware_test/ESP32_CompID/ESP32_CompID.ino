// ============================================================
// PocketLab CompID - ESP32 Proof of Concept
//
// Supports:
//   - Resistors
//   - Diodes
//   - LEDs
//   - NPN / PNP BJTs
//   - BJT B/C/E identification
//   - Capacitors
//   - Capacitance autoranging
//   - Experimental electrolytic polarity detection
//
// Hardware:
//
// Node 1:
//   ADC      GPIO32
//   1k       GPIO18
//   100k     GPIO19
//
// Node 2:
//   ADC      GPIO33
//   1k       GPIO21
//   100k     GPIO22
//
// Node 3:
//   ADC      GPIO34
//   1k       GPIO25
//   100k     GPIO26
//
// ============================================================


struct TestNode {
  int adcPin;
  int drive1k;
  int drive100k;
};

TestNode nodes[3] = {
  {32, 18, 19},
  {33, 21, 22},
  {34, 25, 26}
};


// ============================================================
// General configuration
// ============================================================

const float R_1K   = 1000.0;
const float R_100K = 100000.0;

const int ADC_SAMPLES   = 128;
const int ADC_THROWAWAY = 8;

const int MEASUREMENT_PASSES = 5;

const int RELEASE_MS = 3;
const int SETTLE_MS  = 25;


// Open-circuit behavior of this ESP32 prototype
const int OPEN_SOURCE_MIN = 3080;
const int OPEN_SINK_MAX   = 190;


// Resistance autorange thresholds
const int RANGE_LOW_LIMIT  = 400;
const int RANGE_HIGH_LIMIT = 2900;


// Resistor classification
const float MAX_RESISTANCE_MISMATCH = 0.25;


// Semiconductor thresholds
const float SILICON_VF_MIN = 0.30;
const float SILICON_VF_MAX = 1.10;

const float LED_THRESHOLD_V = 1.20;


// BJT C/E discrimination
const float CE_MIN_DIFFERENCE_V = 0.10;


// ============================================================
// Adaptive discharge configuration
// ============================================================
//
// All three nodes are pulled LOW through 1k.
//
// Discharge completes when every node is close to ground.
//
// This prevents large capacitors from carrying charge into
// later diode / LED tests.
// ============================================================

const int DISCHARGE_TARGET_MV = 200;

const unsigned long DISCHARGE_TIMEOUT_MS = 5000;

const int DISCHARGE_STABLE_COUNT = 3;


// ============================================================
// Capacitance configuration
// ============================================================
//
// We measure the DIFFERENTIAL voltage across the capacitor.
//
// The capacitor voltage follows:
//
// Vc(t) = Vfinal * (1 - exp(-t / RC))
//
// At 63.2%:
//
// t = RC
//
// Observed prototype endpoints:
//
// LOW  ~= 142 mV
// HIGH ~= 3124 mV
//
// Differential final voltage:
// ~2982 mV
//
// ============================================================

const int CAP_LOW_MV  = 142;
const int CAP_HIGH_MV = 3124;

const int CAP_FINAL_DIFF_MV =
  CAP_HIGH_MV - CAP_LOW_MV;

const float CAP_THRESHOLD_FRACTION = 0.63212;

const int CAP_THRESHOLD_DIFF_MV =
  (int)(
    CAP_FINAL_DIFF_MV *
    CAP_THRESHOLD_FRACTION
  );


// ------------------------------------------------------------
// Small-cap range
//
// source: 100k
// sink:   1k
//
// effective R ~= 101k
// ------------------------------------------------------------

const float CAP_R_SMALL =
  101000.0;


// Give small range only 250 ms.
//
// If it takes longer, the capacitor is large enough that the
// 1k range is preferable.
// ------------------------------------------------------------

const unsigned long CAP_SMALL_TIMEOUT_US =
  250000;


// Reject breadboard / ADC parasitic response
const unsigned long CAP_SMALL_MIN_TIME_US =
  300;


// ------------------------------------------------------------
// Large-cap range
//
// source: 1k
// sink:   1k
//
// effective R ~= 2k
//
// Examples:
//
// 10 uF  -> ~20 ms
// 47 uF  -> ~94 ms
// 100 uF -> ~200 ms
// 470 uF -> ~940 ms
//
// ------------------------------------------------------------

const float CAP_R_LARGE =
  2000.0;

const unsigned long CAP_LARGE_TIMEOUT_US =
  5000000;

// Autorange only reaches here for a genuinely slow response.
// Still reject instant semiconductor / resistor transitions.
const unsigned long CAP_LARGE_MIN_TIME_US =
  1000;


// ============================================================
// Polarity probe configuration
// ============================================================
//
// For polarity probing we use:
//
// positive candidate -> HIGH through 1k
// negative candidate -> LOW through 1k
//
// BUT only until capacitor differential reaches ~500 mV.
//
// Therefore we never intentionally apply the full 3.3 V
// reverse polarity.
//
// ============================================================

const int POLARITY_TARGET_DIFF_MV = 500;

const unsigned long POLARITY_TIMEOUT_US =
  2000000;

const int POLARITY_HOLD_MS = 100;

const int POLARITY_MIN_DIFFERENCE_MV = 40;

const float POLARITY_MIN_RATIO = 1.20;


// ============================================================
// Types
// ============================================================

enum RangeType {
  RANGE_1K,
  RANGE_100K
};


enum CapRangeType {
  CAP_RANGE_SMALL,
  CAP_RANGE_LARGE
};


struct DirectionResult {

  int sourceNode;
  int sinkNode;

  RangeType range;

  uint32_t sourceMV;
  uint32_t sinkMV;

  bool conducting;
  bool nearRail;

  float resistance;
};


struct PairResult {

  int nodeA;
  int nodeB;

  DirectionResult forward;
  DirectionResult reverse;
};


struct JunctionResult {

  bool valid;

  int anode;
  int cathode;

  float vf;
};


struct BJTOrientationResult {

  int collector;
  int emitter;

  uint32_t collectorMV;
  uint32_t emitterMV;
  uint32_t baseMV;

  float vce;
};


struct CapResult {

  bool valid;

  int nodeA;
  int nodeB;

  CapRangeType range;

  unsigned long chargeTimeUS;

  float capacitanceF;
};


struct PolarityProbeResult {

  bool valid;

  int positiveNode;
  int negativeNode;

  uint32_t chargedDifferenceMV;
  uint32_t retainedDifferenceMV;
};


// ============================================================
// GPIO helpers
// ============================================================

void highZ(int pin) {
  pinMode(pin, INPUT);
}


void drivePin(
  int pin,
  int state
) {

  pinMode(pin, OUTPUT);

  digitalWrite(
    pin,
    state
  );
}


void allHighZ() {

  for (int i = 0; i < 3; i++) {

    highZ(
      nodes[i].drive1k
    );

    highZ(
      nodes[i].drive100k
    );
  }
}


// ============================================================
// ADC helpers
// ============================================================

uint32_t readNodeQuick(
  int node
) {

  return analogReadMilliVolts(
    nodes[node].adcPin
  );
}


uint32_t readNodeMillivolts(
  int node
) {

  uint32_t total = 0;


  for (
    int i = 0;
    i < ADC_THROWAWAY;
    i++
  ) {

    analogReadMilliVolts(
      nodes[node].adcPin
    );

    delayMicroseconds(100);
  }


  for (
    int i = 0;
    i < ADC_SAMPLES;
    i++
  ) {

    total +=
      analogReadMilliVolts(
        nodes[node].adcPin
      );

    delayMicroseconds(100);
  }


  return
    total /
    ADC_SAMPLES;
}


// ============================================================
// Range helpers
// ============================================================

int getDrivePin(
  int node,
  RangeType range
) {

  if (
    range ==
    RANGE_1K
  ) {

    return
      nodes[node].drive1k;
  }


  return
    nodes[node].drive100k;
}


float getDriveResistance(
  RangeType range
) {

  if (
    range ==
    RANGE_1K
  ) {

    return R_1K;
  }


  return R_100K;
}


// ============================================================
// Adaptive discharge
// ============================================================

void dischargeNodes() {

  allHighZ();


  // Pull every test node toward ground
  // through its 1k path.

  for (
    int i = 0;
    i < 3;
    i++
  ) {

    drivePin(
      nodes[i].drive1k,
      LOW
    );
  }


  unsigned long start =
    millis();

  int stableCount = 0;


  while (true) {

    uint32_t v1 =
      readNodeQuick(0);

    uint32_t v2 =
      readNodeQuick(1);

    uint32_t v3 =
      readNodeQuick(2);


    bool discharged =

      v1 <
        DISCHARGE_TARGET_MV

      &&

      v2 <
        DISCHARGE_TARGET_MV

      &&

      v3 <
        DISCHARGE_TARGET_MV;


    if (discharged) {

      stableCount++;

    } else {

      stableCount = 0;
    }


    if (
      stableCount >=
      DISCHARGE_STABLE_COUNT
    ) {

      break;
    }


    if (
      millis() - start >=
      DISCHARGE_TIMEOUT_MS
    ) {

      break;
    }


    delay(5);
  }


  allHighZ();

  delay(
    RELEASE_MS
  );
}


// ============================================================
// Resistance calculation
// ============================================================

float calculateResistance(
  uint32_t sourceMV,
  uint32_t sinkMV,
  RangeType range
) {

  if (
    sinkMV < 1
  ) {

    return -1;
  }


  if (
    sourceMV <=
    sinkMV
  ) {

    return -1;
  }


  float rDrive =
    getDriveResistance(
      range
    );


  float vDUT =

    (float)sourceMV -
    (float)sinkMV;


  return

    rDrive *
    vDUT /
    (float)sinkMV;
}


// ============================================================
// One static directional measurement
// ============================================================

DirectionResult measureDirectionOnce(
  int sourceNode,
  int sinkNode,
  RangeType range
) {

  DirectionResult result;

  result.sourceNode =
    sourceNode;

  result.sinkNode =
    sinkNode;

  result.range =
    range;


  dischargeNodes();


  drivePin(
    getDrivePin(
      sourceNode,
      range
    ),
    HIGH
  );


  drivePin(
    getDrivePin(
      sinkNode,
      range
    ),
    LOW
  );


  delay(
    SETTLE_MS
  );


  result.sourceMV =
    readNodeMillivolts(
      sourceNode
    );


  result.sinkMV =
    readNodeMillivolts(
      sinkNode
    );


  bool looksOpen =

    result.sourceMV >=
      OPEN_SOURCE_MIN

    &&

    result.sinkMV <=
      OPEN_SINK_MAX;


  result.conducting =
    !looksOpen;


  result.nearRail =

    result.sourceMV >
      RANGE_HIGH_LIMIT

    ||

    result.sinkMV <
      RANGE_LOW_LIMIT;


  if (
    result.conducting
  ) {

    result.resistance =
      calculateResistance(
        result.sourceMV,
        result.sinkMV,
        range
      );

  } else {

    result.resistance =
      -1;
  }


  allHighZ();

  delay(5);


  return result;
}


// ============================================================
// Stable directional measurement
// ============================================================

DirectionResult measureDirectionStable(
  int sourceNode,
  int sinkNode,
  RangeType range
) {

  uint32_t sourceTotal = 0;
  uint32_t sinkTotal = 0;

  float resistanceTotal = 0;

  int resistanceCount = 0;

  int conductingCount = 0;

  int nearRailCount = 0;


  for (
    int i = 0;
    i < MEASUREMENT_PASSES;
    i++
  ) {

    DirectionResult sample =
      measureDirectionOnce(
        sourceNode,
        sinkNode,
        range
      );


    sourceTotal +=
      sample.sourceMV;

    sinkTotal +=
      sample.sinkMV;


    if (
      sample.conducting
    ) {

      conductingCount++;
    }


    if (
      sample.nearRail
    ) {

      nearRailCount++;
    }


    if (
      sample.resistance > 0
    ) {

      resistanceTotal +=
        sample.resistance;

      resistanceCount++;
    }
  }


  DirectionResult result;

  result.sourceNode =
    sourceNode;

  result.sinkNode =
    sinkNode;

  result.range =
    range;


  result.sourceMV =

    sourceTotal /
    MEASUREMENT_PASSES;


  result.sinkMV =

    sinkTotal /
    MEASUREMENT_PASSES;


  result.conducting =

    conductingCount >
    MEASUREMENT_PASSES / 2;


  result.nearRail =

    nearRailCount >
    MEASUREMENT_PASSES / 2;


  if (
    resistanceCount > 0
  ) {

    result.resistance =

      resistanceTotal /
      resistanceCount;

  } else {

    result.resistance =
      -1;
  }


  return result;
}


// ============================================================
// Resistance autorange
// ============================================================

DirectionResult measureAutoRange(
  int sourceNode,
  int sinkNode
) {

  DirectionResult lowRange =
    measureDirectionStable(
      sourceNode,
      sinkNode,
      RANGE_1K
    );


  if (
    lowRange.conducting &&
    !lowRange.nearRail
  ) {

    return lowRange;
  }


  DirectionResult highRange =
    measureDirectionStable(
      sourceNode,
      sinkNode,
      RANGE_100K
    );


  if (
    highRange.conducting &&
    !lowRange.conducting
  ) {

    return highRange;
  }


  if (
    lowRange.conducting &&
    !highRange.conducting
  ) {

    return lowRange;
  }


  if (
    !lowRange.conducting &&
    !highRange.conducting
  ) {

    return lowRange;
  }


  int lowMargin =

    min(
      (int)lowRange.sinkMV,
      3300 -
      (int)lowRange.sourceMV
    );


  int highMargin =

    min(
      (int)highRange.sinkMV,
      3300 -
      (int)highRange.sourceMV
    );


  if (
    highMargin >
    lowMargin
  ) {

    return highRange;
  }


  return lowRange;
}


// ============================================================
// Pair measurement
// ============================================================

PairResult measurePair(
  int nodeA,
  int nodeB
) {

  PairResult result;

  result.nodeA =
    nodeA;

  result.nodeB =
    nodeB;


  result.forward =
    measureAutoRange(
      nodeA,
      nodeB
    );


  result.reverse =
    measureAutoRange(
      nodeB,
      nodeA
    );


  return result;
}


// ============================================================
// Display helpers
// ============================================================

void printRange(
  RangeType range
) {

  if (
    range ==
    RANGE_1K
  ) {

    Serial.print("1k");

  } else {

    Serial.print("100k");
  }
}


void printCapRange(
  CapRangeType range
) {

  if (
    range ==
    CAP_RANGE_SMALL
  ) {

    Serial.print("100k");

  } else {

    Serial.print("1k");
  }
}


void printResistance(
  float resistance
) {

  if (
    resistance < 0
  ) {

    Serial.print("---");

    return;
  }


  if (
    resistance >=
    1000000.0
  ) {

    Serial.print(
      resistance /
      1000000.0,
      3
    );

    Serial.print(
      " MOhm"
    );

  }

  else if (
    resistance >=
    1000.0
  ) {

    Serial.print(
      resistance /
      1000.0,
      3
    );

    Serial.print(
      " kOhm"
    );

  }

  else {

    Serial.print(
      resistance,
      1
    );

    Serial.print(
      " Ohm"
    );
  }
}


void printCapacitance(
  float capacitanceF
) {

  if (
    capacitanceF >=
    0.000001
  ) {

    Serial.print(
      capacitanceF *
      1000000.0,
      3
    );

    Serial.print(" uF");

  }

  else if (
    capacitanceF >=
    0.000000001
  ) {

    Serial.print(
      capacitanceF *
      1000000000.0,
      1
    );

    Serial.print(" nF");

  }

  else {

    Serial.print(
      capacitanceF *
      1000000000000.0,
      1
    );

    Serial.print(" pF");
  }
}


// ============================================================
// Raw pair output
// ============================================================

void printPair(
  PairResult &pair
) {

  Serial.print("Pair ");

  Serial.print(
    pair.nodeA + 1
  );

  Serial.print(" <-> ");

  Serial.println(
    pair.nodeB + 1
  );


  DirectionResult *dirs[2] = {

    &pair.forward,
    &pair.reverse
  };


  for (
    int i = 0;
    i < 2;
    i++
  ) {

    DirectionResult &d =
      *dirs[i];


    Serial.print("  ");

    Serial.print(
      d.sourceNode + 1
    );

    Serial.print(" -> ");

    Serial.print(
      d.sinkNode + 1
    );

    Serial.print(":  ");

    Serial.print(
      d.sourceMV
    );

    Serial.print(" / ");

    Serial.print(
      d.sinkMV
    );

    Serial.print(
      " mV"
    );


    if (
      d.conducting
    ) {

      Serial.print("   [");

      printRange(
        d.range
      );

      Serial.print("]");

      Serial.print(
        "   R~"
      );

      printResistance(
        d.resistance
      );
    }


    Serial.println();
  }


  Serial.println();
}


// ============================================================
// Silicon junction extraction
// ============================================================

JunctionResult getSiliconJunction(
  PairResult &pair
) {

  JunctionResult j;

  j.valid = false;


  bool forward =
    pair.forward.conducting;

  bool reverse =
    pair.reverse.conducting;


  if (
    forward ==
    reverse
  ) {

    return j;
  }


  DirectionResult d;


  if (
    forward
  ) {

    d = pair.forward;

  } else {

    d = pair.reverse;
  }


  float vf =

    (
      (float)d.sourceMV -
      (float)d.sinkMV
    ) /
    1000.0;


  if (
    vf <
      SILICON_VF_MIN

    ||

    vf >
      SILICON_VF_MAX
  ) {

    return j;
  }


  j.valid =
    true;

  j.anode =
    d.sourceNode;

  j.cathode =
    d.sinkNode;

  j.vf =
    vf;


  return j;
}


// ============================================================
// BJT orientation test
// ============================================================

BJTOrientationResult testBJTOrientation(
  bool npn,
  int base,
  int collector,
  int emitter
) {

  BJTOrientationResult result;

  result.collector =
    collector;

  result.emitter =
    emitter;


  dischargeNodes();


  if (
    npn
  ) {

    drivePin(
      nodes[collector].drive1k,
      HIGH
    );

    drivePin(
      nodes[emitter].drive1k,
      LOW
    );

    drivePin(
      nodes[base].drive100k,
      HIGH
    );

  }

  else {

    drivePin(
      nodes[emitter].drive1k,
      HIGH
    );

    drivePin(
      nodes[collector].drive1k,
      LOW
    );

    drivePin(
      nodes[base].drive100k,
      LOW
    );
  }


  delay(
    SETTLE_MS
  );


  result.collectorMV =
    readNodeMillivolts(
      collector
    );


  result.emitterMV =
    readNodeMillivolts(
      emitter
    );


  result.baseMV =
    readNodeMillivolts(
      base
    );


  result.vce =

    fabs(
      (
        (float)result.collectorMV -
        (float)result.emitterMV
      ) /
      1000.0
    );


  allHighZ();

  delay(5);


  return result;
}


// ============================================================
// BJT classification
// ============================================================

bool classifyBJT(
  PairResult pairs[3]
) {

  JunctionResult junctions[3];

  int count = 0;


  for (
    int i = 0;
    i < 3;
    i++
  ) {

    JunctionResult j =
      getSiliconJunction(
        pairs[i]
      );


    if (
      j.valid
    ) {

      junctions[count] =
        j;

      count++;
    }
  }


  if (
    count != 2
  ) {

    return false;
  }


  bool npn = false;
  bool pnp = false;

  int base = -1;


  if (
    junctions[0].anode ==
    junctions[1].anode
  ) {

    npn = true;

    base =
      junctions[0].anode;
  }


  if (
    junctions[0].cathode ==
    junctions[1].cathode
  ) {

    pnp = true;

    base =
      junctions[0].cathode;
  }


  if (
    !npn &&
    !pnp
  ) {

    return false;
  }


  int remaining[2];

  int index = 0;


  for (
    int n = 0;
    n < 3;
    n++
  ) {

    if (
      n != base
    ) {

      remaining[index++] =
        n;
    }
  }


  BJTOrientationResult A =
    testBJTOrientation(
      npn,
      base,
      remaining[0],
      remaining[1]
    );


  BJTOrientationResult B =
    testBJTOrientation(
      npn,
      base,
      remaining[1],
      remaining[0]
    );


  Serial.println();


  if (
    npn
  ) {

    Serial.println(
      "*** NPN BJT DETECTED ***"
    );

  } else {

    Serial.println(
      "*** PNP BJT DETECTED ***"
    );
  }


  Serial.print(
    "Base: Node "
  );

  Serial.println(
    base + 1
  );


  Serial.print(
    "Base junction Vf: "
  );

  Serial.print(
    junctions[0].vf,
    3
  );

  Serial.print(
    " V / "
  );

  Serial.print(
    junctions[1].vf,
    3
  );

  Serial.println(
    " V"
  );


  Serial.println();

  Serial.println(
    "Collector / emitter orientation test:"
  );


  Serial.print(
    "  Assume C="
  );

  Serial.print(
    A.collector + 1
  );

  Serial.print(
    " E="
  );

  Serial.print(
    A.emitter + 1
  );

  Serial.print(
    "  VCE="
  );

  Serial.print(
    A.vce,
    3
  );

  Serial.println(
    " V"
  );


  Serial.print(
    "  Assume C="
  );

  Serial.print(
    B.collector + 1
  );

  Serial.print(
    " E="
  );

  Serial.print(
    B.emitter + 1
  );

  Serial.print(
    "  VCE="
  );

  Serial.print(
    B.vce,
    3
  );

  Serial.println(
    " V"
  );


  float difference =

    fabs(
      A.vce -
      B.vce
    );


  Serial.println();


  if (
    difference <
    CE_MIN_DIFFERENCE_V
  ) {

    Serial.println(
      "Collector/emitter orientation ambiguous."
    );

  }

  else {

    BJTOrientationResult best;


    if (
      A.vce <
      B.vce
    ) {

      best = A;

    } else {

      best = B;
    }


    Serial.print(
      "Collector: Node "
    );

    Serial.println(
      best.collector + 1
    );


    Serial.print(
      "Emitter:   Node "
    );

    Serial.println(
      best.emitter + 1
    );
  }


  Serial.println();

  return true;
}


// ============================================================
// Capacitance timing on one range
// ============================================================

CapResult measureCapacitanceRange(
  int sourceNode,
  int sinkNode,
  CapRangeType range
) {

  CapResult result;

  result.valid =
    false;

  result.nodeA =
    sourceNode;

  result.nodeB =
    sinkNode;

  result.range =
    range;

  result.chargeTimeUS =
    0;

  result.capacitanceF =
    0;


  float effectiveResistance;

  unsigned long timeoutUS;

  unsigned long minTimeUS;

  int sourceDrivePin;


  if (
    range ==
    CAP_RANGE_SMALL
  ) {

    effectiveResistance =
      CAP_R_SMALL;

    timeoutUS =
      CAP_SMALL_TIMEOUT_US;

    minTimeUS =
      CAP_SMALL_MIN_TIME_US;

    sourceDrivePin =
      nodes[sourceNode].drive100k;

  }

  else {

    effectiveResistance =
      CAP_R_LARGE;

    timeoutUS =
      CAP_LARGE_TIMEOUT_US;

    minTimeUS =
      CAP_LARGE_MIN_TIME_US;

    sourceDrivePin =
      nodes[sourceNode].drive1k;
  }


  // Fully discharge DUT first
  dischargeNodes();


  // Keep sink grounded through 1k
  drivePin(
    nodes[sinkNode].drive1k,
    LOW
  );


  unsigned long startUS =
    micros();


  // Begin charge
  drivePin(
    sourceDrivePin,
    HIGH
  );


  while (
    true
  ) {

    uint32_t sourceMV =
      readNodeQuick(
        sourceNode
      );


    uint32_t sinkMV =
      readNodeQuick(
        sinkNode
      );


    uint32_t differentialMV =

      (
        sourceMV >
        sinkMV
      )

      ? sourceMV -
        sinkMV

      : 0;


    unsigned long elapsed =
      micros() -
      startUS;


    if (
      differentialMV >=
      CAP_THRESHOLD_DIFF_MV
    ) {

      result.chargeTimeUS =
        elapsed;

      break;
    }


    if (
      elapsed >=
      timeoutUS
    ) {

      allHighZ();

      return result;
    }
  }


  allHighZ();


  if (
    result.chargeTimeUS <
    minTimeUS
  ) {

    return result;
  }


  float timeSeconds =

    result.chargeTimeUS /
    1000000.0;


  result.capacitanceF =

    timeSeconds /
    effectiveResistance;


  result.valid =
    true;


  return result;
}


// ============================================================
// Capacitance autorange
// ============================================================

CapResult measureCapacitanceAuto(
  int sourceNode,
  int sinkNode
) {

  // Try high-resistance range first.
  //
  // Excellent for small capacitors.

  CapResult small =
    measureCapacitanceRange(
      sourceNode,
      sinkNode,
      CAP_RANGE_SMALL
    );


  if (
    small.valid
  ) {

    return small;
  }


  // If small range times out or is otherwise unsuitable,
  // retry using 1k excitation.

  CapResult large =
    measureCapacitanceRange(
      sourceNode,
      sinkNode,
      CAP_RANGE_LARGE
    );


  return large;
}


// ============================================================
// Gentle polarity probe
//
// Both sides use 1k.
//
// Excitation ends once capacitor reaches approximately
// 500 mV differential.
//
// This allows large electrolytics to be tested quickly without
// intentionally applying several volts of reverse bias.
// ============================================================

PolarityProbeResult probeCapPolarity(
  int positiveNode,
  int negativeNode
) {

  PolarityProbeResult result;

  result.valid =
    false;

  result.positiveNode =
    positiveNode;

  result.negativeNode =
    negativeNode;

  result.chargedDifferenceMV =
    0;

  result.retainedDifferenceMV =
    0;


  dischargeNodes();


  // Positive candidate
  drivePin(
    nodes[positiveNode].drive1k,
    HIGH
  );


  // Negative candidate
  drivePin(
    nodes[negativeNode].drive1k,
    LOW
  );


  unsigned long startUS =
    micros();


  while (
    true
  ) {

    uint32_t vp =
      readNodeQuick(
        positiveNode
      );


    uint32_t vn =
      readNodeQuick(
        negativeNode
      );


    uint32_t diff =

      (
        vp >
        vn
      )

      ? vp - vn

      : 0;


    if (
      diff >=
      POLARITY_TARGET_DIFF_MV
    ) {

      result.chargedDifferenceMV =
        diff;

      break;
    }


    if (
      micros() - startUS >=
      POLARITY_TIMEOUT_US
    ) {

      allHighZ();

      dischargeNodes();

      return result;
    }
  }


  // Disconnect both sides
  allHighZ();


  delay(
    POLARITY_HOLD_MS
  );


  uint32_t vp =
    readNodeMillivolts(
      positiveNode
    );


  uint32_t vn =
    readNodeMillivolts(
      negativeNode
    );


  result.retainedDifferenceMV =

    (
      vp >
      vn
    )

    ? vp - vn

    : 0;


  result.valid =
    true;


  dischargeNodes();


  return result;
}


// ============================================================
// Capacitor classification
// ============================================================

bool classifyCapacitor(
  PairResult pairs[3]
) {

  for (
    int i = 0;
    i < 3;
    i++
  ) {

    PairResult &pair =
      pairs[i];


    CapResult cap =
      measureCapacitanceAuto(
        pair.nodeA,
        pair.nodeB
      );


    if (
      !cap.valid
    ) {

      continue;
    }


    Serial.println();

    Serial.println(
      "*** CAPACITOR DETECTED ***"
    );


    Serial.print(
      "Terminals: Node "
    );

    Serial.print(
      pair.nodeA + 1
    );

    Serial.print(
      " <-> Node "
    );

    Serial.println(
      pair.nodeB + 1
    );


    Serial.print(
      "Capacitance: "
    );

    printCapacitance(
      cap.capacitanceF
    );

    Serial.println();


    Serial.print(
      "Cap range: "
    );

    printCapRange(
      cap.range
    );

    Serial.println();


    Serial.print(
      "Charge time: "
    );

    Serial.print(
      cap.chargeTimeUS
    );

    Serial.println(
      " us"
    );


    // --------------------------------------------------------
    // Polarity test
    // --------------------------------------------------------

    PolarityProbeResult AB =
      probeCapPolarity(
        pair.nodeA,
        pair.nodeB
      );


    PolarityProbeResult BA =
      probeCapPolarity(
        pair.nodeB,
        pair.nodeA
      );


    if (
      !AB.valid ||
      !BA.valid
    ) {

      Serial.println(
        "Polarity: not determined"
      );

      Serial.println();

      return true;
    }


    Serial.print(
      "Polarity retention "
    );

    Serial.print(
      pair.nodeA + 1
    );

    Serial.print(
      "+: "
    );

    Serial.print(
      AB.retainedDifferenceMV
    );

    Serial.println(
      " mV"
    );


    Serial.print(
      "Polarity retention "
    );

    Serial.print(
      pair.nodeB + 1
    );

    Serial.print(
      "+: "
    );

    Serial.print(
      BA.retainedDifferenceMV
    );

    Serial.println(
      " mV"
    );


    uint32_t larger =

      max(
        AB.retainedDifferenceMV,
        BA.retainedDifferenceMV
      );


    uint32_t smaller =

      min(
        AB.retainedDifferenceMV,
        BA.retainedDifferenceMV
      );


    int difference =

      (int)larger -
      (int)smaller;


    float ratio =

      (
        smaller > 0
      )

      ? (float)larger /
        (float)smaller

      : 999.0;


    bool polarityStrong =

      difference >=
        POLARITY_MIN_DIFFERENCE_MV

      &&

      ratio >=
        POLARITY_MIN_RATIO;


    if (
      !polarityStrong
    ) {

      Serial.println(
        "Polarity: not detected / likely non-polar"
      );

    }

    else {

      Serial.println(
        "*** POLARIZED CAPACITOR CANDIDATE ***"
      );


      if (
        AB.retainedDifferenceMV >
        BA.retainedDifferenceMV
      ) {

        Serial.print(
          "Positive: Node "
        );

        Serial.println(
          pair.nodeA + 1
        );


        Serial.print(
          "Negative: Node "
        );

        Serial.println(
          pair.nodeB + 1
        );

      }

      else {

        Serial.print(
          "Positive: Node "
        );

        Serial.println(
          pair.nodeB + 1
        );


        Serial.print(
          "Negative: Node "
        );

        Serial.println(
          pair.nodeA + 1
        );
      }
    }


    Serial.println();

    return true;
  }


  return false;
}


// ============================================================
// Diode / LED classification
// ============================================================

bool classifyDiodeLED(
  PairResult pairs[3]
) {

  int count = 0;

  int selected = -1;


  for (
    int i = 0;
    i < 3;
    i++
  ) {

    bool f =
      pairs[i].forward.conducting;

    bool r =
      pairs[i].reverse.conducting;


    if (
      f != r
    ) {

      count++;

      selected =
        i;
    }
  }


  if (
    count != 1
  ) {

    return false;
  }


  PairResult &pair =
    pairs[selected];


  DirectionResult conducting;

  int anode;

  int cathode;


  if (
    pair.forward.conducting
  ) {

    conducting =
      pair.forward;

    anode =
      pair.nodeA;

    cathode =
      pair.nodeB;

  }

  else {

    conducting =
      pair.reverse;

    anode =
      pair.nodeB;

    cathode =
      pair.nodeA;
  }


  float vf =

    (
      (float)conducting.sourceMV -
      (float)conducting.sinkMV
    ) /
    1000.0;


  Serial.println();


  if (
    vf >=
    LED_THRESHOLD_V
  ) {

    Serial.println(
      "*** LED DETECTED ***"
    );

  }

  else {

    Serial.println(
      "*** DIODE DETECTED ***"
    );
  }


  Serial.print(
    "Anode: Node "
  );

  Serial.println(
    anode + 1
  );


  Serial.print(
    "Cathode: Node "
  );

  Serial.println(
    cathode + 1
  );


  Serial.print(
    "Forward voltage: "
  );

  Serial.print(
    vf,
    3
  );

  Serial.println(
    " V"
  );


  Serial.println();

  return true;
}


// ============================================================
// Resistor classification
// ============================================================

bool classifyResistor(
  PairResult pairs[3]
) {

  for (
    int i = 0;
    i < 3;
    i++
  ) {

    PairResult &pair =
      pairs[i];


    if (
      !pair.forward.conducting

      ||

      !pair.reverse.conducting
    ) {

      continue;
    }


    float r1 =
      pair.forward.resistance;

    float r2 =
      pair.reverse.resistance;


    if (
      r1 <= 0 ||
      r2 <= 0
    ) {

      continue;
    }


    float average =

      (
        r1 +
        r2
      ) /
      2.0;


    float mismatch =

      fabs(
        r1 -
        r2
      ) /
      average;


    if (
      mismatch <=
      MAX_RESISTANCE_MISMATCH
    ) {

      Serial.println();

      Serial.println(
        "*** RESISTOR DETECTED ***"
      );


      Serial.print(
        "Terminals: Node "
      );

      Serial.print(
        pair.nodeA + 1
      );

      Serial.print(
        " <-> Node "
      );

      Serial.println(
        pair.nodeB + 1
      );


      Serial.print(
        "Resistance: "
      );

      printResistance(
        average
      );

      Serial.println();


      Serial.print(
        "Direction mismatch: "
      );

      Serial.print(
        mismatch * 100.0,
        1
      );

      Serial.println(
        "%"
      );


      Serial.println();

      return true;
    }
  }


  return false;
}


// ============================================================
// Full component scan
// ============================================================

void scanComponent() {

  Serial.println();

  Serial.println(
    "================================"
  );

  Serial.println(
    "     PocketLab Component ID"
  );

  Serial.println(
    "================================"
  );

  Serial.println();


  PairResult pairs[3];


  pairs[0] =
    measurePair(
      0,
      1
    );


  pairs[1] =
    measurePair(
      0,
      2
    );


  pairs[2] =
    measurePair(
      1,
      2
    );


  for (
    int i = 0;
    i < 3;
    i++
  ) {

    printPair(
      pairs[i]
    );
  }


  // ----------------------------------------------------------
  // Classification priority
  //
  // 1. BJT
  //
  // 2. Capacitor
  //    IMPORTANT:
  //    capacitor transient test now occurs BEFORE diode/LED
  //    classification so stored capacitor charge cannot easily
  //    masquerade as a semiconductor.
  //
  // 3. Diode / LED
  //
  // 4. Resistor
  //
  // ----------------------------------------------------------

  if (
    classifyBJT(
      pairs
    )
  ) {

    allHighZ();

    return;
  }


  if (
    classifyCapacitor(
      pairs
    )
  ) {

    allHighZ();

    return;
  }


  if (
    classifyDiodeLED(
      pairs
    )
  ) {

    allHighZ();

    return;
  }


  if (
    classifyResistor(
      pairs
    )
  ) {

    allHighZ();

    return;
  }


  Serial.println(
    "No supported component detected."
  );

  Serial.println();


  allHighZ();
}


// ============================================================
// Setup
// ============================================================

void setup() {

  Serial.begin(
    115200
  );


  delay(
    1000
  );


  Serial.println();

  Serial.println(
    "PocketLab CompID ESP32 POC"
  );

  Serial.println(
    "Firmware: R / C autorange / diode / LED / BJT"
  );

  Serial.println();


  analogReadResolution(
    12
  );


  analogSetPinAttenuation(
    nodes[0].adcPin,
    ADC_11db
  );


  analogSetPinAttenuation(
    nodes[1].adcPin,
    ADC_11db
  );


  analogSetPinAttenuation(
    nodes[2].adcPin,
    ADC_11db
  );


  allHighZ();

  dischargeNodes();
}


// ============================================================
// Main loop
// ============================================================

void loop() {

  scanComponent();


  Serial.println(
    "Waiting..."
  );

  Serial.println();


  delay(
    10000
  );
}