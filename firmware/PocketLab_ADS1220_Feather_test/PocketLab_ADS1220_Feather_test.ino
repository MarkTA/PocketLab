#include <Arduino.h>
#include <SPI.h>
#include <math.h>
#include <Adafruit_TinyUSB.h>

// -----------------------------------------------------------------------------
// PocketLab DMM — nRF52840 Feather ADS1220 resistance-divider test
// -----------------------------------------------------------------------------
//
// Wiring:
//
//   Feather 3.3 V / ADS1220 AVDD ---- Rref ----+---- AIN0
//                                              |
//                                              Rx
//                                              |
//   GND / AGND -------------------------------+---- AIN1
//
//   REFP0 ---- same 3.3 V / AVDD rail
//   REFN0 ---- GND / AVSS
//
// ADS1220 digital wiring:
//
//   SCLK       -> Feather SCK
//   DIN        -> Feather MOSI
//   DOUT/DRDY  -> Feather MISO
//   CS         -> Feather D10
//   DRDY       -> Feather D9
//
// This is the same supply-ratiometric 1 MΩ divider topology previously
// proven on the ESP32.
//
// k  = ADC code / 2^23
// Rx = Rref * k / (1 - k)
//
// WARNING:
// Connect only unpowered resistors/components.
// This breadboard circuit is not protected for energized circuits.
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Feather pin assignment
// -----------------------------------------------------------------------------

constexpr int PIN_CS   = 10;
constexpr int PIN_DRDY = 9;

// Feather hardware SPI uses its normal SCK / MOSI / MISO pins.

// -----------------------------------------------------------------------------
// General settings
// -----------------------------------------------------------------------------

constexpr uint32_t SERIAL_BAUD = 115200;
constexpr uint32_t SPI_CLOCK_HZ = 1000000;
constexpr uint32_t DRDY_TIMEOUT_MS = 500;

constexpr double DEFAULT_RREF_OHMS = 1004000.0;
constexpr uint16_t DEFAULT_SAMPLES = 10;
constexpr uint32_t DEFAULT_REPORT_INTERVAL_MS = 500;
constexpr double DEFAULT_ZERO_OFFSET_OHMS = 0.0;

constexpr uint16_t MAX_SAMPLES = 100;
constexpr uint32_t MAX_REPORT_INTERVAL_MS = 60000;
constexpr double MIN_RREF_OHMS = 1.0;
constexpr double MAX_RREF_OHMS = 1.0e9;

// -----------------------------------------------------------------------------
// ADS1220 commands
// -----------------------------------------------------------------------------

constexpr uint8_t CMD_RESET      = 0x06;
constexpr uint8_t CMD_START_SYNC = 0x08;
constexpr uint8_t CMD_POWERDOWN  = 0x02;
constexpr uint8_t CMD_RDATA      = 0x10;

// -----------------------------------------------------------------------------
// ADS1220 register configuration
// -----------------------------------------------------------------------------

// CONFIG0:
// AINP = AIN0
// AINN = AIN1
// gain = 1
// PGA bypassed so AIN1 may sit at ground.
constexpr uint8_t CONFIG0 = 0x01;

// CONFIG1:
// 20 SPS
// normal operating mode
// continuous conversion
constexpr uint8_t CONFIG1 = 0x04;

// CONFIG2:
// external REFP0 / REFN0 reference
// IDAC current sources disabled
constexpr uint8_t CONFIG2 = 0x40;

// CONFIG3:
// both IDAC outputs disconnected
constexpr uint8_t CONFIG3 = 0x00;

constexpr uint8_t EXPECTED_REGS[4] = {
  CONFIG0,
  CONFIG1,
  CONFIG2,
  CONFIG3
};

constexpr int32_t ADC_POSITIVE_FULL_SCALE = 0x7FFFFF;
constexpr int32_t ADC_NEGATIVE_FULL_SCALE = -0x800000;
constexpr double ADC_DENOMINATOR = 8388608.0; // 2^23

SPISettings adsSpiSettings(
  SPI_CLOCK_HZ,
  MSBFIRST,
  SPI_MODE1
);

// -----------------------------------------------------------------------------
// Runtime settings
// -----------------------------------------------------------------------------

double rrefOhms = DEFAULT_RREF_OHMS;
double zeroOffsetOhms = DEFAULT_ZERO_OFFSET_OHMS;

uint16_t samplesPerReport = DEFAULT_SAMPLES;
uint32_t reportIntervalMs = DEFAULT_REPORT_INTERVAL_MS;

bool streamingEnabled = false;
bool adcConfigured = false;

uint32_t lastReportFinishedMs = 0;

String serialCommand;

// -----------------------------------------------------------------------------
// ADS1220 SPI helpers
// -----------------------------------------------------------------------------

void selectAds()
{
  SPI.beginTransaction(adsSpiSettings);

  digitalWrite(PIN_CS, LOW);
  delayMicroseconds(2);
}

void deselectAds()
{
  delayMicroseconds(2);

  digitalWrite(PIN_CS, HIGH);

  SPI.endTransaction();
}

void sendCommand(uint8_t command)
{
  selectAds();

  SPI.transfer(command);

  deselectAds();
}

void writeRegisters(
  const uint8_t* values,
  uint8_t count
)
{
  if (count == 0 || count > 4)
    return;

  // WREG starting at register 0.
  // Low two bits encode count - 1.
  const uint8_t command =
    0x40 | ((count - 1) & 0x03);

  selectAds();

  SPI.transfer(command);

  for (uint8_t i = 0; i < count; ++i)
  {
    SPI.transfer(values[i]);
  }

  deselectAds();
}

void readRegisters(
  uint8_t* values,
  uint8_t count
)
{
  if (count == 0 || count > 4)
    return;

  // RREG starting at register 0.
  const uint8_t command =
    0x20 | ((count - 1) & 0x03);

  selectAds();

  SPI.transfer(command);

  for (uint8_t i = 0; i < count; ++i)
  {
    values[i] = SPI.transfer(0x00);
  }

  deselectAds();
}

// -----------------------------------------------------------------------------
// Register verification
// -----------------------------------------------------------------------------

void printHexByte(uint8_t value)
{
  if (value < 0x10)
    Serial.print('0');

  Serial.print(value, HEX);
}

bool verifyRegisters()
{
  uint8_t actual[4] = {};

  readRegisters(actual, 4);

  bool match = true;

  for (uint8_t i = 0; i < 4; ++i)
  {
    if (actual[i] != EXPECTED_REGS[i])
      match = false;
  }

  Serial.print("Registers: ");

  for (uint8_t i = 0; i < 4; ++i)
  {
    printHexByte(actual[i]);

    if (i < 3)
      Serial.print(' ');
  }

  Serial.print(
    match
      ? "  [PASS] expected "
      : "  [FAIL] expected "
  );

  for (uint8_t i = 0; i < 4; ++i)
  {
    printHexByte(EXPECTED_REGS[i]);

    if (i < 3)
      Serial.print(' ');
  }

  Serial.println();

  return match;
}

// -----------------------------------------------------------------------------
// ADC configuration
// -----------------------------------------------------------------------------

bool configureAdc()
{
  streamingEnabled = false;
  adcConfigured = false;

  Serial.println("Resetting ADS1220...");

  sendCommand(CMD_RESET);

  delay(2);

  Serial.println("Writing configuration registers...");

  writeRegisters(
    EXPECTED_REGS,
    4
  );

  delay(2);

  if (!verifyRegisters())
  {
    Serial.println(
      "STOP: ADS1220 register verification failed."
    );

    Serial.println(
      "Check power, common ground, CS, MISO/MOSI, and SPI mode."
    );

    return false;
  }

  sendCommand(CMD_START_SYNC);

  // One complete 20 SPS conversion plus settling margin.
  delay(60);

  adcConfigured = true;

  lastReportFinishedMs = millis();

  Serial.println(
    "ADS1220 divider mode configured."
  );

  return true;
}

// -----------------------------------------------------------------------------
// Conversion handling
// -----------------------------------------------------------------------------

bool waitForDataReady(uint32_t timeoutMs)
{
  const uint32_t started = millis();

  while (digitalRead(PIN_DRDY) == HIGH)
  {
    if (millis() - started >= timeoutMs)
      return false;

    delay(1);
  }

  return true;
}

int32_t readConversion()
{
  selectAds();

  SPI.transfer(CMD_RDATA);

  const uint32_t msb = SPI.transfer(0x00);
  const uint32_t mid = SPI.transfer(0x00);
  const uint32_t lsb = SPI.transfer(0x00);

  deselectAds();

  uint32_t raw =
    (msb << 16) |
    (mid << 8) |
    lsb;

  // Sign extend 24-bit result.
  if (raw & 0x800000UL)
  {
    raw |= 0xFF000000UL;
  }

  return static_cast<int32_t>(raw);
}

// -----------------------------------------------------------------------------
// Resistance conversion
// -----------------------------------------------------------------------------

bool codeToResistance(
  double code,
  double& resistanceOhms
)
{
  const double ratio =
    code / ADC_DENOMINATOR;

  if (ratio < 0.0 || ratio >= 1.0)
    return false;

  resistanceOhms =
    rrefOhms *
    ratio /
    (1.0 - ratio);

  return isfinite(resistanceOhms);
}

void printResistance(
  double ohms,
  uint8_t decimals = 3
)
{
  const double magnitude = fabs(ohms);

  if (magnitude >= 1.0e6)
  {
    Serial.print(
      ohms / 1.0e6,
      decimals
    );

    Serial.print(" Mohm");
  }
  else if (magnitude >= 1.0e3)
  {
    Serial.print(
      ohms / 1.0e3,
      decimals
    );

    Serial.print(" kohm");
  }
  else
  {
    Serial.print(
      ohms,
      decimals
    );

    Serial.print(" ohm");
  }
}

// -----------------------------------------------------------------------------
// Measurement reporting
// -----------------------------------------------------------------------------

bool reportMeasurement()
{
  if (!adcConfigured)
  {
    Serial.println(
      "ADC is not configured. Send adcreset."
    );

    return false;
  }

  int64_t codeSum = 0;

  int32_t codeMin =
    ADC_POSITIVE_FULL_SCALE;

  int32_t codeMax =
    ADC_NEGATIVE_FULL_SCALE;

  for (
    uint16_t i = 0;
    i < samplesPerReport;
    ++i
  )
  {
    if (!waitForDataReady(DRDY_TIMEOUT_MS))
    {
      Serial.println(
        "TIMEOUT: DRDY stayed high. Check ADS1220 DRDY -> Feather D9."
      );

      return false;
    }

    const int32_t code =
      readConversion();

    codeSum += code;

    if (code < codeMin)
      codeMin = code;

    if (code > codeMax)
      codeMax = code;
  }

  const double averageCode =
    static_cast<double>(codeSum) /
    static_cast<double>(samplesPerReport);

  const double ratio =
    averageCode /
    ADC_DENOMINATOR;

  double rawResistance = NAN;

  const bool valid =
    codeToResistance(
      averageCode,
      rawResistance
    );

  Serial.print("avg_code=");
  Serial.print(averageCode, 1);

  Serial.print("  ratio=");
  Serial.print(
    100.0 * ratio,
    5
  );

  Serial.print("%  ");

  if (!valid)
  {
    Serial.print("Rx=INVALID");
  }
  else
  {
    const double correctedResistance =
      rawResistance -
      zeroOffsetOhms;

    Serial.print("Rx=");
    printResistance(
      correctedResistance
    );

    Serial.print("  raw=");
    printResistance(
      rawResistance
    );

    double minResistance = NAN;
    double maxResistance = NAN;

    if (
      codeToResistance(
        codeMin,
        minResistance
      ) &&
      codeToResistance(
        codeMax,
        maxResistance
      )
    )
    {
      Serial.print("  span=");

      printResistance(
        maxResistance -
        minResistance
      );
    }
  }

  if (
    codeMax >= ADC_POSITIVE_FULL_SCALE - 1000 ||
    ratio >= 0.999
  )
  {
    Serial.print(
      "  [NEAR +FS: open circuit or Rx too high]"
    );
  }
  else if (
    codeMin <= ADC_NEGATIVE_FULL_SCALE + 1000 ||
    ratio < 0.0
  )
  {
    Serial.print(
      "  [NEGATIVE: check AIN0/AIN1 polarity]"
    );
  }

  Serial.println();

  lastReportFinishedMs =
    millis();

  return valid;
}

// -----------------------------------------------------------------------------
// Diagnostic helpers
// -----------------------------------------------------------------------------

void printStatus()
{
  Serial.println();

  Serial.println(
    "Current divider settings:"
  );

  Serial.print("  Rref:       ");
  printResistance(
    rrefOhms,
    6
  );
  Serial.println();

  Serial.print("  zero:       ");
  printResistance(
    zeroOffsetOhms,
    6
  );
  Serial.println();

  Serial.print("  samples:    ");
  Serial.println(
    samplesPerReport
  );

  Serial.print("  interval:   ");
  Serial.print(
    reportIntervalMs
  );
  Serial.println(
    " ms after each report"
  );

  Serial.print("  ADC:        ");
  Serial.println(
    adcConfigured
      ? "configured"
      : "not configured"
  );

  Serial.print("  streaming:  ");
  Serial.println(
    streamingEnabled
      ? "on"
      : "off"
  );

  Serial.println(
    "  registers:  expected 01 04 40 00"
  );

  Serial.println();
}

void printPrediction(double rxOhms)
{
  if (
    !isfinite(rxOhms) ||
    rxOhms < 0.0
  )
  {
    Serial.println(
      "ERROR: predict value must be nonnegative resistance."
    );

    return;
  }

  const double ratio =
    rxOhms /
    (rrefOhms + rxOhms);

  Serial.print("For Rx=");
  printResistance(
    rxOhms,
    6
  );

  Serial.print(" with Rref=");
  printResistance(
    rrefOhms,
    6
  );

  Serial.println(':');

  Serial.print(
    "  expected ratio / ADC full scale: "
  );

  Serial.print(
    100.0 * ratio,
    5
  );

  Serial.println('%');

  Serial.print(
    "  expected divider node: Vexc * "
  );

  Serial.println(
    ratio,
    8
  );

  Serial.print(
    "  at 3.300 V excitation: "
  );

  Serial.print(
    3.3 * ratio,
    6
  );

  Serial.println(" V");
}

// -----------------------------------------------------------------------------
// Serial command interface
// -----------------------------------------------------------------------------

void printHelp()
{
  Serial.println();

  Serial.println(
    "PocketLab nRF52840 ADS1220 resistance divider"
  );

  Serial.println(
    "---------------------------------------------"
  );

  Serial.println(
    "Wiring: 3.3V--Rref--AIN0--Rx--AIN1/GND"
  );

  Serial.println(
    "        REFP0=3.3V, REFN0=GND; IDACs disabled"
  );

  Serial.println();

  Serial.println(
    "Commands:"
  );

  Serial.println(
    "  rref <ohms>       set measured Rref"
  );

  Serial.println(
    "  samples <1..100>  conversions averaged"
  );

  Serial.println(
    "  interval <ms>     post-report pause"
  );

  Serial.println(
    "  zero <ohms>       resistance correction"
  );

  Serial.println(
    "  predict <ohms>    expected ratio/voltage"
  );

  Serial.println(
    "  start             continuous reports"
  );

  Serial.println(
    "  stop              stop reports"
  );

  Serial.println(
    "  once              one averaged report"
  );

  Serial.println(
    "  status            show settings"
  );

  Serial.println(
    "  regs              verify ADS1220 registers"
  );

  Serial.println(
    "  adcreset          reset/reconfigure ADS1220"
  );

  Serial.println(
    "  powerdown         power down ADS1220"
  );

  Serial.println(
    "  defaults          restore defaults"
  );

  Serial.println(
    "  help              show this help"
  );

  Serial.println();

  Serial.println(
    "Typical first test:"
  );

  Serial.println(
    "  once"
  );

  Serial.println();
}

bool splitCommand(
  const String& line,
  String& name,
  String& argument
)
{
  const int separator =
    line.indexOf(' ');

  if (separator < 0)
  {
    name = line;
    argument = "";
  }
  else
  {
    name =
      line.substring(
        0,
        separator
      );

    argument =
      line.substring(
        separator + 1
      );

    argument.trim();
  }

  name.trim();
  name.toLowerCase();

  return name.length() > 0;
}

bool parseDoubleStrict(
  const String& text,
  double& value
)
{
  if (text.length() == 0)
    return false;

  char* end = nullptr;

  value =
    strtod(
      text.c_str(),
      &end
    );

  while (
    end != nullptr &&
    *end == ' '
  )
  {
    ++end;
  }

  return (
    end != text.c_str() &&
    end != nullptr &&
    *end == '\0' &&
    isfinite(value)
  );
}

bool parseUnsignedLongStrict(
  const String& text,
  unsigned long& value
)
{
  if (
    text.length() == 0 ||
    text.charAt(0) == '-'
  )
  {
    return false;
  }

  char* end = nullptr;

  value =
    strtoul(
      text.c_str(),
      &end,
      10
    );

  while (
    end != nullptr &&
    *end == ' '
  )
  {
    ++end;
  }

  return (
    end != text.c_str() &&
    end != nullptr &&
    *end == '\0'
  );
}

void processSerialCommand(
  String line
)
{
  line.trim();

  if (line.length() == 0)
    return;

  String command;
  String argument;

  if (
    !splitCommand(
      line,
      command,
      argument
    )
  )
  {
    return;
  }

  if (command == "rref")
  {
    double value = NAN;

    if (
      !parseDoubleStrict(
        argument,
        value
      ) ||
      value < MIN_RREF_OHMS ||
      value > MAX_RREF_OHMS
    )
    {
      Serial.println(
        "ERROR: use rref <ohms>, from 1 to 1e9."
      );

      return;
    }

    rrefOhms = value;

    Serial.print("Rref set to ");

    printResistance(
      rrefOhms,
      6
    );

    Serial.println();
  }
  else if (command == "samples")
  {
    unsigned long value = 0;

    if (
      !parseUnsignedLongStrict(
        argument,
        value
      ) ||
      value < 1 ||
      value > MAX_SAMPLES
    )
    {
      Serial.println(
        "ERROR: use samples <1..100>."
      );

      return;
    }

    samplesPerReport =
      static_cast<uint16_t>(value);

    Serial.print(
      "Samples per report set to "
    );

    Serial.println(
      samplesPerReport
    );
  }
  else if (command == "interval")
  {
    unsigned long value = 0;

    if (
      !parseUnsignedLongStrict(
        argument,
        value
      ) ||
      value > MAX_REPORT_INTERVAL_MS
    )
    {
      Serial.println(
        "ERROR: use interval <0..60000>."
      );

      return;
    }

    reportIntervalMs =
      static_cast<uint32_t>(value);

    Serial.print(
      "Post-report interval set to "
    );

    Serial.print(
      reportIntervalMs
    );

    Serial.println(" ms");
  }
  else if (command == "zero")
  {
    double value = NAN;

    if (
      !parseDoubleStrict(
        argument,
        value
      ) ||
      fabs(value) > 1.0e9
    )
    {
      Serial.println(
        "ERROR: use zero <ohms>."
      );

      return;
    }

    zeroOffsetOhms = value;

    Serial.print(
      "Zero correction set to "
    );

    printResistance(
      zeroOffsetOhms,
      6
    );

    Serial.println();
  }
  else if (command == "predict")
  {
    double value = NAN;

    if (
      !parseDoubleStrict(
        argument,
        value
      )
    )
    {
      Serial.println(
        "ERROR: use predict <Rx ohms>."
      );

      return;
    }

    printPrediction(value);
  }
  else if (command == "start")
  {
    if (!adcConfigured)
    {
      Serial.println(
        "ADC is not configured. Send adcreset."
      );

      return;
    }

    streamingEnabled = true;

    lastReportFinishedMs =
      millis() -
      reportIntervalMs;

    Serial.println(
      "Continuous reporting started."
    );
  }
  else if (command == "stop")
  {
    streamingEnabled = false;

    Serial.println(
      "Continuous reporting stopped."
    );
  }
  else if (command == "once")
  {
    reportMeasurement();
  }
  else if (command == "status")
  {
    printStatus();
  }
  else if (command == "regs")
  {
    verifyRegisters();
  }
  else if (command == "adcreset")
  {
    configureAdc();
  }
  else if (command == "powerdown")
  {
    sendCommand(
      CMD_POWERDOWN
    );

    streamingEnabled = false;
    adcConfigured = false;

    Serial.println(
      "ADS1220 powered down. Send adcreset to restart."
    );
  }
  else if (command == "defaults")
  {
    rrefOhms =
      DEFAULT_RREF_OHMS;

    zeroOffsetOhms =
      DEFAULT_ZERO_OFFSET_OHMS;

    samplesPerReport =
      DEFAULT_SAMPLES;

    reportIntervalMs =
      DEFAULT_REPORT_INTERVAL_MS;

    Serial.println(
      "Software defaults restored."
    );

    configureAdc();
  }
  else if (
    command == "help" ||
    command == "h"
  )
  {
    printHelp();
  }
  else
  {
    Serial.println(
      "Unknown command. Send help."
    );
  }
}

void handleSerialInput()
{
  while (Serial.available())
  {
    const char incoming =
      static_cast<char>(
        Serial.read()
      );

    if (
      incoming == '\n' ||
      incoming == '\r'
    )
    {
      if (serialCommand.length() > 0)
      {
        processSerialCommand(
          serialCommand
        );

        serialCommand = "";
      }
    }
    else if (
      serialCommand.length() < 95
    )
    {
      serialCommand += incoming;
    }
  }
}

// -----------------------------------------------------------------------------
// Setup / loop
// -----------------------------------------------------------------------------

void setup()
{
  Serial.begin(SERIAL_BAUD);

  // Native USB on the nRF52840:
  // wait for Serial Monitor so startup output isn't missed.
  while (!Serial)
  {
    delay(10);
  }

  Serial.println();
  Serial.println(
    "PocketLab nRF52840 Resistance Test"
  );
  Serial.println(
    "================================="
  );

  pinMode(
    PIN_CS,
    OUTPUT
  );

  digitalWrite(
    PIN_CS,
    HIGH
  );

  pinMode(
    PIN_DRDY,
    INPUT
  );

  // Feather hardware SPI.
  SPI.begin();

  printHelp();

  configureAdc();

  printStatus();

  Serial.println(
    "Ready. Send 'once' for the first measurement."
  );
}

void loop()
{
  handleSerialInput();

  if (
    streamingEnabled &&
    millis() - lastReportFinishedMs >=
      reportIntervalMs
  )
  {
    reportMeasurement();
  }

  delay(2);
}