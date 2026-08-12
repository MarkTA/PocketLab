/*
  PocketLab DMM — ADS1220 100.6 kOhm / 10 uA resistance test

  Target: ESP32 NodeMCU-32S + bare ADS1220IPWR breakout

  Normal ratiometric wiring:

      ADS1220 AIN2 ----+---- AIN0       (Node A)
                      |
                     Rx              unknown, unpowered resistor
                      |
      ADS1220 AIN1 ----+---- REFP0      (Node B)
                            |
                        100.6 kOhm     reference resistor
                            |
      ADS1220 REFN0 --------+---- AGND

  The sketch routes IDAC1 = 10 uA to AIN2, measures AIN0-AIN1, and
  uses REFP0-REFN0 as the ADC reference. At gain 1:

      Rx = (signed ADC code / 2^23) * Rref

  Expected bench voltages:
      Across Rref:                       about 1.006 V
      AIN2 to AGND with Rx = 21.49 kOhm: about 1.221 V
      21.49 kOhm resistor reading:       about 21.36% full scale

  Command i temporarily routes IDAC1 directly to REFP0. With only the
  100.6 kOhm reference in that path, REFP0-to-REFN0 should be about 1.006 V.
  Send c afterward to restore normal resistance measurements.

  IMPORTANT: This is an unprotected bench circuit. Connect only unpowered
  resistors/components and discharged capacitors while resistance mode is on.
*/

#include <Arduino.h>
#include <SPI.h>

constexpr int PIN_SCLK = 18;
constexpr int PIN_MISO = 19;  // ADS1220 pin 15, DOUT/DRDY
constexpr int PIN_MOSI = 23;  // ADS1220 pin 16, DIN
constexpr int PIN_CS   = 27;  // ADS1220 pin 2, CS
constexpr int PIN_DRDY = 26;  // ADS1220 pin 14, dedicated DRDY

// Replace with the measured/calibrated resistance when known more accurately.
constexpr double R_REF_OHMS = 100600.0;
// Keep zero correction disabled until a short is measured on this exact setup.
constexpr double ZERO_OFFSET_OHMS = 0.0;

constexpr uint16_t IDAC_CURRENT_UA = 10;
constexpr uint8_t PGA_GAIN = 1;
constexpr double EXPECTED_REF_VOLTS =
    R_REF_OHMS * static_cast<double>(IDAC_CURRENT_UA) * 1.0e-6;

constexpr uint32_t SERIAL_BAUD = 115200;
constexpr uint32_t SPI_CLOCK_HZ = 1000000;
constexpr uint32_t DRDY_TIMEOUT_MS = 250;
constexpr uint8_t SAMPLES_PER_REPORT = 10;
constexpr uint32_t REPORT_INTERVAL_MS = 500;

constexpr uint8_t CMD_RESET      = 0x06;
constexpr uint8_t CMD_START_SYNC = 0x08;
constexpr uint8_t CMD_POWERDOWN  = 0x02;
constexpr uint8_t CMD_RDATA      = 0x10;

// CONFIG0: AIN0-AIN1, gain 1, PGA enabled.
constexpr uint8_t CONFIG0 = 0x00;
// CONFIG1: 20 SPS, normal mode, continuous conversion.
constexpr uint8_t CONFIG1 = 0x04;
// CONFIG2: external REFP0/REFN0 reference and 10-uA IDAC current.
constexpr uint8_t CONFIG2 = 0x41;
// CONFIG3 normal route: IDAC1 -> AIN2; IDAC2 disconnected.
constexpr uint8_t CONFIG3_NORMAL = 0x60;
// CONFIG3 diagnostic route: IDAC1 -> REFP0; IDAC2 disconnected.
constexpr uint8_t CONFIG3_DIRECT = 0xA0;

constexpr int32_t ADC_POSITIVE_FULL_SCALE = 0x7FFFFF;
constexpr int32_t ADC_NEGATIVE_FULL_SCALE = -0x800000;
constexpr double ADC_DENOMINATOR = 8388608.0;  // 2^23

const uint8_t NORMAL_REGS[4] = {
  CONFIG0, CONFIG1, CONFIG2, CONFIG3_NORMAL
};

SPISettings adsSpiSettings(SPI_CLOCK_HZ, MSBFIRST, SPI_MODE1);
bool measurementsEnabled = false;
String serialCommand;

void selectAds() {
  SPI.beginTransaction(adsSpiSettings);
  digitalWrite(PIN_CS, LOW);
  delayMicroseconds(2);
}

void deselectAds() {
  delayMicroseconds(2);
  digitalWrite(PIN_CS, HIGH);
  SPI.endTransaction();
}

void sendCommand(uint8_t command) {
  selectAds();
  SPI.transfer(command);
  deselectAds();
}

void writeRegisters(const uint8_t *values, uint8_t count) {
  if (count == 0 || count > 4) return;
  const uint8_t command = 0x40 | ((count - 1) & 0x03);
  selectAds();
  SPI.transfer(command);
  for (uint8_t i = 0; i < count; ++i) SPI.transfer(values[i]);
  deselectAds();
}

void writeRegister(uint8_t address, uint8_t value) {
  if (address > 3) return;
  const uint8_t command = 0x40 | ((address & 0x03) << 2);
  selectAds();
  SPI.transfer(command);
  SPI.transfer(value);
  deselectAds();
}

void readRegisters(uint8_t *values, uint8_t count) {
  if (count == 0 || count > 4) return;
  const uint8_t command = 0x20 | ((count - 1) & 0x03);
  selectAds();
  SPI.transfer(command);
  for (uint8_t i = 0; i < count; ++i) values[i] = SPI.transfer(0x00);
  deselectAds();
}

void printHexByte(uint8_t value) {
  if (value < 0x10) Serial.print('0');
  Serial.print(value, HEX);
}

bool verifyRegisters(const uint8_t *expected) {
  uint8_t actual[4] = {};
  readRegisters(actual, 4);

  bool match = true;
  for (uint8_t i = 0; i < 4; ++i) {
    if (actual[i] != expected[i]) match = false;
  }

  Serial.print("Registers: ");
  for (uint8_t i = 0; i < 4; ++i) {
    printHexByte(actual[i]);
    if (i < 3) Serial.print(' ');
  }
  Serial.print(match ? "  [PASS] expected " : "  [FAIL] expected ");
  for (uint8_t i = 0; i < 4; ++i) {
    printHexByte(expected[i]);
    if (i < 3) Serial.print(' ');
  }
  Serial.println();
  return match;
}

void programIdacRoute(uint8_t route) {
  // Configure the current with both outputs disconnected, allow the IDAC
  // circuitry to start, and then connect IDAC1 to the requested pin.
  const uint8_t startupRegs[4] = {CONFIG0, CONFIG1, CONFIG2, 0x00};
  writeRegisters(startupRegs, 4);
  delayMicroseconds(300);
  writeRegister(3, route);
}

void configureNormalMode() {
  measurementsEnabled = false;
  sendCommand(CMD_RESET);
  delay(1);

  programIdacRoute(CONFIG3_NORMAL);
  delay(1);

  if (!verifyRegisters(NORMAL_REGS)) {
    Serial.println("STOP: ADS1220 register readback failed.");
    Serial.println("Check power, common ground, CS, SPI pins, and SPI mode.");
    return;
  }

  sendCommand(CMD_START_SYNC);
  delay(60);
  measurementsEnabled = true;

  Serial.print("Normal mode active. Expected Rref voltage: ");
  Serial.print(EXPECTED_REF_VOLTS, 4);
  Serial.println(" V");
}

void runDirectIdacTest() {
  measurementsEnabled = false;
  sendCommand(CMD_POWERDOWN);
  delay(1);

  programIdacRoute(CONFIG3_DIRECT);
  sendCommand(CMD_START_SYNC);
  delay(60);

  const uint8_t directRegs[4] = {
    CONFIG0, CONFIG1, CONFIG2, CONFIG3_DIRECT
  };
  verifyRegisters(directRegs);

  Serial.println("DIRECT IDAC TEST ACTIVE: IDAC1 -> REFP0");
  Serial.print("Measure REFP0 to REFN0/GND; expected about ");
  Serial.print(EXPECTED_REF_VOLTS, 4);
  Serial.println(" V.");
  Serial.println("Resistance readings are paused. Send c to restore normal mode.");
}

bool waitForDataReady(uint32_t timeoutMs) {
  const uint32_t started = millis();
  while (digitalRead(PIN_DRDY) == HIGH) {
    if (millis() - started >= timeoutMs) return false;
    delay(1);
  }
  return true;
}

int32_t readConversion() {
  selectAds();
  SPI.transfer(CMD_RDATA);
  const uint32_t msb = SPI.transfer(0x00);
  const uint32_t mid = SPI.transfer(0x00);
  const uint32_t lsb = SPI.transfer(0x00);
  deselectAds();

  uint32_t raw = (msb << 16) | (mid << 8) | lsb;
  if (raw & 0x800000UL) raw |= 0xFF000000UL;
  return static_cast<int32_t>(raw);
}

double codeToResistance(double code) {
  return (code / ADC_DENOMINATOR) * (R_REF_OHMS / PGA_GAIN);
}

void reportMeasurements() {
  int64_t codeSum = 0;
  int32_t codeMin = ADC_POSITIVE_FULL_SCALE;
  int32_t codeMax = ADC_NEGATIVE_FULL_SCALE;

  for (uint8_t i = 0; i < SAMPLES_PER_REPORT; ++i) {
    if (!waitForDataReady(DRDY_TIMEOUT_MS)) {
      Serial.println("TIMEOUT: DRDY stayed high. Check ADS1220 pin 14 -> GPIO 26.");
      return;
    }

    const int32_t code = readConversion();
    codeSum += code;
    if (code < codeMin) codeMin = code;
    if (code > codeMax) codeMax = code;
  }

  const double averageCode =
      static_cast<double>(codeSum) / SAMPLES_PER_REPORT;
  const double rawResistance = codeToResistance(averageCode);
  const double correctedResistance = rawResistance - ZERO_OFFSET_OHMS;
  const double spanOhms = codeToResistance(
      static_cast<double>(codeMax) - static_cast<double>(codeMin));
  const double fullScalePercent = 100.0 * averageCode / ADC_DENOMINATOR;

  Serial.print("avg_code=");
  Serial.print(averageCode, 1);
  Serial.print("  Rx=");
  Serial.print(correctedResistance, 3);
  Serial.print(" ohm  raw=");
  Serial.print(rawResistance, 3);
  Serial.print(" ohm  span=");
  Serial.print(spanOhms, 3);
  Serial.print(" ohm  FS=");
  Serial.print(fullScalePercent, 3);
  Serial.print('%');

  if (codeMax >= ADC_POSITIVE_FULL_SCALE - 1000) {
    Serial.print("  [CLIPPED/NEAR +FS: Rx must remain below Rref]");
  } else if (codeMin <= ADC_NEGATIVE_FULL_SCALE + 1000) {
    Serial.print("  [NEAR -FS: check polarity/wiring]");
  } else if (averageCode < 0) {
    Serial.print("  [NEGATIVE: check AIN0/AIN1 polarity]");
  }
  Serial.println();
}

void printHelp() {
  Serial.println();
  Serial.println("PocketLab ADS1220 100.6 kOhm / 10 uA resistance test");
  Serial.println("-------------------------------------------------------");
  Serial.println("Normal registers: 00 04 41 60");
  Serial.println("IDAC1: 10 uA -> AIN2; ADC: AIN0-AIN1; reference: REFP0-REFN0");
  Serial.print("Rref used in calculation: ");
  Serial.print(R_REF_OHMS, 1);
  Serial.println(" ohm");
  Serial.print("Expected voltage across Rref: ");
  Serial.print(EXPECTED_REF_VOLTS, 4);
  Serial.println(" V");
  Serial.print("Zero correction: ");
  Serial.print(ZERO_OFFSET_OHMS, 4);
  Serial.println(" ohm (uncalibrated)");
  Serial.println("Nominal unclipped range: 0 to just under 100.6 kOhm");
  Serial.println("WARNING: connect only unpowered resistors/components.");
  Serial.println();
  Serial.println("Commands (press Enter):");
  Serial.println("  i = direct IDAC test: IDAC1 -> REFP0");
  Serial.println("  c = restore normal resistance mode");
  Serial.println("  r = register readback for normal mode");
  Serial.println("  p = power down");
  Serial.println("  h = show help");
  Serial.println();
}

void processSerialCommand(String command) {
  command.trim();
  command.toLowerCase();
  if (command.length() == 0) return;

  if (command == "i") {
    runDirectIdacTest();
  } else if (command == "c") {
    Serial.println("Reconfiguring normal resistance mode...");
    configureNormalMode();
  } else if (command == "r") {
    verifyRegisters(NORMAL_REGS);
  } else if (command == "p") {
    sendCommand(CMD_POWERDOWN);
    measurementsEnabled = false;
    Serial.println("ADS1220 powered down; send c to reconfigure/restart.");
  } else if (command == "h" || command == "help") {
    printHelp();
  } else {
    Serial.println("Unknown command. Use i, c, r, p, or h.");
  }
}

void handleSerialCommand() {
  while (Serial.available()) {
    const char incoming = static_cast<char>(Serial.read());
    if (incoming == '\n' || incoming == '\r') {
      if (serialCommand.length() > 0) {
        processSerialCommand(serialCommand);
        serialCommand = "";
      }
    } else if (serialCommand.length() < 31) {
      serialCommand += incoming;
    }
  }
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(750);

  pinMode(PIN_CS, OUTPUT);
  digitalWrite(PIN_CS, HIGH);
  pinMode(PIN_DRDY, INPUT);
  SPI.begin(PIN_SCLK, PIN_MISO, PIN_MOSI, PIN_CS);

  printHelp();
  configureNormalMode();
}

void loop() {
  handleSerialCommand();
  if (measurementsEnabled) reportMeasurements();
  delay(REPORT_INTERVAL_MS);
}