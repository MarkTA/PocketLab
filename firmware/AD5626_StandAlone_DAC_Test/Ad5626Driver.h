#pragma once

#include <Arduino.h>

class Ad5626Driver
{
public:
  Ad5626Driver(
    uint8_t csPin,
    uint8_t ldacPin,
    uint8_t sclkPin,
    uint8_t sdinPin,
    uint8_t otherChipSelectPin
  );

  void begin();

  void writeCode(uint16_t code);
  uint16_t writeVoltage(float voltage);
  void clear();

  uint16_t currentCode() const;
  float currentVoltage() const;

  static uint16_t voltageToCode(float voltage);
  static float codeToVoltage(uint16_t code);

  static constexpr uint16_t MAX_CODE = 4095;

  // Measured PocketLab AD5626 calibration
  static constexpr float ZERO_SCALE_V = 0.0002f;
  static constexpr float VOLTS_PER_CODE = 0.000998486f;
  static constexpr float MEASURED_FULL_SCALE_V = 4.089f;

private:
  uint8_t _csPin;
  uint8_t _ldacPin;
  uint8_t _sclkPin;
  uint8_t _sdinPin;
  uint8_t _otherChipSelectPin;

  uint16_t _currentCode = 0;

  void pulseLdac();
};