#pragma once

#include <Arduino.h>

class Ad5626Driver {
public:
    Ad5626Driver(
        int csPin,
        int sclkPin,
        int sdinPin,
        int otherChipSelectPin
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
    static constexpr float ZERO_SCALE_V = 0.0002f;
    static constexpr float VOLTS_PER_CODE = 0.000998486f;
    static constexpr float MEASURED_FULL_SCALE_V = 4.089f;

private:
    int _sclkPin;
    int _sdinPin;
    int _csPin;
    int _otherChipSelectPin;
    uint16_t _currentCode = 0;
};