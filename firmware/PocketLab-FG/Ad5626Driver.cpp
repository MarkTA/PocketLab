#include "Ad5626Driver.h"

#include <SPI.h>
#include <cmath>

Ad5626Driver::Ad5626Driver(
    int csPin,
    int sclkPin,
    int sdinPin,
    int otherChipSelectPin
)
    : _csPin(csPin),
      _sclkPin(sclkPin),
      _sdinPin(sdinPin),
      _otherChipSelectPin(otherChipSelectPin) {}

void Ad5626Driver::begin() {
    pinMode(_csPin, OUTPUT);
    pinMode(_otherChipSelectPin, OUTPUT);

    digitalWrite(_csPin, HIGH);
    digitalWrite(_otherChipSelectPin, HIGH);

    // The AD9833 initializes the shared ESP32 hardware SPI bus first.
    // Do not call pinMode() or SPI.begin() for SCLK/SDIN here; doing so would
    // detach or reconfigure the bus used by the other device.
    clear();
}

void Ad5626Driver::writeCode(uint16_t code) {
    code = constrain(code, 0, MAX_CODE);

    // The AD9833 shares the hardware SPI bus. Keep it deselected while the
    // AD5626 transaction is active.
    digitalWrite(_otherChipSelectPin, HIGH);

    // LDAC is tied low in hardware, so the DAC output updates automatically
    // when SYNC returns high at the end of this 16-bit transfer.
    // The AD5626 uses SPI mode 3 and consumes the least-significant 12 bits;
    // four leading zeros are followed by D11..D0.
    SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE3));
    digitalWrite(_csPin, LOW);
    delayMicroseconds(1);
    SPI.transfer16(code & 0x0FFFU);
    digitalWrite(_csPin, HIGH);
    delayMicroseconds(1);
    SPI.endTransaction();

    _currentCode = code;
}

uint16_t Ad5626Driver::writeVoltage(float voltage) {
    const uint16_t code = voltageToCode(voltage);
    writeCode(code);
    return code;
}

void Ad5626Driver::clear() {
    writeCode(0);
}

uint16_t Ad5626Driver::currentCode() const {
    return _currentCode;
}

float Ad5626Driver::currentVoltage() const {
    return codeToVoltage(_currentCode);
}

uint16_t Ad5626Driver::voltageToCode(float voltage) {
    if (voltage <= ZERO_SCALE_V) {
        return 0;
    }

    if (voltage >= MEASURED_FULL_SCALE_V) {
        return MAX_CODE;
    }

    const long code = lroundf(
        (voltage - ZERO_SCALE_V) / VOLTS_PER_CODE
    );

    return static_cast<uint16_t>(constrain(code, 0L, 4095L));
}

float Ad5626Driver::codeToVoltage(uint16_t code) {
    code = constrain(code, 0, MAX_CODE);
    return ZERO_SCALE_V + VOLTS_PER_CODE * static_cast<float>(code);
}