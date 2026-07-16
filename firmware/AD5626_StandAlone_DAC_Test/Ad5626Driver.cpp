#include "Ad5626Driver.h"

#include <math.h>

Ad5626Driver::Ad5626Driver(
  uint8_t csPin,
  uint8_t ldacPin,
  uint8_t sclkPin,
  uint8_t sdinPin,
  uint8_t otherChipSelectPin
)
  : _csPin(csPin),
    _ldacPin(ldacPin),
    _sclkPin(sclkPin),
    _sdinPin(sdinPin),
    _otherChipSelectPin(otherChipSelectPin)
{
}


void Ad5626Driver::begin()
{
  pinMode(_csPin, OUTPUT);
  pinMode(_ldacPin, OUTPUT);
  pinMode(_sclkPin, OUTPUT);
  pinMode(_sdinPin, OUTPUT);
  pinMode(_otherChipSelectPin, OUTPUT);

  // Safe inactive bus states
  digitalWrite(_csPin, HIGH);
  digitalWrite(_ldacPin, HIGH);
  digitalWrite(_sclkPin, LOW);
  digitalWrite(_sdinPin, LOW);

  // Keep the AD9833 deselected.
  digitalWrite(_otherChipSelectPin, HIGH);

  clear();
}


void Ad5626Driver::writeCode(uint16_t code)
{
  if (code > MAX_CODE)
  {
    code = MAX_CODE;
  }

  // The AD9833 shares SCLK and SDIN.
  digitalWrite(_otherChipSelectPin, HIGH);

  // LDAC must stay high while data is loaded.
  digitalWrite(_ldacPin, HIGH);

  // Begin with SCLK low.
  digitalWrite(_sclkPin, LOW);
  digitalWrite(_csPin, LOW);
  delayMicroseconds(1);

  // Send exactly 12 bits, MSB first.
  for (int8_t bitIndex = 11; bitIndex >= 0; bitIndex--)
  {
    digitalWrite(_sclkPin, LOW);

    bool bitValue = ((code >> bitIndex) & 0x01) != 0;
    digitalWrite(_sdinPin, bitValue ? HIGH : LOW);

    delayMicroseconds(1);

    // The AD5626 captures SDIN on the rising edge.
    digitalWrite(_sclkPin, HIGH);
    delayMicroseconds(1);
  }

  /*
    Keep SCLK high while CS rises. Raising CS while SCLK
    is low would create an additional shift-register event.
  */
  digitalWrite(_csPin, HIGH);
  delayMicroseconds(1);

  // Return the shared clock to idle low.
  digitalWrite(_sclkPin, LOW);

  pulseLdac();

  _currentCode = code;
}


uint16_t Ad5626Driver::writeVoltage(float voltage)
{
  uint16_t code = voltageToCode(voltage);
  writeCode(code);
  return code;
}


void Ad5626Driver::clear()
{
  writeCode(0);
}


uint16_t Ad5626Driver::currentCode() const
{
  return _currentCode;
}


float Ad5626Driver::currentVoltage() const
{
  return codeToVoltage(_currentCode);
}


uint16_t Ad5626Driver::voltageToCode(float voltage)
{
  if (voltage <= ZERO_SCALE_V)
  {
    return 0;
  }

  if (voltage >= MEASURED_FULL_SCALE_V)
  {
    return MAX_CODE;
  }

  float rawCode =
      (voltage - ZERO_SCALE_V) / VOLTS_PER_CODE;

  long roundedCode = lroundf(rawCode);

  if (roundedCode < 0)
  {
    roundedCode = 0;
  }
  else if (roundedCode > MAX_CODE)
  {
    roundedCode = MAX_CODE;
  }

  return static_cast<uint16_t>(roundedCode);
}


float Ad5626Driver::codeToVoltage(uint16_t code)
{
  if (code > MAX_CODE)
  {
    code = MAX_CODE;
  }

  return ZERO_SCALE_V +
         (VOLTS_PER_CODE * static_cast<float>(code));
}


void Ad5626Driver::pulseLdac()
{
  digitalWrite(_ldacPin, LOW);
  delayMicroseconds(1);
  digitalWrite(_ldacPin, HIGH);
}