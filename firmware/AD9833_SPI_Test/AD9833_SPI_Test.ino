/*
 * AD9833 SPI Test
 *
 * Board: ESP32 NodeMCU-32S
 *
 * Wiring:
 *   AD9833 VCC   -> ESP32 3V3
 *   AD9833 DGND  -> ESP32 GND
 *   AD9833 AGND  -> ESP32 GND
 *   AD9833 SDATA -> ESP32 GPIO 23
 *   AD9833 SCLK  -> ESP32 GPIO 18
 *   AD9833 FSYNC -> ESP32 GPIO 5
 *   AD9833 OUT   -> Oscilloscope
 *
 * Serial Monitor:
 *   Baud: 115200
 *   Line ending: Newline
 *
 * Commands:
 *   sine
 *   triangle
 *   square
 *   freq 1000
 *   on
 *   off
 *   status
 */

#include <Arduino.h>
#include <SPI.h>

// -----------------------------------------------------------------------------
// ESP32 pins
// -----------------------------------------------------------------------------

constexpr int AD9833_SCLK_PIN  = 18;
constexpr int AD9833_SDATA_PIN = 23;
constexpr int AD9833_FSYNC_PIN = 5;

// -----------------------------------------------------------------------------
// AD9833 configuration
// -----------------------------------------------------------------------------

/*
 * Most inexpensive AD9833 modules use a 25 MHz oscillator.
 *
 * Check the oscillator marking on your module. If yours uses a different
 * master clock, change this value.
 */
constexpr double AD9833_MASTER_CLOCK_HZ = 25'000'000.0;

/*
 * 1 MHz is intentionally conservative for initial breadboard testing.
 */
constexpr uint32_t AD9833_SPI_CLOCK_HZ = 1'000'000;

// -----------------------------------------------------------------------------
// AD9833 register constants
// -----------------------------------------------------------------------------

constexpr uint16_t AD9833_CONTROL_B28      = 0x2000;
constexpr uint16_t AD9833_CONTROL_RESET    = 0x0100;
constexpr uint16_t AD9833_CONTROL_OPBITEN  = 0x0020;
constexpr uint16_t AD9833_CONTROL_DIV2     = 0x0008;
constexpr uint16_t AD9833_CONTROL_MODE     = 0x0002;

constexpr uint16_t AD9833_FREQ0_REGISTER   = 0x4000;
constexpr uint16_t AD9833_PHASE0_REGISTER  = 0xC000;

// -----------------------------------------------------------------------------
// Waveform type
// -----------------------------------------------------------------------------

enum class Waveform {
  Sine,
  Triangle,
  Square
};

// -----------------------------------------------------------------------------
// Current test state
// -----------------------------------------------------------------------------

Waveform currentWaveform = Waveform::Sine;

uint32_t currentFrequencyHz = 1000;

bool outputEnabled = true;

// -----------------------------------------------------------------------------
// Low-level SPI write
// -----------------------------------------------------------------------------

void writeAd9833Word(uint16_t word) {
  SPI.beginTransaction(
    SPISettings(
      AD9833_SPI_CLOCK_HZ,
      MSBFIRST,
      SPI_MODE2
    )
  );

  digitalWrite(AD9833_FSYNC_PIN, LOW);

  /*
   * The AD9833 expects one complete 16-bit control or data word.
   */
  SPI.transfer16(word);

  digitalWrite(AD9833_FSYNC_PIN, HIGH);

  SPI.endTransaction();

  Serial.printf(
    "[SPI] Wrote 0x%04X\n",
    word
  );
}

// -----------------------------------------------------------------------------
// Control-register construction
// -----------------------------------------------------------------------------

uint16_t buildControlWord(
  Waveform waveform,
  bool reset
) {
  uint16_t control = AD9833_CONTROL_B28;

  if (reset) {
    control |= AD9833_CONTROL_RESET;
  }

  switch (waveform) {
    case Waveform::Sine:
      /*
       * MODE = 0
       * OPBITEN = 0
       *
       * The DAC outputs its sine lookup-table value.
       */
      break;

    case Waveform::Triangle:
      /*
       * MODE = 1
       *
       * The phase accumulator feeds the DAC directly,
       * producing a triangle waveform.
       */
      control |= AD9833_CONTROL_MODE;
      break;

    case Waveform::Square:
      /*
       * OPBITEN = 1
       * DIV2 = 1
       *
       * Routes the phase-accumulator MSB through the
       * digital output path.
       */
      control |=
        AD9833_CONTROL_OPBITEN |
        AD9833_CONTROL_DIV2;
      break;
  }

  return control;
}

// -----------------------------------------------------------------------------
// Frequency register
// -----------------------------------------------------------------------------

uint32_t calculateFrequencyWord(
  uint32_t frequencyHz
) {
  /*
   * AD9833 tuning word:
   *
   * frequencyWord =
   *   outputFrequency * 2^28 / masterClock
   */
  const double tuningWord =
    static_cast<double>(frequencyHz) *
    268435456.0 /
    AD9833_MASTER_CLOCK_HZ;

  return static_cast<uint32_t>(
    tuningWord + 0.5
  );
}

void writeFrequencyRegister(
  uint32_t frequencyHz
) {
  const uint32_t frequencyWord =
    calculateFrequencyWord(frequencyHz);

  /*
   * FREQ0 is written as two 14-bit values.
   */
  const uint16_t lower14 =
    static_cast<uint16_t>(
      frequencyWord & 0x3FFF
    );

  const uint16_t upper14 =
    static_cast<uint16_t>(
      (frequencyWord >> 14) & 0x3FFF
    );

  writeAd9833Word(
    AD9833_FREQ0_REGISTER | lower14
  );

  writeAd9833Word(
    AD9833_FREQ0_REGISTER | upper14
  );

  Serial.printf(
    "[AD9833] Frequency word: 0x%07lX\n",
    static_cast<unsigned long>(frequencyWord)
  );
}

// -----------------------------------------------------------------------------
// Phase register
// -----------------------------------------------------------------------------

void writePhaseRegister(uint16_t phaseWord) {
  /*
   * Only the lower 12 bits are phase data.
   */
  writeAd9833Word(
    AD9833_PHASE0_REGISTER |
    (phaseWord & 0x0FFF)
  );
}

// -----------------------------------------------------------------------------
// Apply complete configuration
// -----------------------------------------------------------------------------

void applyAd9833Configuration() {
  /*
   * Hold the phase accumulator in reset while changing registers.
   */
  writeAd9833Word(
    buildControlWord(
      currentWaveform,
      true
    )
  );

  writeFrequencyRegister(
    currentFrequencyHz
  );

  writePhaseRegister(0);

  /*
   * Releasing RESET starts waveform generation.
   *
   * Keeping RESET asserted does not make OUT electrically high impedance;
   * it simply stops normal waveform generation.
   */
  writeAd9833Word(
    buildControlWord(
      currentWaveform,
      !outputEnabled
    )
  );

  Serial.printf(
    "[AD9833] Applied: %s, %lu Hz, output %s\n",
    waveformName(currentWaveform),
    static_cast<unsigned long>(currentFrequencyHz),
    outputEnabled ? "ON" : "OFF"
  );
}

// -----------------------------------------------------------------------------
// State changes
// -----------------------------------------------------------------------------

void setFrequency(uint32_t frequencyHz) {
  if (
    frequencyHz < 1 ||
    frequencyHz > 1'000'000
  ) {
    Serial.println(
      "[ERROR] Frequency must be between 1 Hz and 1 MHz."
    );

    return;
  }

  currentFrequencyHz = frequencyHz;

  applyAd9833Configuration();
}

void setWaveform(Waveform waveform) {
  currentWaveform = waveform;

  applyAd9833Configuration();
}

void setOutputEnabled(bool enabled) {
  outputEnabled = enabled;

  writeAd9833Word(
    buildControlWord(
      currentWaveform,
      !outputEnabled
    )
  );

  Serial.printf(
    "[AD9833] Output %s\n",
    outputEnabled ? "ON" : "OFF"
  );
}

// -----------------------------------------------------------------------------
// Utility
// -----------------------------------------------------------------------------

const char* waveformName(
  Waveform waveform
) {
  switch (waveform) {
    case Waveform::Sine:
      return "SINE";

    case Waveform::Triangle:
      return "TRIANGLE";

    case Waveform::Square:
      return "SQUARE";
  }

  return "UNKNOWN";
}

void printStatus() {
  Serial.println();
  Serial.println("AD9833 status");
  Serial.println("-------------");

  Serial.printf(
    "Waveform:  %s\n",
    waveformName(currentWaveform)
  );

  Serial.printf(
    "Frequency: %lu Hz\n",
    static_cast<unsigned long>(
      currentFrequencyHz
    )
  );

  Serial.printf(
    "Output:    %s\n",
    outputEnabled ? "ON" : "OFF"
  );

  Serial.printf(
    "MCLK:      %.0f Hz\n",
    AD9833_MASTER_CLOCK_HZ
  );

  Serial.println();
}

void printHelp() {
  Serial.println();
  Serial.println("AD9833 SPI test");
  Serial.println("----------------");
  Serial.println("Commands:");
  Serial.println("  sine");
  Serial.println("  triangle");
  Serial.println("  square");
  Serial.println("  freq 1000");
  Serial.println("  on");
  Serial.println("  off");
  Serial.println("  status");
  Serial.println("  help");
  Serial.println();
}

// -----------------------------------------------------------------------------
// Serial command parser
// -----------------------------------------------------------------------------

void processCommand(String command) {
  command.trim();
  command.toLowerCase();

  if (command.length() == 0) {
    return;
  }

  if (command == "sine") {
    setWaveform(Waveform::Sine);
    return;
  }

  if (command == "triangle") {
    setWaveform(Waveform::Triangle);
    return;
  }

  if (command == "square") {
    setWaveform(Waveform::Square);
    return;
  }

  if (command == "on") {
    setOutputEnabled(true);
    return;
  }

  if (command == "off") {
    setOutputEnabled(false);
    return;
  }

  if (command == "status") {
    printStatus();
    return;
  }

  if (command == "help") {
    printHelp();
    return;
  }

  if (command.startsWith("freq ")) {
    const String frequencyText =
      command.substring(5);

    const long frequency =
      frequencyText.toInt();

    if (frequency <= 0) {
      Serial.println(
        "[ERROR] Example: freq 1000"
      );

      return;
    }

    setFrequency(
      static_cast<uint32_t>(frequency)
    );

    return;
  }

  Serial.printf(
    "[ERROR] Unknown command: %s\n",
    command.c_str()
  );

  printHelp();
}

// -----------------------------------------------------------------------------
// Arduino setup
// -----------------------------------------------------------------------------

void setup() {
  Serial.begin(115200);

  delay(500);

  Serial.println();
  Serial.println(
    "Starting AD9833 SPI test"
  );

  pinMode(
    AD9833_FSYNC_PIN,
    OUTPUT
  );

  /*
   * FSYNC is inactive high.
   */
  digitalWrite(
    AD9833_FSYNC_PIN,
    HIGH
  );

  /*
   * ESP32 SPI initialization:
   *
   * begin(SCLK, MISO, MOSI, SS)
   *
   * MISO is -1 because the AD9833 is write-only.
   */
  SPI.begin(
    AD9833_SCLK_PIN,
    -1,
    AD9833_SDATA_PIN,
    AD9833_FSYNC_PIN
  );

  delay(10);

  applyAd9833Configuration();

  printHelp();
  printStatus();
}

// -----------------------------------------------------------------------------
// Arduino loop
// -----------------------------------------------------------------------------

void loop() {
  if (!Serial.available()) {
    return;
  }

  const String command =
    Serial.readStringUntil('\n');

  processCommand(command);
}
