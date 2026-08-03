/*
  PocketLab DMM — 999:1 Input Divider Test

  ADS1220 / ESP32 wiring:
    ADS1220 SCLK  -> ESP32 GPIO18
    ADS1220 MOSI  -> ESP32 GPIO23
    ADS1220 MISO  -> ESP32 GPIO19
    ADS1220 CS    -> ESP32 GPIO27
    ADS1220 DRDY  -> ESP32 GPIO26
    ADS1220 AVDD  -> ESP32 3V3
    ADS1220 AGND  -> ESP32 GND
    ADS1220 CLK   -> ADS1220 DGND

  Divider and source wiring:
    Source positive -> divider P1  (VIN)
    Divider P11     -> OPA input
    OPA output      -> 1 kohm -> ADS1220 AIN0 (VSENSE)
    Divider P12     -> ADS1220 AIN1 and AGND (COM)
    Source negative -> divider P12 (COM)

  Divider:
    9.98 Mohm high side and 10.000 kohm low side
    Nominal attenuation = 999:1

  Range relay:
    ESP32 GPIO25 -> 1 kohm -> 2N3904 base
    2N3904 base -> 10 kohm -> COM
    2N3904 emitter -> COM
    2N3904 collector -> relay coil
    Other relay coil terminal -> ESP32 5V0
    Relay NO contacts -> divider P1 and P9
    Relay OFF = 999:1 range (safe startup state)
    Relay ON  = 37:1 range

  Test configuration:
    - AIN0 minus AIN1
    - Gain 1, PGA bypassed
    - Internal nominal 2.048 V reference
    - Normal mode, 20 samples per second
    - Single-shot conversions

  This first test is for positive, isolated, current-limited DC only.
  Do not apply a negative input or connect to mains.
*/

#include <SPI.h>
#include <math.h>

constexpr uint8_t PIN_ADS1220_SCLK = 18;
constexpr uint8_t PIN_ADS1220_MISO = 19;
constexpr uint8_t PIN_ADS1220_MOSI = 23;
constexpr uint8_t PIN_ADS1220_CS   = 27;
constexpr uint8_t PIN_ADS1220_DRDY = 26;
constexpr uint8_t PIN_RANGE_RELAY  = 25;

constexpr uint32_t SERIAL_BAUD = 115200;
constexpr uint32_t SPI_CLOCK_HZ = 1000000;
constexpr uint32_t DRDY_TIMEOUT_MS = 250;
constexpr size_t SAMPLE_COUNT = 100;

constexpr uint8_t CMD_RESET = 0x06;
constexpr uint8_t CMD_START_SYNC = 0x08;
constexpr uint8_t CMD_RDATA = 0x10;
constexpr uint8_t CMD_RREG = 0x20;
constexpr uint8_t CMD_WREG = 0x40;

// CONFIG0: AIN0-AIN1, gain 1, PGA bypassed.
constexpr uint8_t CONFIG0_AIN0_AIN1_GAIN1_PGA_BYPASS = 0x01;
constexpr uint8_t CONFIG1_20_SPS_SINGLE_SHOT = 0x00;
constexpr uint8_t CONFIG2_INTERNAL_REF = 0x00;
constexpr uint8_t CONFIG3_DEFAULT = 0x00;

constexpr double INTERNAL_REFERENCE_V = 2.048;
constexpr double ADC_POSITIVE_CODES = 8388608.0;  // 2^23
constexpr double HIGH_RANGE_DIVIDER_RATIO = 999.0;
constexpr double LOW_RANGE_DIVIDER_RATIO = 37.0;

bool rangeRelayEnergized = false;

SPISettings ads1220SpiSettings(SPI_CLOCK_HZ, MSBFIRST, SPI_MODE1);

void selectAds1220() { digitalWrite(PIN_ADS1220_CS, LOW); }
void deselectAds1220() { digitalWrite(PIN_ADS1220_CS, HIGH); }

void sendCommand(uint8_t command) {
  SPI.beginTransaction(ads1220SpiSettings);
  selectAds1220();
  SPI.transfer(command);
  deselectAds1220();
  SPI.endTransaction();
}

void resetAds1220() {
  sendCommand(CMD_RESET);
  delay(2);
}

uint8_t readRegister(uint8_t address) {
  const uint8_t command = CMD_RREG | ((address & 0x03) << 2);
  SPI.beginTransaction(ads1220SpiSettings);
  selectAds1220();
  SPI.transfer(command);
  const uint8_t value = SPI.transfer(0x00);
  deselectAds1220();
  SPI.endTransaction();
  return value;
}

void writeRegister(uint8_t address, uint8_t value) {
  const uint8_t command = CMD_WREG | ((address & 0x03) << 2);
  SPI.beginTransaction(ads1220SpiSettings);
  selectAds1220();
  SPI.transfer(command);
  SPI.transfer(value);
  deselectAds1220();
  SPI.endTransaction();
}

void printHexByte(uint8_t value) {
  if (value < 0x10) Serial.print('0');
  Serial.print(value, HEX);
}

void printRegisters() {
  for (uint8_t address = 0; address < 4; ++address) {
    Serial.print("CONFIG");
    Serial.print(address);
    Serial.print(" = 0x");
    printHexByte(readRegister(address));
    Serial.println();
  }
}

bool waitForDataReady(uint32_t timeoutMs) {
  const uint32_t startMs = millis();
  while (digitalRead(PIN_ADS1220_DRDY) != LOW) {
    if (millis() - startMs >= timeoutMs) return false;
    delayMicroseconds(100);
  }
  return true;
}

int32_t readConversion() {
  SPI.beginTransaction(ads1220SpiSettings);
  selectAds1220();
  SPI.transfer(CMD_RDATA);
  const uint32_t raw =
      (static_cast<uint32_t>(SPI.transfer(0x00)) << 16) |
      (static_cast<uint32_t>(SPI.transfer(0x00)) << 8) |
      static_cast<uint32_t>(SPI.transfer(0x00));
  deselectAds1220();
  SPI.endTransaction();

  if ((raw & 0x00800000UL) != 0) {
    return static_cast<int32_t>(raw | 0xFF000000UL);
  }
  return static_cast<int32_t>(raw);
}

double codeToSenseVolts(int32_t code) {
  return static_cast<double>(code) * INTERNAL_REFERENCE_V /
         ADC_POSITIVE_CODES;
}

bool configureAds1220() {
  resetAds1220();
  writeRegister(0, CONFIG0_AIN0_AIN1_GAIN1_PGA_BYPASS);
  writeRegister(1, CONFIG1_20_SPS_SINGLE_SHOT);
  writeRegister(2, CONFIG2_INTERNAL_REF);
  writeRegister(3, CONFIG3_DEFAULT);

  Serial.println("Configuration readback (expected 01 00 00 00):");
  printRegisters();

  const bool configPass =
      readRegister(0) == CONFIG0_AIN0_AIN1_GAIN1_PGA_BYPASS &&
      readRegister(1) == CONFIG1_20_SPS_SINGLE_SHOT &&
      readRegister(2) == CONFIG2_INTERNAL_REF &&
      readRegister(3) == CONFIG3_DEFAULT;

  if (!configPass) {
    Serial.println();
    Serial.println("FAIL: Configuration register readback does not match.");
    return false;
  }

  return true;
}

void printCommandPrompt() {
  Serial.println();
  Serial.println("Commands:");
  Serial.println("  run             Collect 100 samples using the selected range");
  Serial.println("  relay on        Select 37:1 range (relay energized)");
  Serial.println("  relay off       Select 999:1 range (safe range)");
  Serial.println("  relay status    Show the selected range");
  Serial.println("  help            Show this command list");
}

double selectedDividerRatio() {
  return rangeRelayEnergized ? LOW_RANGE_DIVIDER_RATIO
                             : HIGH_RANGE_DIVIDER_RATIO;
}

void printRelayStatus() {
  Serial.print("Range relay: ");
  Serial.print(rangeRelayEnergized ? "ON" : "OFF");
  Serial.print("; nominal divider ratio: ");
  Serial.print(selectedDividerRatio(), 0);
  Serial.println(":1");
}

void setRangeRelay(bool energized) {
  digitalWrite(PIN_RANGE_RELAY, energized ? HIGH : LOW);
  rangeRelayEnergized = energized;

  // Allow the relay contacts and analog signal to settle before measurement.
  delay(10);
  printRelayStatus();
  if (energized) {
    Serial.println("CAUTION: 37:1 range selected; use only a known safe input voltage.");
  }
}

void runDividerTest() {
  Serial.println();
  Serial.println("Starting divider test...");
  printRelayStatus();

  const double dividerRatio = selectedDividerRatio();

  if (!configureAds1220()) {
    resetAds1220();
    Serial.println("ADS1220 reset after configuration failure.");
    printCommandPrompt();
    return;
  }

  Serial.println();
  Serial.println("Collecting 100 samples at 20 SPS...");
  Serial.println("Sample,Raw code,VSENSE volts,Nominal VIN volts");

  int32_t minimumCode = INT32_MAX;
  int32_t maximumCode = INT32_MIN;
  double meanCode = 0.0;
  double sumSquaredDifferences = 0.0;

  for (size_t index = 0; index < SAMPLE_COUNT; ++index) {
    sendCommand(CMD_START_SYNC);
    if (!waitForDataReady(DRDY_TIMEOUT_MS)) {
      Serial.println();
      Serial.print("FAIL: DRDY timeout at sample ");
      Serial.println(index + 1);
      resetAds1220();
      Serial.println("ADS1220 reset after timeout.");
      printCommandPrompt();
      return;
    }

    const int32_t code = readConversion();
    if (code < minimumCode) minimumCode = code;
    if (code > maximumCode) maximumCode = code;

    const double delta = static_cast<double>(code) - meanCode;
    meanCode += delta / static_cast<double>(index + 1);
    const double delta2 = static_cast<double>(code) - meanCode;
    sumSquaredDifferences += delta * delta2;

    const double senseVolts = codeToSenseVolts(code);
    Serial.print(index + 1);
    Serial.print(',');
    Serial.print(code);
    Serial.print(',');
    Serial.print(senseVolts, 9);
    Serial.print(',');
    Serial.println(senseVolts * dividerRatio, 6);
  }

  const double varianceCode =
      sumSquaredDifferences / static_cast<double>(SAMPLE_COUNT - 1);
  const double standardDeviationCode = sqrt(varianceCode);
  const int32_t peakToPeakCode = maximumCode - minimumCode;

  const double meanSenseVolts = meanCode * INTERNAL_REFERENCE_V /
                                ADC_POSITIVE_CODES;
  const double minimumSenseVolts = codeToSenseVolts(minimumCode);
  const double maximumSenseVolts = codeToSenseVolts(maximumCode);
  const double peakToPeakSenseUv = static_cast<double>(peakToPeakCode) *
      INTERNAL_REFERENCE_V * 1000000.0 / ADC_POSITIVE_CODES;
  const double standardDeviationSenseUv = standardDeviationCode *
      INTERNAL_REFERENCE_V * 1000000.0 / ADC_POSITIVE_CODES;

  Serial.println();
  Serial.println("Summary");
  Serial.print("Samples: "); Serial.println(SAMPLE_COUNT);
  Serial.print("Mean code: "); Serial.println(meanCode, 3);
  Serial.print("Mean VSENSE: ");
  Serial.print(meanSenseVolts, 9); Serial.println(" V");
  Serial.print("Nominal reconstructed VIN (");
  Serial.print(dividerRatio, 0);
  Serial.print(":1): ");
  Serial.print(meanSenseVolts * dividerRatio, 6);
  Serial.println(" V");
  Serial.print("Minimum VSENSE: ");
  Serial.print(minimumSenseVolts, 9); Serial.println(" V");
  Serial.print("Maximum VSENSE: ");
  Serial.print(maximumSenseVolts, 9); Serial.println(" V");
  Serial.print("Peak-to-peak VSENSE variation: ");
  Serial.print(peakToPeakCode); Serial.print(" codes, ");
  Serial.print(peakToPeakSenseUv, 3); Serial.println(" uV");
  Serial.print("VSENSE standard deviation: ");
  Serial.print(standardDeviationCode, 3); Serial.print(" codes, ");
  Serial.print(standardDeviationSenseUv, 3); Serial.println(" uV RMS");

  Serial.println();
  Serial.println("PASS: 100 divider conversions completed.");
  Serial.println("Resetting ADS1220 to its default configuration...");
  resetAds1220();
  Serial.println("Test complete.");
  printCommandPrompt();
}

void setup() {
  // Select the safest range before initializing Serial or SPI.
  pinMode(PIN_RANGE_RELAY, OUTPUT);
  digitalWrite(PIN_RANGE_RELAY, LOW);
  rangeRelayEnergized = false;

  pinMode(PIN_ADS1220_CS, OUTPUT);
  deselectAds1220();
  pinMode(PIN_ADS1220_DRDY, INPUT);

  Serial.begin(SERIAL_BAUD);
  Serial.setTimeout(100);
  delay(1500);

  SPI.begin(PIN_ADS1220_SCLK, PIN_ADS1220_MISO,
            PIN_ADS1220_MOSI, PIN_ADS1220_CS);

  Serial.println();
  Serial.println("PocketLab DMM");
  Serial.println("ADS1220 999:1 divider test");
  Serial.println();
  Serial.println("Required: buffered P11 VSENSE to AIN0; P12 COM to AIN1 and AGND.");
  Serial.println("Use positive, isolated, current-limited DC only.");
  printRelayStatus();

  // Preserve the original behavior: run once automatically after upload/reset.
  runDividerTest();
}

void loop() {
  if (Serial.available() == 0) return;

  String command = Serial.readStringUntil('\n');
  command.trim();
  command.toLowerCase();

  if (command == "run" || command == "r") {
    runDividerTest();
  } else if (command == "relay on" || command == "relay 1") {
    setRangeRelay(true);
  } else if (command == "relay off" || command == "relay 0") {
    setRangeRelay(false);
  } else if (command == "relay status" || command == "status") {
    printRelayStatus();
  } else if (command == "help" || command == "?") {
    printCommandPrompt();
  } else if (command.length() > 0) {
    Serial.print("Unknown command: ");
    Serial.println(command);
    Serial.println("Valid commands: run, r, relay on, relay off, relay status, status, help, ?");
    printCommandPrompt();
  }
}