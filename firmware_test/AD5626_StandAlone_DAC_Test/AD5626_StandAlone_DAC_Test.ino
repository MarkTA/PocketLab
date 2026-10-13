#include <Arduino.h>
#include "Ad5626Driver.h"

constexpr uint8_t PIN_AD9833_FSYNC = 5;
constexpr uint8_t PIN_SCLK = 18;
constexpr uint8_t PIN_SDIN = 23;
constexpr uint8_t PIN_DAC_CS = 32;
constexpr uint8_t PIN_DAC_LDAC = 33;

constexpr unsigned long STEP_TIME_MS = 10000;

Ad5626Driver ad5626(
  PIN_DAC_CS,
  PIN_DAC_LDAC,
  PIN_SCLK,
  PIN_SDIN,
  PIN_AD9833_FSYNC
);

const float testVoltages[] = {
  0.000f,
  1.024f,
  2.048f,
  3.072f,
  4.089f
};

constexpr size_t TEST_COUNT =
    sizeof(testVoltages) / sizeof(testVoltages[0]);

size_t currentTest = 0;
unsigned long lastStepTime = 0;


void applyCurrentTest()
{
  float requestedVoltage = testVoltages[currentTest];
  uint16_t code = ad5626.writeVoltage(requestedVoltage);

  Serial.println();
  Serial.println("================================");
  Serial.printf(
    "Test step:        %u of %u\n",
    static_cast<unsigned>(currentTest + 1),
    static_cast<unsigned>(TEST_COUNT)
  );
  Serial.printf("Requested output: %.3f V\n", requestedVoltage);
  Serial.printf("DAC code:         %u / 4095\n", code);
  Serial.printf(
    "Calibrated output: %.4f V\n",
    ad5626.currentVoltage()
  );
  Serial.println("Hold time:        10 seconds");
  Serial.println("================================");
}


void setup()
{
  Serial.begin(115200);
  delay(1000);

  ad5626.begin();

  Serial.println();
  Serial.println("================================");
  Serial.println(" PocketLab AD5626 Driver Test");
  Serial.println("================================");

  currentTest = 0;
  applyCurrentTest();
  lastStepTime = millis();
}


void loop()
{
  if (millis() - lastStepTime >= STEP_TIME_MS)
  {
    lastStepTime = millis();

    currentTest++;

    if (currentTest >= TEST_COUNT)
    {
      currentTest = 0;
      Serial.println();
      Serial.println("Restarting test sequence...");
    }

    applyCurrentTest();
  }
}