/**
 * PocketLab BLE Command Server
 *
 * App -> ESP32:
 *   Command RX characteristic
 *   Properties: READ | WRITE | WRITE_NR
 *
 * ESP32 -> App:
 *   Response TX characteristic
 *   Properties: READ | NOTIFY
 *
 * Target environment:
 *   ESP32 Arduino core 3.3.10
 *   NimBLE-Arduino 2.5.0
 */

#include <Arduino.h>
#include <NimBLEDevice.h>

#include <cerrno>
#include <cmath>
#include <cstdlib>
#include <string>

// -----------------------------------------------------------------------------
// Device information
// -----------------------------------------------------------------------------

constexpr char DEVICE_NAME[] = "PocketLab-FG";
constexpr char MODEL_NAME[] = "PocketLab-FG";
constexpr char FIRMWARE_VERSION[] = "0.1.0";
constexpr char HARDWARE_VERSION[] = "PROTO-1";

// -----------------------------------------------------------------------------
// PocketLab BLE UUIDs
//
// The React Native app must use these exact same values.
// -----------------------------------------------------------------------------

constexpr char POCKETLAB_SERVICE_UUID[] =
    "8f5b0001-6c4d-4a73-a8f1-3d9ea01c0001";

constexpr char COMMAND_RX_UUID[] =
    "8f5b0002-6c4d-4a73-a8f1-3d9ea01c0001";

constexpr char RESPONSE_TX_UUID[] =
    "8f5b0003-6c4d-4a73-a8f1-3d9ea01c0001";

// -----------------------------------------------------------------------------
// Function-generator state
// -----------------------------------------------------------------------------

enum class Waveform {
    Sine,
    Square,
    Triangle,
    RampUp,
    RampDown,
    DC
};

struct FunctionGeneratorState {
    uint32_t frequencyHz = 1000;
    float amplitudeVpp = 0.65f;
    float offsetV = 0.0f;
    Waveform waveform = Waveform::Sine;
    bool outputEnabled = false;
};

FunctionGeneratorState generatorState;

// Temporary limits. Update these after the analog hardware is finalized.

constexpr uint32_t MIN_FREQUENCY_HZ = 1;
constexpr uint32_t MAX_FREQUENCY_HZ = 1000000;

constexpr float MIN_AMPLITUDE_VPP = 0.0f;
constexpr float MAX_AMPLITUDE_VPP = 5.0f;

constexpr float MIN_OFFSET_V = -2.5f;
constexpr float MAX_OFFSET_V = 2.5f;

// -----------------------------------------------------------------------------
// BLE globals
// -----------------------------------------------------------------------------

NimBLEServer* server = nullptr;

NimBLECharacteristic* commandCharacteristic = nullptr;
NimBLECharacteristic* responseCharacteristic = nullptr;

/*
 * This project currently assumes one connected client.
 *
 * For multiple simultaneous clients, notification state should be tracked
 * separately for each connection.
 */
bool responseNotificationsEnabled = false;

// -----------------------------------------------------------------------------
// Utility functions
// -----------------------------------------------------------------------------

String waveformToString(Waveform waveform) {
    switch (waveform) {
        case Waveform::Sine:
            return "SINE";

        case Waveform::Square:
            return "SQUARE";

        case Waveform::Triangle:
            return "TRIANGLE";

        case Waveform::RampUp:
            return "RAMP_UP";

        case Waveform::RampDown:
            return "RAMP_DOWN";

        case Waveform::DC:
            return "DC";
    }

    return "UNKNOWN";
}

bool parseWaveform(const String& text, Waveform& waveform) {
    if (text == "SINE") {
        waveform = Waveform::Sine;
        return true;
    }

    if (text == "SQUARE") {
        waveform = Waveform::Square;
        return true;
    }

    if (text == "TRIANGLE") {
        waveform = Waveform::Triangle;
        return true;
    }

    if (text == "RAMP_UP") {
        waveform = Waveform::RampUp;
        return true;
    }

    if (text == "RAMP_DOWN") {
        waveform = Waveform::RampDown;
        return true;
    }

    if (text == "DC") {
        waveform = Waveform::DC;
        return true;
    }

    return false;
}

bool parseUnsignedInteger(
    const String& text,
    uint32_t& result
) {
    if (text.length() == 0) {
        return false;
    }

    for (size_t index = 0; index < text.length(); index++) {
        if (!isDigit(text[index])) {
            return false;
        }
    }

    errno = 0;

    char* parseEnd = nullptr;

    unsigned long parsedValue = strtoul(
        text.c_str(),
        &parseEnd,
        10
    );

    if (
        errno == ERANGE ||
        parseEnd == text.c_str() ||
        *parseEnd != '\0'
    ) {
        return false;
    }

    result = static_cast<uint32_t>(parsedValue);

    return true;
}

bool parseFloatValue(
    const String& text,
    float& result
) {
    if (text.length() == 0) {
        return false;
    }

    errno = 0;

    char* parseEnd = nullptr;

    result = strtof(
        text.c_str(),
        &parseEnd
    );

    if (
        errno == ERANGE ||
        parseEnd == text.c_str() ||
        *parseEnd != '\0' ||
        !isfinite(result)
    ) {
        return false;
    }

    return true;
}

String getArgument(const String& command) {
    int separatorIndex = command.indexOf(' ');

    if (separatorIndex < 0) {
        return "";
    }

    String argument = command.substring(separatorIndex + 1);
    argument.trim();

    return argument;
}

String getCommandName(const String& command) {
    int separatorIndex = command.indexOf(' ');

    if (separatorIndex < 0) {
        return command;
    }

    return command.substring(0, separatorIndex);
}

bool requireArgument(const String& argument) {
    if (argument.length() != 0) {
        return true;
    }

    return false;
}

// -----------------------------------------------------------------------------
// Response handling
// -----------------------------------------------------------------------------

void sendResponse(const String& response) {
    if (responseCharacteristic == nullptr) {
        Serial.println(
            "[ERROR] Response characteristic is unavailable"
        );

        return;
    }

    responseCharacteristic->setValue(response.c_str());

    Serial.printf(
        "[TX] %s\n",
        response.c_str()
    );

    if (responseNotificationsEnabled) {
        bool notified = responseCharacteristic->notify();

        if (!notified) {
            Serial.println(
                "[WARN] Response notification could not be sent"
            );
        }
    } else {
        Serial.println(
            "[BLE] Response saved, but notifications are not enabled"
        );
    }
}

void sendOk() {
    sendResponse("OK");
}

void sendError(const String& errorCode) {
    sendResponse("ERR " + errorCode);
}

void sendState() {
    String response;

    response.reserve(160);

    response += "STATE ";

    response += "FREQ=";
    response += String(generatorState.frequencyHz);

    response += ";AMP=";
    response += String(generatorState.amplitudeVpp, 2);

    response += ";OFFSET=";
    response += String(generatorState.offsetV, 2);

    response += ";WAVE=";
    response += waveformToString(generatorState.waveform);

    response += ";OUTPUT=";
    response += generatorState.outputEnabled
        ? "ON"
        : "OFF";

    sendResponse(response);
}

// -----------------------------------------------------------------------------
// Command handlers
// -----------------------------------------------------------------------------

void handlePing() {
    sendResponse("PONG");
}

void handleInfo() {
    String response;

    response.reserve(120);

    response += "INFO ";

    response += "MODEL=";
    response += MODEL_NAME;

    response += ";FW=";
    response += FIRMWARE_VERSION;

    response += ";HW=";
    response += HARDWARE_VERSION;

    sendResponse(response);
}

void handleSetFrequency(const String& argument) {
    uint32_t frequencyHz = 0;

    if (!parseUnsignedInteger(argument, frequencyHz)) {
        sendError("INVALID_FREQUENCY");
        return;
    }

    if (
        frequencyHz < MIN_FREQUENCY_HZ ||
        frequencyHz > MAX_FREQUENCY_HZ
    ) {
        sendError("FREQUENCY_OUT_OF_RANGE");
        return;
    }

    generatorState.frequencyHz = frequencyHz;

    /*
     * TODO:
     * Apply the frequency to the AD9833 here.
     */

    Serial.printf(
        "[STATE] Frequency set to %lu Hz\n",
        static_cast<unsigned long>(
            generatorState.frequencyHz
        )
    );

    sendOk();
}

void handleSetAmplitude(const String& argument) {
    float amplitudeVpp = 0.0f;

    if (!parseFloatValue(argument, amplitudeVpp)) {
        sendError("INVALID_AMPLITUDE");
        return;
    }

    if (
        amplitudeVpp < MIN_AMPLITUDE_VPP ||
        amplitudeVpp > MAX_AMPLITUDE_VPP
    ) {
        sendError("AMPLITUDE_OUT_OF_RANGE");
        return;
    }

    generatorState.amplitudeVpp = amplitudeVpp;

    /*
     * TODO:
     * Apply the amplitude to the analog output stage here.
     */

    Serial.printf(
        "[STATE] Amplitude set to %.2f Vpp\n",
        generatorState.amplitudeVpp
    );

    sendOk();
}

void handleSetOffset(const String& argument) {
    float offsetV = 0.0f;

    if (!parseFloatValue(argument, offsetV)) {
        sendError("INVALID_OFFSET");
        return;
    }

    if (
        offsetV < MIN_OFFSET_V ||
        offsetV > MAX_OFFSET_V
    ) {
        sendError("OFFSET_OUT_OF_RANGE");
        return;
    }

    generatorState.offsetV = offsetV;

    /*
     * TODO:
     * Apply the DC offset to the analog output stage here.
     */

    Serial.printf(
        "[STATE] Offset set to %.2f V\n",
        generatorState.offsetV
    );

    sendOk();
}

void handleSetWaveform(String argument) {
    argument.toUpperCase();

    Waveform waveform;

    if (!parseWaveform(argument, waveform)) {
        sendError("INVALID_WAVEFORM");
        return;
    }

    generatorState.waveform = waveform;

    /*
     * TODO:
     * Apply the waveform selection to the AD9833 here.
     */

    Serial.printf(
        "[STATE] Waveform set to %s\n",
        waveformToString(
            generatorState.waveform
        ).c_str()
    );

    sendOk();
}

void handleOutput(String argument) {
    argument.toUpperCase();

    if (argument == "ON") {
        generatorState.outputEnabled = true;
    } else if (argument == "OFF") {
        generatorState.outputEnabled = false;
    } else {
        sendError("INVALID_OUTPUT_STATE");
        return;
    }

    /*
     * TODO:
     * Enable or disable the physical output here.
     */

    Serial.printf(
        "[STATE] Output %s\n",
        generatorState.outputEnabled
            ? "enabled"
            : "disabled"
    );

    sendOk();
}

// -----------------------------------------------------------------------------
// Command parser
// -----------------------------------------------------------------------------

void processCommand(String command) {
    command.trim();

    if (command.length() == 0) {
        sendError("EMPTY_COMMAND");
        return;
    }

    String commandName = getCommandName(command);
    String argument = getArgument(command);

    commandName.toUpperCase();

    Serial.printf(
        "[RX] %s\n",
        command.c_str()
    );

    // -------------------------------------------------------------------------
    // Commands without arguments
    // -------------------------------------------------------------------------

    if (commandName == "PING") {
        if (argument.length() != 0) {
            sendError("UNEXPECTED_ARGUMENT");
            return;
        }

        handlePing();
        return;
    }

    if (commandName == "INFO") {
        if (argument.length() != 0) {
            sendError("UNEXPECTED_ARGUMENT");
            return;
        }

        handleInfo();
        return;
    }

    if (commandName == "GET_STATE") {
        if (argument.length() != 0) {
            sendError("UNEXPECTED_ARGUMENT");
            return;
        }

        sendState();
        return;
    }

    // -------------------------------------------------------------------------
    // Commands requiring one argument
    // -------------------------------------------------------------------------

    if (commandName == "SET_FREQ") {
        if (!requireArgument(argument)) {
            sendError("MISSING_ARGUMENT");
            return;
        }

        handleSetFrequency(argument);
        return;
    }

    if (commandName == "SET_AMP") {
        if (!requireArgument(argument)) {
            sendError("MISSING_ARGUMENT");
            return;
        }

        handleSetAmplitude(argument);
        return;
    }

    if (commandName == "SET_OFFSET") {
        if (!requireArgument(argument)) {
            sendError("MISSING_ARGUMENT");
            return;
        }

        handleSetOffset(argument);
        return;
    }

    if (commandName == "SET_WAVE") {
        if (!requireArgument(argument)) {
            sendError("MISSING_ARGUMENT");
            return;
        }

        handleSetWaveform(argument);
        return;
    }

    if (commandName == "OUTPUT") {
        if (!requireArgument(argument)) {
            sendError("MISSING_ARGUMENT");
            return;
        }

        handleOutput(argument);
        return;
    }

    sendError("UNKNOWN_COMMAND");
}

// -----------------------------------------------------------------------------
// BLE server callbacks
// -----------------------------------------------------------------------------

class ServerCallbacks : public NimBLEServerCallbacks {
public:
    void onConnect(
        NimBLEServer* server,
        NimBLEConnInfo& connectionInfo
    ) override {
        Serial.printf(
            "[BLE] Client connected: %s\n",
            connectionInfo
                .getAddress()
                .toString()
                .c_str()
        );

        /*
         * Connection interval units are 1.25 ms.
         *
         * Minimum: 24 x 1.25 ms = 30 ms
         * Maximum: 48 x 1.25 ms = 60 ms
         *
         * Supervision timeout units are 10 ms.
         * 180 x 10 ms = 1800 ms
         */
        server->updateConnParams(
            connectionInfo.getConnHandle(),
            24,
            48,
            0,
            180
        );
    }

    void onDisconnect(
        NimBLEServer* server,
        NimBLEConnInfo& connectionInfo,
        int reason
    ) override {
        Serial.printf(
            "[BLE] Client disconnected: %s, reason: %d\n",
            connectionInfo
                .getAddress()
                .toString()
                .c_str(),
            reason
        );

        responseNotificationsEnabled = false;

        /*
         * Advertising restarts automatically because setup() calls:
         *
         * server->advertiseOnDisconnect(true);
         */
    }

    void onMTUChange(
        uint16_t mtu,
        NimBLEConnInfo& connectionInfo
    ) override {
        Serial.printf(
            "[BLE] MTU updated to %u for %s\n",
            mtu,
            connectionInfo
                .getAddress()
                .toString()
                .c_str()
        );
    }
};

// -----------------------------------------------------------------------------
// Command characteristic callbacks
// -----------------------------------------------------------------------------

class CommandCallbacks : public NimBLECharacteristicCallbacks {
public:
    void onRead(
        NimBLECharacteristic* characteristic,
        NimBLEConnInfo& connectionInfo
    ) override {
        const std::string& value =
            characteristic->getValue();

        Serial.printf(
            "[BLE] Command RX read by %s, value: %s\n",
            connectionInfo
                .getAddress()
                .toString()
                .c_str(),
            value.c_str()
        );
    }

    void onWrite(
        NimBLECharacteristic* characteristic,
        NimBLEConnInfo& connectionInfo
    ) override {
        Serial.printf(
            "[BLE] Command RX write from %s\n",
            connectionInfo
                .getAddress()
                .toString()
                .c_str()
        );

        const std::string& rawValue =
            characteristic->getValue();

        Serial.printf(
            "[BLE] Raw write length: %u\n",
            static_cast<unsigned int>(
                rawValue.length()
            )
        );

        if (rawValue.empty()) {
            sendError("EMPTY_COMMAND");
            return;
        }

        String command;
        command.reserve(rawValue.length());

        for (char character : rawValue) {
            command += character;
        }

        processCommand(command);
    }
};

// -----------------------------------------------------------------------------
// Response characteristic callbacks
// -----------------------------------------------------------------------------

class ResponseCallbacks : public NimBLECharacteristicCallbacks {
public:
    void onRead(
        NimBLECharacteristic* characteristic,
        NimBLEConnInfo& connectionInfo
    ) override {
        Serial.printf(
            "[BLE] Response read by %s, value: %s\n",
            connectionInfo
                .getAddress()
                .toString()
                .c_str(),
            characteristic
                ->getValue()
                .c_str()
        );
    }

    void onSubscribe(
        NimBLECharacteristic* characteristic,
        NimBLEConnInfo& connectionInfo,
        uint16_t subscriptionValue
    ) override {
        /*
         * Bit 0 enables notifications.
         * Bit 1 enables indications.
         *
         * Response TX supports notifications, so check bit 0.
         */
        responseNotificationsEnabled =
            (subscriptionValue & 0x01U) != 0;

        Serial.printf(
            "[BLE] Response notifications %s for %s, subscription=0x%04X\n",
            responseNotificationsEnabled
                ? "enabled"
                : "disabled",
            connectionInfo
                .getAddress()
                .toString()
                .c_str(),
            subscriptionValue
        );
    }
};

// -----------------------------------------------------------------------------
// Callback objects
// -----------------------------------------------------------------------------

ServerCallbacks serverCallbacks;
CommandCallbacks commandCallbacks;
ResponseCallbacks responseCallbacks;

// -----------------------------------------------------------------------------
// Setup
// -----------------------------------------------------------------------------

void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println();
    Serial.println("================================");
    Serial.println(" PocketLab BLE Command Server");
    Serial.println("================================");

    // -------------------------------------------------------------------------
    // Initialize NimBLE
    // -------------------------------------------------------------------------

    NimBLEDevice::init(DEVICE_NAME);

    /*
     * Sets the preferred local MTU.
     *
     * The client must still initiate or accept MTU negotiation. The React
     * Native app should request a larger MTU before receiving long INFO or
     * STATE notifications.
     */
    NimBLEDevice::setMTU(247);

    // -------------------------------------------------------------------------
    // Create GATT server
    // -------------------------------------------------------------------------

    server = NimBLEDevice::createServer();

    if (server == nullptr) {
        Serial.println(
            "[ERROR] Failed to create BLE server"
        );

        return;
    }

    server->setCallbacks(&serverCallbacks);
    server->advertiseOnDisconnect(true);

    // -------------------------------------------------------------------------
    // Create PocketLab service
    // -------------------------------------------------------------------------

    NimBLEService* pocketLabService =
        server->createService(
            POCKETLAB_SERVICE_UUID
        );

    if (pocketLabService == nullptr) {
        Serial.println(
            "[ERROR] Failed to create PocketLab service"
        );

        return;
    }

    // -------------------------------------------------------------------------
    // Create Command RX characteristic
    // -------------------------------------------------------------------------

    commandCharacteristic =
        pocketLabService->createCharacteristic(
            COMMAND_RX_UUID,
            NIMBLE_PROPERTY::READ |
            NIMBLE_PROPERTY::WRITE |
            NIMBLE_PROPERTY::WRITE_NR
        );

    if (commandCharacteristic == nullptr) {
        Serial.println(
            "[ERROR] Failed to create Command RX characteristic"
        );

        return;
    }

    commandCharacteristic->setCallbacks(
        &commandCallbacks
    );

    commandCharacteristic->setValue("EMPTY");

    // -------------------------------------------------------------------------
    // Create Response TX characteristic
    // -------------------------------------------------------------------------

    responseCharacteristic =
        pocketLabService->createCharacteristic(
            RESPONSE_TX_UUID,
            NIMBLE_PROPERTY::READ |
            NIMBLE_PROPERTY::NOTIFY
        );

    if (responseCharacteristic == nullptr) {
        Serial.println(
            "[ERROR] Failed to create Response TX characteristic"
        );

        return;
    }

    responseCharacteristic->setCallbacks(
        &responseCallbacks
    );

    responseCharacteristic->setValue("READY");

    // -------------------------------------------------------------------------
    // Start GATT server
    // -------------------------------------------------------------------------

    if (!server->start()) {
        Serial.println(
            "[ERROR] Failed to start GATT server"
        );

        return;
    }

    // -------------------------------------------------------------------------
    // Configure advertising
    // -------------------------------------------------------------------------

    NimBLEAdvertising* advertising =
        NimBLEDevice::getAdvertising();

    if (advertising == nullptr) {
        Serial.println(
            "[ERROR] Failed to obtain advertising object"
        );

        return;
    }

    advertising->setName(DEVICE_NAME);
    advertising->addServiceUUID(
        POCKETLAB_SERVICE_UUID
    );

    /*
     * Scan response gives the advertisement more room for the full device
     * name and 128-bit service UUID.
     */
    advertising->enableScanResponse(true);

    if (!advertising->start()) {
        Serial.println(
            "[ERROR] Failed to start advertising"
        );

        return;
    }

    // -------------------------------------------------------------------------
    // Ready
    // -------------------------------------------------------------------------

    Serial.printf(
        "[BLE] Device name: %s\n",
        DEVICE_NAME
    );

    Serial.printf(
        "[BLE] Service UUID: %s\n",
        POCKETLAB_SERVICE_UUID
    );

    Serial.printf(
        "[BLE] Command RX UUID: %s\n",
        COMMAND_RX_UUID
    );

    Serial.printf(
        "[BLE] Response TX UUID: %s\n",
        RESPONSE_TX_UUID
    );

    Serial.println(
        "[BLE] Advertising started"
    );

    Serial.println(
        "[BLE] PocketLab command server ready"
    );
}

// -----------------------------------------------------------------------------
// Main loop
// -----------------------------------------------------------------------------

void loop() {
    /*
     * BLE work is currently callback-driven.
     *
     * Later, hardware commands can be moved into a FreeRTOS queue and
     * processed here or in a dedicated task.
     */
    delay(1000);
}