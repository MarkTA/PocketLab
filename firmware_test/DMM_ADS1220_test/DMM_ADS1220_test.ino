/*
  PocketLab DMM — ESP32 + ADS1220 SPI Communication Test

  Wiring:
    ADS1220 SCLK  -> ESP32 GPIO18
    ADS1220 MOSI  -> ESP32 GPIO23
    ADS1220 MISO  -> ESP32 GPIO19
    ADS1220 CS    -> ESP32 GPIO27
    ADS1220 DRDY  -> ESP32 GPIO26
    ADS1220 AVDD  -> ESP32 3V3
    ADS1220 AGND  -> ESP32 GND
    ADS1220 CLK   -> ADS1220 DGND

  Leave AIN0-AIN3, REFP0, and REFN0 disconnected for this test.
*/

#include <SPI.h>

constexpr uint8_t PIN_ADS1220_SCLK = 18;
constexpr uint8_t PIN_ADS1220_MISO = 19;
constexpr uint8_t PIN_ADS1220_MOSI = 23;
constexpr uint8_t PIN_ADS1220_CS   = 27;
constexpr uint8_t PIN_ADS1220_DRDY = 26;

constexpr uint32_t SERIAL_BAUD = 115200;
constexpr uint32_t SPI_CLOCK_HZ = 1000000;

constexpr uint8_t CMD_RESET = 0x06;
constexpr uint8_t CMD_RREG  = 0x20;
constexpr uint8_t CMD_WREG  = 0x40;

SPISettings ads1220SpiSettings(SPI_CLOCK_HZ, MSBFIRST, SPI_MODE1);

void selectAds1220() {
  digitalWrite(PIN_ADS1220_CS, LOW);
}

void deselectAds1220() {
  digitalWrite(PIN_ADS1220_CS, HIGH);
}

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
  const uint8_t command =
      CMD_RREG | ((address & 0x03) << 2);  // Read one register.

  SPI.beginTransaction(ads1220SpiSettings);
  selectAds1220();
  SPI.transfer(command);
  const uint8_t value = SPI.transfer(0x00);
  deselectAds1220();
  SPI.endTransaction();

  return value;
}

void writeRegister(uint8_t address, uint8_t value) {
  const uint8_t command =
      CMD_WREG | ((address & 0x03) << 2);  // Write one register.

  SPI.beginTransaction(ads1220SpiSettings);
  selectAds1220();
  SPI.transfer(command);
  SPI.transfer(value);
  deselectAds1220();
  SPI.endTransaction();

  delayMicroseconds(10);
}

void printHexByte(uint8_t value) {
  if (value < 0x10) {
    Serial.print('0');
  }
  Serial.print(value, HEX);
}

void printRegisters() {
  for (uint8_t address = 0; address < 4; address++) {
    Serial.print("CONFIG");
    Serial.print(address);
    Serial.print(" = 0x");
    printHexByte(readRegister(address));
    Serial.println();
  }
}

void setup() {
  pinMode(PIN_ADS1220_CS, OUTPUT);
  deselectAds1220();
  pinMode(PIN_ADS1220_DRDY, INPUT);

  Serial.begin(SERIAL_BAUD);
  delay(1500);

  SPI.begin(
      PIN_ADS1220_SCLK,
      PIN_ADS1220_MISO,
      PIN_ADS1220_MOSI,
      PIN_ADS1220_CS);

  Serial.println();
  Serial.println("PocketLab DMM");
  Serial.println("ESP32 + ADS1220 SPI communication test");
  Serial.println();

  Serial.println("1. Resetting ADS1220...");
  resetAds1220();

  Serial.println("2. Registers after reset (expected: all 0x00):");
  printRegisters();
  Serial.println();

  // CONFIG1 bit 2 selects continuous-conversion mode. This is harmless for
  // the communication test and gives us a nonzero value to verify over MISO.
  constexpr uint8_t TEST_VALUE = 0x04;

  Serial.println("3. Writing 0x04 to CONFIG1...");
  writeRegister(1, TEST_VALUE);

  const uint8_t readback = readRegister(1);
  Serial.print("4. CONFIG1 readback = 0x");
  printHexByte(readback);
  Serial.println();

  if (readback == TEST_VALUE) {
    Serial.println("PASS: ADS1220 SPI read/write communication works.");
  } else {
    Serial.println("FAIL: CONFIG1 did not read back as 0x04.");
    Serial.println("Check CS, SCLK, MOSI, MISO, power, and ground wiring.");
  }

  Serial.println();
  Serial.println("5. Resetting ADS1220 to restore default configuration...");
  resetAds1220();
  Serial.println("Test complete.");
}

void loop() {
  // One-time communication test; no repeated register writes.
}
