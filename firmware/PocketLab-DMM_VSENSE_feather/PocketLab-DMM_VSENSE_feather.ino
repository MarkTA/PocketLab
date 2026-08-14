#include <Arduino.h>
#include <SPI.h>
#include <bluefruit.h>
#include <Adafruit_TinyUSB.h>
#include <Adafruit_NeoPixel.h>

// ============================================================
// PocketLab DMM Rev A - Voltage Breadboard + BLE
// Adafruit nRF52840 Feather + ADS1220
//
// Keeps the existing voltage breadboard measurement path separate
// from the resistance firmware while exposing the same PocketLab BLE
// service used by the mobile app.
// ============================================================

// ============================================================
// POCKETLAB BLE
// ============================================================

constexpr char DEVICE_NAME[]      = "PocketLab";
constexpr char MODEL_NAME[]       = "PocketLab-Base";
constexpr char FIRMWARE_VERSION[] = "0.2.0-V";
constexpr char HARDWARE_VERSION[] = "FEATHER-NRF52840";
constexpr char DEVICE_FEATURES[]  = "DMM";

constexpr char POCKETLAB_SERVICE_UUID[] =
  "8f5b0001-6c4d-4a73-a8f1-3d9ea01c0001";

constexpr char COMMAND_RX_UUID[] =
  "8f5b0002-6c4d-4a73-a8f1-3d9ea01c0001";

constexpr char RESPONSE_TX_UUID[] =
  "8f5b0003-6c4d-4a73-a8f1-3d9ea01c0001";

BLEService pocketLabService(POCKETLAB_SERVICE_UUID);
BLECharacteristic commandRx(COMMAND_RX_UUID);
BLECharacteristic responseTx(RESPONSE_TX_UUID);

// DMM:READ is intentionally deferred out of the BLE write callback because
// averaging 20 conversions at 20 SPS takes about one second. Generic commands
// remain fast and can be answered directly in the callback.
volatile bool dmmReadPending = false;
uint16_t pendingReadConnHandle = BLE_CONN_HANDLE_INVALID;

// ============================================================
// NEOPIXEL STATUS
// ============================================================

Adafruit_NeoPixel pixel(1, PIN_NEOPIXEL, NEO_GRB + NEO_KHZ800);

void setStatus(uint8_t r, uint8_t g, uint8_t b)
{
  pixel.setPixelColor(0, pixel.Color(r, g, b));
  pixel.show();
}

void showBooting()     { setStatus(20, 10, 0); }
void showAdvertising() { setStatus(0, 0, 20); }
void showConnected()   { setStatus(0, 20, 0); }
void showMeasuring()   { setStatus(0, 12, 16); }
void showError()       { setStatus(20, 0, 0); }

// ============================================================
// TEST SELECTION
// ============================================================
//
// Set to 1 for Phase A:
//   12.0 MΩ / 620 kΩ passive divider
//   Internal ADS1220 2.048 V reference
//
// Set to 2 for Phase B:
//   Biased bipolar resistor network
//   External REFP0/REFN0 reference = Feather 3V3
//
constexpr uint8_t TEST_PHASE = 1;

// ============================================================
// FEATHER / ADS1220 PINS
// ============================================================

constexpr uint8_t PIN_CS   = 10;   // Feather D10
constexpr uint8_t PIN_DRDY = 9;    // Feather D9

// SCK, MOSI, and MISO use Feather hardware SPI pins.

// ============================================================
// ADS1220 COMMANDS / SETTINGS
// ============================================================

constexpr uint8_t CMD_RESET      = 0x06;
constexpr uint8_t CMD_START_SYNC = 0x08;
constexpr uint8_t CMD_RDATA      = 0x10;
constexpr uint8_t CMD_RREG_4     = 0x23;
constexpr uint8_t CMD_WREG_4     = 0x43;

constexpr uint32_t SPI_CLOCK_HZ = 1000000;
constexpr uint32_t DRDY_TIMEOUT_MS = 500;

constexpr double ADC_COUNTS = 8388608.0;  // 2^23
constexpr double INTERNAL_VREF = 2.048;

constexpr int SAMPLES_PER_REPORT = 20;

// ============================================================
// CALIBRATION / MEASURED VALUES
// ============================================================

// Phase A
// Keep these synchronized with the known-good breadboard values.
double phaseA_Rhi = 11960000.0;
double phaseA_Rlo =   620000.0;
double phaseA_Vref = INTERNAL_VREF;

// Phase B
double phaseB_Rvin = 12000000.0;
double phaseB_R3v3 =  1240000.0;
double phaseB_Rgnd =  1340000.0;
double phaseB_V3v3 = 3.300000;

// ============================================================
// SPI HELPERS
// ============================================================

SPISettings adsSPI(SPI_CLOCK_HZ, MSBFIRST, SPI_MODE1);

void adsSelect()
{
  SPI.beginTransaction(adsSPI);
  digitalWrite(PIN_CS, LOW);
  delayMicroseconds(2);
}

void adsDeselect()
{
  delayMicroseconds(2);
  digitalWrite(PIN_CS, HIGH);
  SPI.endTransaction();
}

void adsCommand(uint8_t command)
{
  adsSelect();
  SPI.transfer(command);
  adsDeselect();
}

// ============================================================
// ADS1220 REGISTER ACCESS
// ============================================================

void adsWriteRegisters(uint8_t r0,
                       uint8_t r1,
                       uint8_t r2,
                       uint8_t r3)
{
  adsSelect();

  SPI.transfer(CMD_WREG_4);
  SPI.transfer(r0);
  SPI.transfer(r1);
  SPI.transfer(r2);
  SPI.transfer(r3);

  adsDeselect();
}

void adsReadRegisters(uint8_t regs[4])
{
  adsSelect();

  SPI.transfer(CMD_RREG_4);

  for (int i = 0; i < 4; i++)
  {
    regs[i] = SPI.transfer(0x00);
  }

  adsDeselect();
}

// ============================================================
// ADS1220 INITIALIZATION
// ============================================================

bool adsInit()
{
  adsCommand(CMD_RESET);
  delay(1);

  // AIN0-AIN1, gain 1, PGA bypassed
  const uint8_t reg0 = 0x01;

  // 20 SPS, normal mode, continuous conversion
  const uint8_t reg1 = 0x04;

  // Phase A: internal 2.048 V reference
  // Phase B: external REFP0 / REFN0 reference
  const uint8_t reg2 = (TEST_PHASE == 2) ? 0x40 : 0x00;

  // IDAC routing disabled
  const uint8_t reg3 = 0x00;

  adsWriteRegisters(reg0, reg1, reg2, reg3);
  delay(1);

  uint8_t regs[4] = {0, 0, 0, 0};
  adsReadRegisters(regs);

  Serial.println();
  Serial.println("ADS1220 register readback:");
  Serial.print("CONFIG0 = 0x"); Serial.println(regs[0], HEX);
  Serial.print("CONFIG1 = 0x"); Serial.println(regs[1], HEX);
  Serial.print("CONFIG2 = 0x"); Serial.println(regs[2], HEX);
  Serial.print("CONFIG3 = 0x"); Serial.println(regs[3], HEX);

  const bool registersOk =
      regs[0] == reg0 &&
      regs[1] == reg1 &&
      regs[2] == reg2 &&
      regs[3] == reg3;

  if (!registersOk)
  {
    Serial.println("*** REGISTER READBACK FAILED ***");
    return false;
  }

  Serial.println("Register configuration OK.");

  adsCommand(CMD_START_SYNC);
  delay(100);

  return true;
}

// ============================================================
// READ 24-BIT ADC RESULT
// ============================================================

int32_t adsReadRaw()
{
  adsSelect();

  SPI.transfer(CMD_RDATA);

  uint8_t b0 = SPI.transfer(0x00);
  uint8_t b1 = SPI.transfer(0x00);
  uint8_t b2 = SPI.transfer(0x00);

  adsDeselect();

  int32_t code =
      ((int32_t)b0 << 16) |
      ((int32_t)b1 << 8)  |
      b2;

  if (code & 0x00800000)
  {
    code |= 0xFF000000;
  }

  return code;
}

// ============================================================
// CONVERSION FUNCTIONS
// ============================================================

double adcCodeToVolts(int32_t code)
{
  const double vref =
      (TEST_PHASE == 1) ? phaseA_Vref : phaseB_V3v3;

  return ((double)code / ADC_COUNTS) * vref;
}

double phaseA_ReconstructVIN(double vsense)
{
  const double ratio =
      (phaseA_Rhi + phaseA_Rlo) / phaseA_Rlo;

  return vsense * ratio;
}

void phaseB_GetTransfer(double &a, double &b)
{
  const double Gvin = 1.0 / phaseB_Rvin;
  const double G3v3 = 1.0 / phaseB_R3v3;
  const double Ggnd = 1.0 / phaseB_Rgnd;

  const double Gtotal = Gvin + G3v3 + Ggnd;

  a = Gvin / Gtotal;
  b = (phaseB_V3v3 * G3v3) / Gtotal;
}

double phaseB_ReconstructVIN(double vadc)
{
  double a, b;
  phaseB_GetTransfer(a, b);

  return (vadc - b) / a;
}

// ============================================================
// DRDY / MEASUREMENT
// ============================================================

bool waitForDRDY()
{
  const uint32_t start = millis();

  while (digitalRead(PIN_DRDY) == HIGH)
  {
    if ((millis() - start) >= DRDY_TIMEOUT_MS)
    {
      Serial.println("*** DRDY TIMEOUT ***");
      return false;
    }

    delay(1);
  }

  return true;
}

bool takeMeasurement(double &reconstructedVIN)
{
  int64_t sumCode = 0;

  int32_t minCode = INT32_MAX;
  int32_t maxCode = INT32_MIN;

  for (int i = 0; i < SAMPLES_PER_REPORT; i++)
  {
    if (!waitForDRDY())
    {
      return false;
    }

    const int32_t code = adsReadRaw();

    sumCode += code;

    if (code < minCode) minCode = code;
    if (code > maxCode) maxCode = code;
  }

  const double avgCode =
      (double)sumCode / (double)SAMPLES_PER_REPORT;

  const double measuredADC =
      (avgCode / ADC_COUNTS) *
      ((TEST_PHASE == 1) ? phaseA_Vref : phaseB_V3v3);

  const double minV = adcCodeToVolts(minCode);
  const double maxV = adcCodeToVolts(maxCode);

  if (TEST_PHASE == 1)
    reconstructedVIN = phaseA_ReconstructVIN(measuredADC);
  else
    reconstructedVIN = phaseB_ReconstructVIN(measuredADC);

  Serial.println();
  Serial.println("----------------------------------------");

  Serial.print("avg_code       = ");
  Serial.println(avgCode, 1);

  Serial.print("ADC node       = ");
  Serial.print(measuredADC, 6);
  Serial.println(" V");

  Serial.print("span           = ");
  Serial.print((maxV - minV) * 1000000.0, 2);
  Serial.println(" uV");

  Serial.print("VIN reconstructed = ");
  Serial.print(reconstructedVIN, 6);
  Serial.println(" V");

  if (TEST_PHASE == 1)
  {
    const double ratio =
        (phaseA_Rhi + phaseA_Rlo) / phaseA_Rlo;

    Serial.print("divider ratio  = ");
    Serial.print(ratio, 6);
    Serial.println(":1");
  }
  else
  {
    double a, b;
    phaseB_GetTransfer(a, b);

    Serial.print("transfer a     = ");
    Serial.println(a, 9);

    Serial.print("transfer b     = ");
    Serial.print(b, 6);
    Serial.println(" V");

    Serial.print("scale 1/a      = ");
    Serial.println(1.0 / a, 6);
  }

  return isfinite(reconstructedVIN);
}

// ============================================================
// BLE RESPONSES
// ============================================================

void sendBleResponse(uint16_t connHandle, const String &response)
{
  Serial.print("[TX] ");
  Serial.println(response);

  responseTx.write(response.c_str(), response.length());

  if (!responseTx.notifyEnabled(connHandle))
  {
    Serial.println("[BLE] Response stored; notifications not enabled.");
    return;
  }

  if (!responseTx.notify(connHandle, response.c_str(), response.length()))
  {
    Serial.println("[WARN] Notification failed.");
  }
}

void handleDmmRead(uint16_t connHandle)
{
  showMeasuring();

  double vin = 0.0;

  if (!takeMeasurement(vin))
  {
    showError();
    sendBleResponse(connHandle, "ERR DMM_READ_FAILED");
    return;
  }

  String response = "DMM:VALUE ";
  response += String(vin, 6);
  response += ";UNIT=V";

  sendBleResponse(connHandle, response);

  if (Bluefruit.connected())
    showConnected();
  else
    showAdvertising();
}

// ============================================================
// POCKETLAB COMMAND PROCESSING
// ============================================================

void processCommand(uint16_t connHandle, String command)
{
  command.trim();

  Serial.print("[RX] ");
  Serial.println(command);

  if (command.length() == 0)
  {
    sendBleResponse(connHandle, "ERR EMPTY_COMMAND");
    return;
  }

  if (command == "PING")
  {
    sendBleResponse(connHandle, "PONG");
    return;
  }

  if (command == "INFO")
  {
    String response = "INFO MODEL=";
    response += MODEL_NAME;
    response += ";FW=";
    response += FIRMWARE_VERSION;
    response += ";HW=";
    response += HARDWARE_VERSION;

    sendBleResponse(connHandle, response);
    return;
  }

  if (command == "FEATURES")
  {
    String response = "FEATURES ";
    response += DEVICE_FEATURES;

    sendBleResponse(connHandle, response);
    return;
  }

  if (command == "DMM:GET_STATE")
  {
    // This standalone breadboard sketch is physically voltage-only.
    sendBleResponse(
      connHandle,
      "DMM:STATE MODE=VOLTAGE;RANGE=FIXED"
    );
    return;
  }

  if (command == "DMM:READ")
  {
    handleDmmRead(connHandle);
    return;
  }

  sendBleResponse(connHandle, "ERR UNKNOWN_COMMAND");
}

// ============================================================
// BLE CALLBACKS
// ============================================================

void commandWriteCallback(uint16_t connHandle,
                          BLECharacteristic *characteristic,
                          uint8_t *data,
                          uint16_t len)
{
  (void)characteristic;

  String command;
  command.reserve(len);

  for (uint16_t i = 0; i < len; i++)
  {
    command += (char)data[i];
  }

  command.trim();

  if (command == "DMM:READ")
  {
    Serial.print("[RX] ");
    Serial.println(command);

    if (dmmReadPending)
    {
      sendBleResponse(connHandle, "ERR BUSY");
      return;
    }

    pendingReadConnHandle = connHandle;
    dmmReadPending = true;
    return;
  }

  processCommand(connHandle, command);
}

void connectCallback(uint16_t connHandle)
{
  BLEConnection *connection = Bluefruit.Connection(connHandle);

  char centralName[32] = {0};
  connection->getPeerName(centralName, sizeof(centralName));

  Serial.print("[BLE] Connected");

  if (centralName[0] != '\0')
  {
    Serial.print(" to ");
    Serial.print(centralName);
  }

  Serial.println();
  showConnected();
}

void disconnectCallback(uint16_t connHandle, uint8_t reason)
{
  (void)connHandle;

  Serial.print("[BLE] Disconnected, reason=0x");
  Serial.println(reason, HEX);

  dmmReadPending = false;
  pendingReadConnHandle = BLE_CONN_HANDLE_INVALID;

  showAdvertising();
}

// ============================================================
// ADVERTISING
// ============================================================

void startAdvertising()
{
  Bluefruit.Advertising.stop();
  Bluefruit.Advertising.clearData();
  Bluefruit.ScanResponse.clearData();

  Bluefruit.Advertising.addFlags(
    BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE
  );

  Bluefruit.Advertising.addTxPower();
  Bluefruit.Advertising.addService(pocketLabService);
  Bluefruit.ScanResponse.addName();

  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(32, 244);
  Bluefruit.Advertising.setFastTimeout(30);
  Bluefruit.Advertising.start(0);

  Serial.print("[BLE] Advertising as ");
  Serial.println(DEVICE_NAME);

  showAdvertising();
}

// ============================================================
// SETUP
// ============================================================

void setup()
{
  Serial.begin(115200);

  pixel.begin();
  pixel.clear();
  pixel.setBrightness(25);
  showBooting();

  const uint32_t startWait = millis();
  while (!Serial && (millis() - startWait < 3000))
  {
    delay(10);
  }

  Serial.println();
  Serial.println("========================================");
  Serial.println("PocketLab DMM Voltage + BLE");
  Serial.println("========================================");

  Serial.print("Test phase: ");
  Serial.println(TEST_PHASE);

  pinMode(PIN_CS, OUTPUT);
  digitalWrite(PIN_CS, HIGH);
  pinMode(PIN_DRDY, INPUT);

  SPI.begin();

  if (!adsInit())
  {
    showError();
  }

  if (TEST_PHASE == 1)
  {
    Serial.println();
    Serial.println("PHASE A");
    Serial.println("Passive 12.0M / 620k divider test");
    Serial.println("ADS1220 internal 2.048 V reference");
  }
  else
  {
    double a, b;
    phaseB_GetTransfer(a, b);

    Serial.println();
    Serial.println("PHASE B");
    Serial.println("Biased bipolar direct-ADC test");
    Serial.print("External VREF entered as: ");
    Serial.print(phaseB_V3v3, 6);
    Serial.println(" V");

    Serial.print("Expected zero-input VADC: ");
    Serial.print(b, 6);
    Serial.println(" V");

    Serial.print("Expected transfer slope: ");
    Serial.println(a, 9);
  }

  Bluefruit.configPrphBandwidth(BANDWIDTH_MAX);
  Bluefruit.begin(1, 0);

  Bluefruit.setName(DEVICE_NAME);
  Bluefruit.setTxPower(4);

  Bluefruit.Periph.setConnectCallback(connectCallback);
  Bluefruit.Periph.setDisconnectCallback(disconnectCallback);

  pocketLabService.begin();

  commandRx.setProperties(
    CHR_PROPS_READ |
    CHR_PROPS_WRITE |
    CHR_PROPS_WRITE_WO_RESP
  );
  commandRx.setPermission(SECMODE_OPEN, SECMODE_OPEN);
  commandRx.setMaxLen(256);
  commandRx.setWriteCallback(commandWriteCallback);
  commandRx.begin();

  responseTx.setProperties(
    CHR_PROPS_READ |
    CHR_PROPS_NOTIFY
  );
  responseTx.setPermission(SECMODE_OPEN, SECMODE_NO_ACCESS);
  responseTx.setMaxLen(256);
  responseTx.begin();
  responseTx.write("READY");

  startAdvertising();

  Serial.println("[READY] PocketLab BLE + voltage DMM initialized.");
  Serial.println("[READY] DMM mode: VOLTAGE");
}

// ============================================================
// LOOP
// ============================================================

void loop()
{
  if (dmmReadPending)
  {
    const uint16_t connHandle = pendingReadConnHandle;

    dmmReadPending = false;
    pendingReadConnHandle = BLE_CONN_HANDLE_INVALID;

    handleDmmRead(connHandle);
  }

  delay(2);
}