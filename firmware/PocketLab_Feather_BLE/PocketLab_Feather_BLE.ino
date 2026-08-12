#include <bluefruit.h>
#include <Adafruit_TinyUSB.h>
#include <Adafruit_NeoPixel.h>

// -----------------------------------------------------------------------------
// PocketLab device information
// -----------------------------------------------------------------------------

constexpr char DEVICE_NAME[]      = "PocketLab";
constexpr char MODEL_NAME[]       = "PocketLab-Base";
constexpr char FIRMWARE_VERSION[] = "0.1.0";
constexpr char HARDWARE_VERSION[] = "FEATHER-NRF52840";
constexpr char DEVICE_FEATURES[] = "DMM";

// -----------------------------------------------------------------------------
// Existing PocketLab BLE UUIDs
// Must match the React Native app and ESP32 firmware exactly.
// -----------------------------------------------------------------------------

constexpr char POCKETLAB_SERVICE_UUID[] =
    "8f5b0001-6c4d-4a73-a8f1-3d9ea01c0001";

constexpr char COMMAND_RX_UUID[] =
    "8f5b0002-6c4d-4a73-a8f1-3d9ea01c0001";

constexpr char RESPONSE_TX_UUID[] =
    "8f5b0003-6c4d-4a73-a8f1-3d9ea01c0001";

// -----------------------------------------------------------------------------
// BLE service + characteristics
// -----------------------------------------------------------------------------

BLEService pocketLabService(POCKETLAB_SERVICE_UUID);

BLECharacteristic commandRx(COMMAND_RX_UUID);
BLECharacteristic responseTx(RESPONSE_TX_UUID);

// -----------------------------------------------------------------------------
// NeoPixel status
// -----------------------------------------------------------------------------

Adafruit_NeoPixel pixel(
    1,
    PIN_NEOPIXEL,
    NEO_GRB + NEO_KHZ800
);

void setStatus(uint8_t r, uint8_t g, uint8_t b)
{
    pixel.setPixelColor(0, pixel.Color(r, g, b));
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

void showError()
{
    setStatus(20, 0, 0);    // red
}

// -----------------------------------------------------------------------------
// Response handling
// -----------------------------------------------------------------------------

void sendResponse(uint16_t connHandle, const String& response)
{
    Serial.print("[TX] ");
    Serial.println(response);

    // Save latest response so the characteristic is also readable.
    responseTx.write(
        response.c_str(),
        response.length()
    );

    if (!responseTx.notifyEnabled(connHandle))
    {
        Serial.println("[BLE] Response stored, but notifications are not enabled");
        return;
    }

    bool success = responseTx.notify(
        connHandle,
        response.c_str(),
        response.length()
    );

    if (!success)
    {
        Serial.println("[WARN] Notification failed");
        showError();
    }
}

// -----------------------------------------------------------------------------
// PocketLab command parser
// -----------------------------------------------------------------------------

void processCommand(uint16_t connHandle, String command)
{
    command.trim();

    Serial.print("[RX] ");
    Serial.println(command);

    if (command.length() == 0)
    {
        sendResponse(connHandle, "ERR EMPTY_COMMAND");
        return;
    }

    if (command == "PING")
    {
        sendResponse(connHandle, "PONG");
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

        sendResponse(connHandle, response);
        return;
    }

    if (command == "FEATURES")
    {
        String response = "FEATURES ";
        response += DEVICE_FEATURES;

        sendResponse(connHandle, response);
        return;
    }

    // /*
    //  * Temporary compatibility response for the existing
    //  * function-generator protocol.
    //  *
    //  * This is not controlling hardware yet.
    //  */
    // if (command == "GET_STATE")
    // {
    //     sendResponse(
    //         connHandle,
    //         "STATE FREQ=0;AMP=0.00;OFFSET=0.00;WAVE=DC;OUTPUT=OFF"
    //     );
    //     return;
    // }

    sendResponse(connHandle, "ERR UNKNOWN_COMMAND");
}

// -----------------------------------------------------------------------------
// BLE callbacks
// -----------------------------------------------------------------------------

void commandWriteCallback(
    uint16_t connHandle,
    BLECharacteristic* characteristic,
    uint8_t* data,
    uint16_t len
)
{
    (void) characteristic;

    if (len == 0)
    {
        processCommand(connHandle, "");
        return;
    }

    String command;
    command.reserve(len);

    for (uint16_t i = 0; i < len; i++)
    {
        command += static_cast<char>(data[i]);
    }

    processCommand(connHandle, command);
}

void connectCallback(uint16_t connHandle)
{
    BLEConnection* connection = Bluefruit.Connection(connHandle);

    char centralName[32] = {0};
    connection->getPeerName(
        centralName,
        sizeof(centralName)
    );

    Serial.print("[BLE] Connected");

    if (centralName[0] != '\0')
    {
        Serial.print(" to ");
        Serial.print(centralName);
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

    Serial.print("[BLE] Disconnected, reason=0x");
    Serial.println(reason, HEX);

    showAdvertising();
}

// -----------------------------------------------------------------------------
// Advertising
// -----------------------------------------------------------------------------

void startAdvertising()
{
    Bluefruit.Advertising.stop();

    Bluefruit.Advertising.clearData();
    Bluefruit.ScanResponse.clearData();

    Bluefruit.Advertising.addFlags(
        BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE
    );

    Bluefruit.Advertising.addTxPower();

    // Advertise the PocketLab service UUID.
    Bluefruit.Advertising.addService(
        pocketLabService
    );

    // Put the full device name in scan response.
    Bluefruit.ScanResponse.addName();

    Bluefruit.Advertising.restartOnDisconnect(true);

    // 20 ms fast / 152.5 ms slow
    Bluefruit.Advertising.setInterval(
        32,
        244
    );

    Bluefruit.Advertising.setFastTimeout(30);

    // Advertise indefinitely.
    Bluefruit.Advertising.start(0);

    Serial.print("[BLE] Advertising as ");
    Serial.println(DEVICE_NAME);

    showAdvertising();
}

// -----------------------------------------------------------------------------
// Setup
// -----------------------------------------------------------------------------

void setup()
{
    Serial.begin(115200);

    pixel.begin();
    pixel.clear();
    pixel.setBrightness(25);
    showBooting();

    // Give USB serial a moment to enumerate.
    delay(2000);

    Serial.println();
    Serial.println("PocketLab nRF52840 BLE Test");
    Serial.println("--------------------------");

    Bluefruit.configPrphBandwidth(BANDWIDTH_MAX);
    Bluefruit.begin(1, 0);

    Bluefruit.setName(DEVICE_NAME);
    Bluefruit.setTxPower(4);

    Bluefruit.Periph.setConnectCallback(
        connectCallback
    );

    Bluefruit.Periph.setDisconnectCallback(
        disconnectCallback
    );

    // -------------------------------------------------------------------------
    // PocketLab service
    //
    // Adafruit requires the service to begin before its characteristics.
    // -------------------------------------------------------------------------

    pocketLabService.begin();

    // -------------------------------------------------------------------------
    // Command RX
    //
    // Existing ESP32 contract:
    // READ | WRITE | WRITE_NO_RESPONSE
    // -------------------------------------------------------------------------

    commandRx.setProperties(
        CHR_PROPS_READ |
        CHR_PROPS_WRITE |
        CHR_PROPS_WRITE_WO_RESP
    );

    commandRx.setPermission(
        SECMODE_OPEN,
        SECMODE_OPEN
    );

    commandRx.setMaxLen(256);
    commandRx.setWriteCallback(commandWriteCallback);
    commandRx.begin();

    // -------------------------------------------------------------------------
    // Response TX
    //
    // Existing ESP32 contract:
    // READ | NOTIFY
    // -------------------------------------------------------------------------

    responseTx.setProperties(
        CHR_PROPS_READ |
        CHR_PROPS_NOTIFY
    );

    responseTx.setPermission(
        SECMODE_OPEN,
        SECMODE_NO_ACCESS
    );

    responseTx.setMaxLen(256);
    responseTx.begin();

    responseTx.write("READY");

    startAdvertising();

    Serial.println("[READY] PocketLab BLE service initialized");
}

// -----------------------------------------------------------------------------
// Main loop
// -----------------------------------------------------------------------------

void loop()
{
    // Nothing required here yet.
    // BLE callbacks handle commands asynchronously.
    delay(10);
}
