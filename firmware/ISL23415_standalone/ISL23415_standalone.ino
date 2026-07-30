#include <Arduino.h>
#include <SPI.h>

// Standalone ISL23415 test
constexpr int POT_SCK_PIN  = 14;
constexpr int POT_SDI_PIN  = 13;
constexpr int POT_CS_PIN   = 27;

// SDO is not needed for this write-only test.
constexpr int POT_SDO_PIN = -1;

constexpr uint32_t SPI_FREQUENCY_HZ = 1000000;

// ISL23415:
// I2:I0 = 110  -> register write
// R4:R0 = 00000 -> wiper register, address 0
constexpr uint8_t WRITE_WIPER_COMMAND = 0xC0;

SPIClass potSPI(HSPI);

const uint8_t testPositions[] = {
  0,
  64,
  128,
  192,
  255
};

constexpr size_t TEST_POSITION_COUNT =
    sizeof(testPositions) / sizeof(testPositions[0]);

constexpr unsigned long HOLD_TIME_MS = 5000;

void setWiper(uint8_t position)
{
  potSPI.beginTransaction(
      SPISettings(SPI_FREQUENCY_HZ, MSBFIRST, SPI_MODE0));

  digitalWrite(POT_CS_PIN, LOW);

  potSPI.transfer(WRITE_WIPER_COMMAND);
  potSPI.transfer(position);

  // The write executes when CS rises.
  digitalWrite(POT_CS_PIN, HIGH);

  potSPI.endTransaction();
}

void printExpectedVoltage(uint8_t position)
{
  // RH = 3.3 V and RL = 0 V
  const float expectedVoltage =
      3.3f * static_cast<float>(position) / 255.0f;

  Serial.print("Wiper position: ");
  Serial.print(position);
  Serial.print(" / 255");
  Serial.print("   Expected RW: approximately ");
  Serial.print(expectedVoltage, 3);
  Serial.println(" V");
}

void setup()
{
  Serial.begin(115200);
  delay(1000);

  // Keep CS inactive before initializing SPI.
  pinMode(POT_CS_PIN, OUTPUT);
  digitalWrite(POT_CS_PIN, HIGH);

  potSPI.begin(
      POT_SCK_PIN,
      POT_SDO_PIN,
      POT_SDI_PIN,
      POT_CS_PIN);

  delay(100);

  // Move away from the chip's power-on midscale setting.
  setWiper(0);

  Serial.println();
  Serial.println("ISL23415 standalone wiper test");
  Serial.println("RH = 3.3 V, RL = 0 V");
  Serial.println("Each position will be held for 5 seconds.");
  Serial.println();
}

void loop()
{
  for (size_t i = 0; i < TEST_POSITION_COUNT; i++) {
    const uint8_t position = testPositions[i];

    setWiper(position);
    delay(20);  // Allow the wiper and meter reading to settle.

    printExpectedVoltage(position);
    delay(HOLD_TIME_MS);
  }

  Serial.println("--- Repeating test sequence ---");
  Serial.println();
}