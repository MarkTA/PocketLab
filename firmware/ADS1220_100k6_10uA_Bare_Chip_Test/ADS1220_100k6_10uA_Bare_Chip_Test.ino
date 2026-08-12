/*
  PocketLab DMM — bare ADS1220 10 uA IDAC test

  Target: ESP32 NodeMCU-32S + ADS1220IPWR on a breakout board
  Reference resistor: 100.6 kOhm

  Test wiring:

      ADS1220 REFP0 (pin 9) --- 100.6 kOhm --- REFN0 (pin 8) / AGND

  The firmware routes IDAC1 directly to REFP0. Measure from REFP0 to
  REFN0 with a handheld voltmeter. The nominal result is:

      10 uA * 100.6 kOhm = 1.006 V

  The ADS1220 internal ADC reference is selected during this diagnostic.
  The ADC conversion result is not used; this test checks only the IDAC.

  Do not select 50 uA or 100 uA with this resistor. Those settings would
  require 5.03 V or 10.06 V and exceed the IDAC compliance range on 3.3 V.

  IMPORTANT: This is an unprotected bench circuit. Connect only the passive
  reference resistor described above. Do not connect an energized circuit
  or charged capacitor.
*/

#include <Arduino.h>
#include <SPI.h>

// ESP32 VSPI pins used by the earlier PocketLab ADS1220 sketches.
constexpr int PIN_SCLK = 18;
constexpr int PIN_MISO = 19;  // ADS1220 pin 15, DOUT/DRDY
constexpr int PIN_MOSI = 23;  // ADS1220 pin 16, DIN
constexpr int PIN_CS   = 27;  // ADS1220 pin 2, CS

constexpr uint32_t SERIAL_BAUD = 115200;
constexpr uint32_t SPI_CLOCK_HZ = 1000000;
constexpr double R_REF_OHMS = 100600.0;
constexpr double IDAC_CURRENT_UA = 10.0;
constexpr double IDAC_TOLERANCE = 0.06;

constexpr uint8_t CMD_RESET      = 0x06;
constexpr uint8_t CMD_START_SYNC = 0x08;
constexpr uint8_t CMD_POWERDOWN  = 0x02;

// CONFIG0: AIN0-AIN1, gain 1 (conversion result is unused).
constexpr uint8_t CONFIG0 = 0x00;
// CONFIG1: 20 SPS, continuous-conversion mode.
constexpr uint8_t CONFIG1 = 0x04;
// CONFIG2: internal ADC reference; IDAC current = 10 uA.
constexpr uint8_t CONFIG2_10_UA = 0x01;
// CONFIG3: IDAC1 routed directly to REFP0; IDAC2 disconnected.
constexpr uint8_t CONFIG3_IDAC1_TO_REFP0 = 0xA0;

const uint8_t ACTIVE_REGS[4] = {
  CONFIG0, CONFIG1, CONFIG2_10_UA, CONFIG3_IDAC1_TO_REFP0
};
const uint8_t OFF_REGS[4] = {CONFIG0, CONFIG1, 0x00, 0x00};

SPISettings adsSpiSettings(SPI_CLOCK_HZ, MSBFIRST, SPI_MODE1);
String serialCommand;
bool idacActive = false;

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
  const uint8_t command = 0x40 | ((count - 1) & 0x03);  // WREG from reg 0
  selectAds();
  SPI.transfer(command);
  for (uint8_t i = 0; i < count; ++i) SPI.transfer(values[i]);
  deselectAds();
}

void writeRegister(uint8_t address, uint8_t value) {
  if (address > 3) return;
  const uint8_t command = 0x40 | ((address & 0x03) << 2);  // one register
  selectAds();
  SPI.transfer(command);
  SPI.transfer(value);
  deselectAds();
}

void readRegisters(uint8_t *values, uint8_t count) {
  if (count == 0 || count > 4) return;
  const uint8_t command = 0x20 | ((count - 1) & 0x03);  // RREG from reg 0
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

void printTarget() {
  const double nominal = IDAC_CURRENT_UA * 1.0e-6 * R_REF_OHMS;
  Serial.print("Measure REFP0 to REFN0. Nominal: ");
  Serial.print(nominal, 4);
  Serial.print(" V; datasheet +/-6% band: ");
  Serial.print(nominal * (1.0 - IDAC_TOLERANCE), 4);
  Serial.print(" to ");
  Serial.print(nominal * (1.0 + IDAC_TOLERANCE), 4);
  Serial.println(" V");
}

void startIdacTest() {
  idacActive = false;
  sendCommand(CMD_POWERDOWN);
  delay(1);

  // Program the current with both IDAC outputs disconnected, allow the IDAC
  // bias circuit to settle, then connect IDAC1 to REFP0 and restart operation.
  uint8_t startupRegs[4] = {CONFIG0, CONFIG1, CONFIG2_10_UA, 0x00};
  writeRegisters(startupRegs, 4);
  delayMicroseconds(300);
  writeRegister(3, CONFIG3_IDAC1_TO_REFP0);
  sendCommand(CMD_START_SYNC);
  delay(60);

  if (!verifyRegisters(ACTIVE_REGS)) {
    Serial.println("IDAC test not started: register verification failed.");
    return;
  }

  idacActive = true;
  Serial.println("IDAC1 active: 10 uA -> REFP0");
  printTarget();
}

void stopIdacTest() {
  sendCommand(CMD_POWERDOWN);
  delay(1);
  writeRegisters(OFF_REGS, 4);
  idacActive = false;
  verifyRegisters(OFF_REGS);
  Serial.println("IDAC off. Enter on to restart the test.");
}

void printHelp() {
  Serial.println();
  Serial.println("PocketLab ADS1220 100.6 kOhm / 10 uA bare-chip test");
  Serial.println("------------------------------------------------------");
  Serial.println("Wiring: REFP0 (pin 9) -- 100.6 kOhm -- REFN0 (pin 8) / AGND");
  Serial.println("Measure voltage from REFP0 to REFN0.");
  Serial.println();
  Serial.println("Commands (press Enter):");
  Serial.println("  on  = enable 10 uA IDAC1 test (nominal 1.006 V)");
  Serial.println("  r   = register readback");
  Serial.println("  off = disable IDAC output");
  Serial.println("  h   = show this help");
  Serial.println();
}

void processSerialCommand(String command) {
  command.trim();
  command.toLowerCase();
  if (command.length() == 0) return;

  if (command == "on" || command == "10") {
    startIdacTest();
  } else if (command == "r") {
    verifyRegisters(idacActive ? ACTIVE_REGS : OFF_REGS);
    if (idacActive) printTarget();
  } else if (command == "off" || command == "p") {
    stopIdacTest();
  } else if (command == "h" || command == "help") {
    printHelp();
  } else {
    Serial.println("Unknown command. Enter on, r, off, or h.");
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
  SPI.begin(PIN_SCLK, PIN_MISO, PIN_MOSI, PIN_CS);

  sendCommand(CMD_RESET);
  delay(1);
  printHelp();
  startIdacTest();
}

void loop() {
  handleSerialCommand();
  delay(10);
}