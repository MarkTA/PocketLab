#include <Arduino.h>
#include <SPI.h>

#include <bluefruit.h>
#include <Adafruit_TinyUSB.h>
#include <Adafruit_NeoPixel.h>

// ============================================================================
// RESISTANCE MEASUREMENT RESULT
// ============================================================================

struct ResistanceMeasurement
{
  bool valid;

  double resistanceOhms;
  double averageCode;
  double ratio;

  int32_t minCode;
  int32_t maxCode;
};

// Explicit prototype prevents Arduino from generating a bad one
ResistanceMeasurement measureResistance();

// ============================================================================
// PocketLab Base + DMM Test Firmware
// nRF52840 Feather + ADS1220
//
// Current implemented DMM mode:
//   RESISTANCE using 1.004 MOhm divider reference
//
// Voltage mode exists in the protocol but measurement hardware is not yet
// configured for it.
// ============================================================================


// ============================================================================
// DEVICE INFORMATION
// ============================================================================

constexpr char DEVICE_NAME[]      = "PocketLab";
constexpr char MODEL_NAME[]       = "PocketLab-Base";
constexpr char FIRMWARE_VERSION[] = "0.2.0";
constexpr char HARDWARE_VERSION[] = "FEATHER-NRF52840";

constexpr char DEVICE_FEATURES[] = "DMM";


// ============================================================================
// POCKETLAB BLE UUIDs
// ============================================================================

constexpr char POCKETLAB_SERVICE_UUID[] =
  "8f5b0001-6c4d-4a73-a8f1-3d9ea01c0001";

constexpr char COMMAND_RX_UUID[] =
  "8f5b0002-6c4d-4a73-a8f1-3d9ea01c0001";

constexpr char RESPONSE_TX_UUID[] =
  "8f5b0003-6c4d-4a73-a8f1-3d9ea01c0001";

BLEService pocketLabService(POCKETLAB_SERVICE_UUID);

BLECharacteristic commandRx(COMMAND_RX_UUID);
BLECharacteristic responseTx(RESPONSE_TX_UUID);


// ============================================================================
// NEOPIXEL STATUS
// ============================================================================

Adafruit_NeoPixel pixel(
  1,
  PIN_NEOPIXEL,
  NEO_GRB + NEO_KHZ800
);

void setStatus(uint8_t r, uint8_t g, uint8_t b)
{
  pixel.setPixelColor(
    0,
    pixel.Color(r, g, b)
  );

  pixel.show();
}

void showBooting()
{
  setStatus(20, 10, 0);   // yellow
}

void showAdvertising()
{
  setStatus(0, 0, 20);    // blue
}

void showConnected()
{
  setStatus(0, 20, 0);    // green
}

void showMeasuring()
{
  setStatus(0, 12, 16);   // cyan-ish
}

void showError()
{
  setStatus(20, 0, 0);    // red
}


// ============================================================================
// ADS1220 HARDWARE
// ============================================================================

constexpr uint8_t PIN_ADS_CS   = 10;
constexpr uint8_t PIN_ADS_DRDY = 9;

constexpr uint32_t SPI_CLOCK_HZ = 1000000;

SPISettings adsSpi(
  SPI_CLOCK_HZ,
  MSBFIRST,
  SPI_MODE1
);


// ============================================================================
// ADS1220 COMMANDS
// ============================================================================

constexpr uint8_t ADS_CMD_RESET = 0x06;
constexpr uint8_t ADS_CMD_START = 0x08;
constexpr uint8_t ADS_CMD_RDATA = 0x10;


// ============================================================================
// ADS1220 CONFIGURATION
//
// CONFIG0 = 0x01
//   AIN0 - AIN1
//   gain = 1
//   PGA bypassed
//
// CONFIG1 = 0x04
//   20 SPS
//   continuous conversion
//
// CONFIG2 = 0x40
//   external REFP0 / REFN0
//   IDAC disabled
//
// CONFIG3 = 0x00
//   IDAC routing disabled
// ============================================================================

constexpr uint8_t ADS_CONFIG[4] = {
  0x01,
  0x04,
  0x40,
  0x00
};


// ============================================================================
// RESISTANCE CONFIGURATION
// ============================================================================

// Measured with Fluke:
constexpr double RREF_OHMS = 1004000.0;

// Number of ADC conversions averaged per DMM:READ.
constexpr uint16_t RESISTANCE_SAMPLE_COUNT = 10;

constexpr uint32_t DRDY_TIMEOUT_MS = 500;

constexpr double ADC_DENOMINATOR = 8388608.0; // 2^23


// ============================================================================
// DMM STATE
// ============================================================================

enum class DmmMode
{
  RESISTANCE,
  VOLTAGE
};

DmmMode currentMode = DmmMode::RESISTANCE;

bool adsReady = false;

// ============================================================================
// ADS1220 SPI HELPERS
// ============================================================================

void adsSelect()
{
  SPI.beginTransaction(adsSpi);

  digitalWrite(
    PIN_ADS_CS,
    LOW
  );

  delayMicroseconds(2);
}

void adsDeselect()
{
  delayMicroseconds(2);

  digitalWrite(
    PIN_ADS_CS,
    HIGH
  );

  SPI.endTransaction();
}

void adsSendCommand(uint8_t command)
{
  adsSelect();

  SPI.transfer(command);

  adsDeselect();
}

void adsWriteRegisters(
  const uint8_t* values,
  uint8_t count
)
{
  if (count == 0 || count > 4)
    return;

  // WREG starting at register 0.
  const uint8_t command =
    0x40 | ((count - 1) & 0x03);

  adsSelect();

  SPI.transfer(command);

  for (uint8_t i = 0; i < count; i++)
  {
    SPI.transfer(values[i]);
  }

  adsDeselect();
}

void adsReadRegisters(
  uint8_t* values,
  uint8_t count
)
{
  if (count == 0 || count > 4)
    return;

  // RREG starting at register 0.
  const uint8_t command =
    0x20 | ((count - 1) & 0x03);

  adsSelect();

  SPI.transfer(command);

  for (uint8_t i = 0; i < count; i++)
  {
    values[i] = SPI.transfer(0x00);
  }

  adsDeselect();
}


// ============================================================================
// ADS1220 REGISTER VERIFICATION
// ============================================================================

void printHexByte(uint8_t value)
{
  if (value < 0x10)
    Serial.print('0');

  Serial.print(
    value,
    HEX
  );
}

bool verifyAdsRegisters()
{
  uint8_t actual[4] = {};

  adsReadRegisters(
    actual,
    4
  );

  bool match = true;

  Serial.print("[ADS1220] Registers: ");

  for (uint8_t i = 0; i < 4; i++)
  {
    printHexByte(actual[i]);

    if (i < 3)
      Serial.print(' ');

    if (actual[i] != ADS_CONFIG[i])
      match = false;
  }

  if (match)
  {
    Serial.println(" [PASS]");
  }
  else
  {
    Serial.print(" [FAIL] expected ");

    for (uint8_t i = 0; i < 4; i++)
    {
      printHexByte(ADS_CONFIG[i]);

      if (i < 3)
        Serial.print(' ');
    }

    Serial.println();
  }

  return match;
}


// ============================================================================
// ADS1220 SETUP
// ============================================================================

bool configureAds1220()
{
  adsReady = false;

  Serial.println("[ADS1220] Resetting...");

  adsSendCommand(
    ADS_CMD_RESET
  );

  delay(5);

  Serial.println(
    "[ADS1220] Writing resistance configuration..."
  );

  adsWriteRegisters(
    ADS_CONFIG,
    4
  );

  delay(5);

  if (!verifyAdsRegisters())
  {
    Serial.println(
      "[ADS1220] Configuration verification failed."
    );

    showError();

    return false;
  }

  adsSendCommand(
    ADS_CMD_START
  );

  // Allow one conversion to complete at 20 SPS.
  delay(60);

  adsReady = true;

  Serial.println(
    "[ADS1220] Resistance mode ready."
  );

  return true;
}


// ============================================================================
// ADS1220 CONVERSION
// ============================================================================

bool waitForAdsDataReady()
{
  const uint32_t startMs =
    millis();

  while (
    digitalRead(PIN_ADS_DRDY) == HIGH
  )
  {
    if (
      millis() - startMs >
      DRDY_TIMEOUT_MS
    )
    {
      return false;
    }

    delay(1);
  }

  return true;
}

int32_t readAdsConversion()
{
  adsSelect();

  SPI.transfer(
    ADS_CMD_RDATA
  );

  uint32_t raw =
    static_cast<uint32_t>(
      SPI.transfer(0x00)
    ) << 16;

  raw |=
    static_cast<uint32_t>(
      SPI.transfer(0x00)
    ) << 8;

  raw |=
    static_cast<uint32_t>(
      SPI.transfer(0x00)
    );

  adsDeselect();

  // Sign extend 24-bit ADC value.
  if (raw & 0x800000UL)
  {
    raw |= 0xFF000000UL;
  }

  return static_cast<int32_t>(
    raw
  );
}




// ============================================================================
// RESISTANCE MEASUREMENT
// ============================================================================

ResistanceMeasurement measureResistance()
{
  ResistanceMeasurement result {};

  result.valid = false;

  if (!adsReady)
  {
    Serial.println(
      "[DMM] ADS1220 is not ready."
    );

    return result;
  }

  showMeasuring();

  int64_t codeSum = 0;

  int32_t minCode = 0x7FFFFF;
  int32_t maxCode = -0x800000;

  for (
    uint16_t sample = 0;
    sample < RESISTANCE_SAMPLE_COUNT;
    sample++
  )
  {
    if (!waitForAdsDataReady())
    {
      Serial.println(
        "[DMM] DRDY timeout."
      );

      showError();

      return result;
    }

    const int32_t code =
      readAdsConversion();

    codeSum += code;

    if (code < minCode)
      minCode = code;

    if (code > maxCode)
      maxCode = code;
  }

  const double averageCode =
    static_cast<double>(codeSum) /
    RESISTANCE_SAMPLE_COUNT;

  const double ratio =
    averageCode /
    ADC_DENOMINATOR;

  if (
    ratio < 0.0 ||
    ratio >= 1.0
  )
  {
    Serial.println(
      "[DMM] Invalid ADC ratio."
    );

    showError();

    return result;
  }

  const double resistance =
    RREF_OHMS *
    ratio /
    (1.0 - ratio);

  if (!isfinite(resistance))
  {
    Serial.println(
      "[DMM] Invalid resistance result."
    );

    showError();

    return result;
  }

  result.valid = true;
  result.resistanceOhms = resistance;
  result.averageCode = averageCode;
  result.ratio = ratio;
  result.minCode = minCode;
  result.maxCode = maxCode;

  // Return to normal connected state.
  if (Bluefruit.connected())
    showConnected();
  else
    showAdvertising();

  return result;
}


// ============================================================================
// BLE RESPONSE HANDLER
// ============================================================================

void sendBleResponse(
  uint16_t connHandle,
  const String& response
)
{
  Serial.print("[TX] ");
  Serial.println(response);

  // Store the latest value so the characteristic remains readable.
  responseTx.write(
    response.c_str(),
    response.length()
  );

  if (
    !responseTx.notifyEnabled(
      connHandle
    )
  )
  {
    Serial.println(
      "[BLE] Response stored; notifications not enabled."
    );

    return;
  }

  const bool success =
    responseTx.notify(
      connHandle,
      response.c_str(),
      response.length()
    );

  if (!success)
  {
    Serial.println(
      "[WARN] Notification failed."
    );
  }
}


// ============================================================================
// DMM PROTOCOL
// ============================================================================

String getModeName()
{
  switch (currentMode)
  {
    case DmmMode::RESISTANCE:
      return "RESISTANCE";

    case DmmMode::VOLTAGE:
      return "VOLTAGE";
  }

  return "UNKNOWN";
}

void sendDmmState(
  uint16_t connHandle
)
{
  String response =
    "DMM:STATE MODE=";

  response += getModeName();

  response +=
    ";RANGE=AUTO";

  if (
    currentMode ==
    DmmMode::RESISTANCE
  )
  {
    response +=
      ";RREF=";

    response +=
      String(
        RREF_OHMS,
        0
      );
  }

  sendBleResponse(
    connHandle,
    response
  );
}

void handleDmmRead(
  uint16_t connHandle
)
{
  if (
    currentMode ==
    DmmMode::VOLTAGE
  )
  {
    sendBleResponse(
      connHandle,
      "ERR MODE_NOT_READY"
    );

    return;
  }

  const ResistanceMeasurement measurement =
    measureResistance();

  if (!measurement.valid)
  {
    sendBleResponse(
      connHandle,
      "ERR DMM_READ_FAILED"
    );

    return;
  }

  // Main app-facing response.
  //
  // Example:
  //
  // DMM:VALUE 464393.120;UNIT=OHM
  //
  String response =
    "DMM:VALUE ";

  response +=
    String(
      measurement.resistanceOhms,
      3
    );

  response +=
    ";UNIT=OHM";

  sendBleResponse(
    connHandle,
    response
  );

  // Serial-only diagnostics.
  Serial.print("[DMM] avg_code=");
  Serial.print(
    measurement.averageCode,
    1
  );

  Serial.print(" ratio=");
  Serial.print(
    measurement.ratio * 100.0,
    5
  );

  Serial.print("% resistance=");
  Serial.print(
    measurement.resistanceOhms,
    3
  );

  Serial.println(" ohm");
}


// ============================================================================
// COMMAND PROCESSING
// ============================================================================

void processCommand(
  uint16_t connHandle,
  String command
)
{
  command.trim();

  Serial.print("[RX] ");
  Serial.println(command);

  if (command.length() == 0)
  {
    sendBleResponse(
      connHandle,
      "ERR EMPTY_COMMAND"
    );

    return;
  }

  // --------------------------------------------------------------------------
  // Generic PocketLab commands
  // --------------------------------------------------------------------------

  if (command == "PING")
  {
    sendBleResponse(
      connHandle,
      "PONG"
    );

    return;
  }

  if (command == "INFO")
  {
    String response =
      "INFO MODEL=";

    response += MODEL_NAME;

    response +=
      ";FW=";

    response +=
      FIRMWARE_VERSION;

    response +=
      ";HW=";

    response +=
      HARDWARE_VERSION;

    sendBleResponse(
      connHandle,
      response
    );

    return;
  }

  if (command == "FEATURES")
  {
    String response =
      "FEATURES ";

    response +=
      DEVICE_FEATURES;

    sendBleResponse(
      connHandle,
      response
    );

    return;
  }

  // --------------------------------------------------------------------------
  // DMM commands
  // --------------------------------------------------------------------------

  if (command == "DMM:GET_STATE")
  {
    sendDmmState(
      connHandle
    );

    return;
  }

  if (
    command ==
    "DMM:SET_MODE RESISTANCE"
  )
  {
    currentMode =
      DmmMode::RESISTANCE;

    // Make sure resistance-mode ADC config is active.
    if (!configureAds1220())
    {
      sendBleResponse(
        connHandle,
        "ERR ADC_CONFIG_FAILED"
      );

      return;
    }

    sendBleResponse(
      connHandle,
      "OK"
    );

    return;
  }

  if (
    command ==
    "DMM:SET_MODE VOLTAGE"
  )
  {
    currentMode =
      DmmMode::VOLTAGE;

    sendBleResponse(
      connHandle,
      "OK"
    );

    return;
  }

  if (command == "DMM:READ")
  {
    handleDmmRead(
      connHandle
    );

    return;
  }

  // --------------------------------------------------------------------------
  // Unknown command
  // --------------------------------------------------------------------------

  sendBleResponse(
    connHandle,
    "ERR UNKNOWN_COMMAND"
  );
}


// ============================================================================
// BLE WRITE CALLBACK
// ============================================================================

void commandWriteCallback(
  uint16_t connHandle,
  BLECharacteristic* characteristic,
  uint8_t* data,
  uint16_t len
)
{
  (void) characteristic;

  String command;

  command.reserve(len);

  for (
    uint16_t i = 0;
    i < len;
    i++
  )
  {
    command +=
      static_cast<char>(
        data[i]
      );
  }

  processCommand(
    connHandle,
    command
  );
}


// ============================================================================
// BLE CONNECTION CALLBACKS
// ============================================================================

void connectCallback(
  uint16_t connHandle
)
{
  BLEConnection* connection =
    Bluefruit.Connection(
      connHandle
    );

  char centralName[32] = {0};

  connection->getPeerName(
    centralName,
    sizeof(centralName)
  );

  Serial.print(
    "[BLE] Connected"
  );

  if (
    centralName[0] != '\0'
  )
  {
    Serial.print(" to ");
    Serial.print(
      centralName
    );
  }

  Serial.println();

  showConnected();
}

void disconnectCallback(
  uint16_t connHandle,
  uint8_t reason
)
{
  (void) connHandle;

  Serial.print(
    "[BLE] Disconnected, reason=0x"
  );

  Serial.println(
    reason,
    HEX
  );

  showAdvertising();
}


// ============================================================================
// BLE ADVERTISING
// ============================================================================

void startAdvertising()
{
  Bluefruit.Advertising.stop();

  Bluefruit.Advertising.clearData();
  Bluefruit.ScanResponse.clearData();

  Bluefruit.Advertising.addFlags(
    BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE
  );

  Bluefruit.Advertising.addTxPower();

  Bluefruit.Advertising.addService(
    pocketLabService
  );

  Bluefruit.ScanResponse.addName();

  Bluefruit.Advertising.restartOnDisconnect(
    true
  );

  Bluefruit.Advertising.setInterval(
    32,
    244
  );

  Bluefruit.Advertising.setFastTimeout(
    30
  );

  Bluefruit.Advertising.start(
    0
  );

  Serial.print(
    "[BLE] Advertising as "
  );

  Serial.println(
    DEVICE_NAME
  );

  showAdvertising();
}


// ============================================================================
// SETUP
// ============================================================================

void setup()
{
  Serial.begin(115200);

  pixel.begin();
  pixel.clear();
  pixel.setBrightness(25);

  showBooting();

  // Give USB a moment to enumerate, but do not block forever:
  // we want PocketLab to operate normally when no PC is attached.
  const uint32_t serialWaitStart =
    millis();

  while (
    !Serial &&
    millis() - serialWaitStart < 3000
  )
  {
    delay(10);
  }

  Serial.println();
  Serial.println(
    "PocketLab Base + DMM"
  );

  Serial.println(
    "===================="
  );

  // --------------------------------------------------------------------------
  // ADS1220 setup
  // --------------------------------------------------------------------------

  pinMode(
    PIN_ADS_CS,
    OUTPUT
  );

  digitalWrite(
    PIN_ADS_CS,
    HIGH
  );

  pinMode(
    PIN_ADS_DRDY,
    INPUT
  );

  SPI.begin();

  configureAds1220();

  // --------------------------------------------------------------------------
  // BLE setup
  // --------------------------------------------------------------------------

  // Must be configured before Bluefruit.begin().
  Bluefruit.configPrphBandwidth(
    BANDWIDTH_MAX
  );

  Bluefruit.begin(
    1,
    0
  );

  Bluefruit.setName(
    DEVICE_NAME
  );

  Bluefruit.setTxPower(
    4
  );

  Bluefruit.Periph.setConnectCallback(
    connectCallback
  );

  Bluefruit.Periph.setDisconnectCallback(
    disconnectCallback
  );

  // --------------------------------------------------------------------------
  // PocketLab BLE service
  // --------------------------------------------------------------------------

  pocketLabService.begin();

  // App -> PocketLab
  commandRx.setProperties(
    CHR_PROPS_READ |
    CHR_PROPS_WRITE |
    CHR_PROPS_WRITE_WO_RESP
  );

  commandRx.setPermission(
    SECMODE_OPEN,
    SECMODE_OPEN
  );

  commandRx.setMaxLen(
    256
  );

  commandRx.setWriteCallback(
    commandWriteCallback
  );

  commandRx.begin();

  // PocketLab -> app
  responseTx.setProperties(
    CHR_PROPS_READ |
    CHR_PROPS_NOTIFY
  );

  responseTx.setPermission(
    SECMODE_OPEN,
    SECMODE_NO_ACCESS
  );

  responseTx.setMaxLen(
    256
  );

  responseTx.begin();

  responseTx.write(
    "READY"
  );

  startAdvertising();

  Serial.println(
    "[READY] PocketLab BLE + DMM initialized."
  );

  Serial.println(
    "[READY] Default DMM mode: RESISTANCE"
  );

  Serial.print(
    "[READY] Rref = "
  );

  Serial.print(
    RREF_OHMS,
    0
  );

  Serial.println(
    " ohm"
  );
}


// ============================================================================
// LOOP
// ============================================================================

void loop()
{
  // BLE work is callback-driven.
  // DMM measurements are currently requested one-shot via DMM:READ.

  delay(5);
}
