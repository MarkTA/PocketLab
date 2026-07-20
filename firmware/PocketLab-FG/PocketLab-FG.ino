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
#include "Ad9833Driver.h"
#include "Ad5626Driver.h"
#include "X9c103sDriver.h"

#include <cerrno>
#include <cmath>
#include <cstdlib>
#include <string> 

// -----------------------------------------------------------------------------
// Device information
// -----------------------------------------------------------------------------

constexpr char DEVICE_NAME[] = "PocketLab-FG";
constexpr char MODEL_NAME[] = "PocketLab-FG";
constexpr char FIRMWARE_VERSION[] = "0.5.5";
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

struct FunctionGeneratorState {
    uint32_t frequencyHz = 0;
    float amplitudeVpp = 0.0f;
    float offsetV = 0.0f;
    Waveform waveform = Waveform::DC;
    bool outputEnabled = false;
};

FunctionGeneratorState generatorState;

// Temporary limits. Update these after the analog hardware is finalized.

constexpr uint32_t MIN_FREQUENCY_HZ = 1;
constexpr uint32_t MAX_FREQUENCY_HZ = 1000000;

constexpr float MIN_AMPLITUDE_VPP = 0.0f;
constexpr float MAX_AMPLITUDE_VPP = 4.15f;

/*
 * Interim unipolar output limits. OFFSET is the waveform center voltage
 * relative to ground. These limits will be revised when the bipolar supply
 * and output stage are installed.
 */
constexpr float MIN_OFFSET_V = 0.0f;
constexpr float MAX_OFFSET_V = 4.089f;
constexpr float MIN_ACTIVE_OUTPUT_V = 0.20f;
constexpr float MAX_ACTIVE_OUTPUT_V = 4.40f;

String waveformToString(Waveform waveform);

// -----------------------------------------------------------------------------
// AD9833 hardware
// -----------------------------------------------------------------------------

// Shared serial bus used by both the AD9833 and AD5626.
constexpr int SHARED_SPI_SCLK_PIN = 14;
constexpr int SHARED_SPI_DATA_PIN = 13;
constexpr int AD9833_FSYNC_PIN = 32;

Ad9833Driver ad9833(
    SHARED_SPI_SCLK_PIN,
    SHARED_SPI_DATA_PIN,
    AD9833_FSYNC_PIN
);

// -----------------------------------------------------------------------------
// AD5626 offset control
// -----------------------------------------------------------------------------

constexpr int AD5626_SYNC_PIN = 33;

/*
 * AD5626 LDAC is tied directly to ground, so it requires no firmware pin.
 * AD5626 CLR is held inactive high by the external hardware connection.
 *
 * AD9833_FSYNC_PIN is passed as the peer-select pin so the DAC driver can
 * keep the AD9833 deselected while clocking data on the shared bus.
 */

Ad5626Driver ad5626(
    AD5626_SYNC_PIN,
    SHARED_SPI_SCLK_PIN,
    SHARED_SPI_DATA_PIN,
    AD9833_FSYNC_PIN
);

// -----------------------------------------------------------------------------
// X9C103S amplitude control
// -----------------------------------------------------------------------------

constexpr int X9C_CS_PIN = 27;
constexpr int X9C_INC_PIN = 26;
constexpr int X9C_UD_PIN = 25;
constexpr uint32_t SAFE_STOP_SETTLE_MS = 25;
constexpr uint32_t OFFSET_REBIAS_SETTLE_MS = 2000;

X9c103sDriver x9c(
    X9C_CS_PIN,
    X9C_INC_PIN,
    X9C_UD_PIN
);

struct OffsetTransitionState {
    bool active = false;
    uint32_t restoreAtMs = 0;
};

OffsetTransitionState offsetTransition;

struct AmplitudeCalibrationPoint {
    float outputVpp;
    int position;
};

/*
 * Calibration measured at 1 kHz with the current fixed-gain OP484 stage.
 * Intermediate requested amplitudes are mapped by linear interpolation.
 */
constexpr AmplitudeCalibrationPoint AMPLITUDE_CALIBRATION[] = {
    {0.0000f, 0},
    {1.2257f, 8},
    {2.3481f, 16},
    {3.2390f, 23},
    {4.1548f, 31}
};

constexpr size_t AMPLITUDE_CALIBRATION_COUNT =
    sizeof(AMPLITUDE_CALIBRATION) /
    sizeof(AMPLITUDE_CALIBRATION[0]);

int amplitudeToX9cPosition(float amplitudeVpp) {
    if (amplitudeVpp <= AMPLITUDE_CALIBRATION[0].outputVpp) {
        return AMPLITUDE_CALIBRATION[0].position;
    }

    for (size_t index = 1; index < AMPLITUDE_CALIBRATION_COUNT; ++index) {
        const AmplitudeCalibrationPoint& lower =
            AMPLITUDE_CALIBRATION[index - 1];
        const AmplitudeCalibrationPoint& upper =
            AMPLITUDE_CALIBRATION[index];

        if (amplitudeVpp <= upper.outputVpp) {
            const float fraction =
                (amplitudeVpp - lower.outputVpp) /
                (upper.outputVpp - lower.outputVpp);

            const float interpolatedPosition =
                lower.position +
                fraction * (upper.position - lower.position);

            return constrain(
                static_cast<int>(lroundf(interpolatedPosition)),
                0,
                X9c103sDriver::MAX_POSITION
            );
        }
    }

    return X9c103sDriver::MAX_POSITION;
}

void applyAmplitude(float amplitudeVpp) {
    const int position = amplitudeToX9cPosition(amplitudeVpp);
    x9c.setPosition(position);

    Serial.printf(
        "[X9C] Requested amplitude %.2f Vpp mapped to position %d/%d\n",
        amplitudeVpp,
        position,
        X9c103sDriver::MAX_POSITION
    );
}

bool waveformSupportedByAd9833(Waveform waveform) {
    return waveform == Waveform::Sine ||
           waveform == Waveform::Triangle ||
           waveform == Waveform::Square;
}

bool stateFitsUnipolarOutputEnvelope(
    const FunctionGeneratorState& state
) {
    if (!state.outputEnabled) {
        return true;
    }

    if (state.waveform == Waveform::DC) {
        return state.amplitudeVpp == 0.0f &&
               state.offsetV >= MIN_OFFSET_V &&
               state.offsetV <= MAX_OFFSET_V;
    }

    const float halfAmplitude = state.amplitudeVpp * 0.5f;
    const float minimumOutput = state.offsetV - halfAmplitude;
    const float maximumOutput = state.offsetV + halfAmplitude;

    return minimumOutput >= MIN_ACTIVE_OUTPUT_V &&
           maximumOutput <= MAX_ACTIVE_OUTPUT_V;
}

void applyOffset(float offsetV) {
    const uint16_t code = ad5626.writeVoltage(offsetV);

    Serial.printf(
        "[AD5626] OFFSET=%.3f V;CODE=%u;CALCULATED=%.4f V\n",
        offsetV,
        code,
        ad5626.currentVoltage()
    );
}

void cancelOffsetTransition(const char* reason) {
    if (!offsetTransition.active) {
        return;
    }

    offsetTransition.active = false;
    Serial.printf("[OFFSET] Transition cancelled: %s\n", reason);
}

void beginOffsetTransition(float offsetV) {
    // Verified hardware sequence: mute, change bias, allow the 47 uF
    // coupling capacitor to rebias, then restore the requested amplitude.
    x9c.forceToVL();
    applyOffset(offsetV);

    offsetTransition.active = true;
    offsetTransition.restoreAtMs =
        millis() + OFFSET_REBIAS_SETTLE_MS;

    Serial.printf(
        "[OFFSET] Output muted; rebiasing for %lu ms\n",
        static_cast<unsigned long>(OFFSET_REBIAS_SETTLE_MS)
    );
}

void serviceOffsetTransition() {
    if (!offsetTransition.active) {
        return;
    }

    if (
        static_cast<int32_t>(
            millis() - offsetTransition.restoreAtMs
        ) < 0
    ) {
        return;
    }

    offsetTransition.active = false;

    if (
        generatorState.outputEnabled &&
        generatorState.waveform != Waveform::DC
    ) {
        applyAmplitude(generatorState.amplitudeVpp);

        Serial.printf(
            "[OFFSET] Rebias complete; restored %.2f Vpp\n",
            generatorState.amplitudeVpp
        );
    } else {
        x9c.forceToVL();
        Serial.println(
            "[OFFSET] Rebias complete; output remains muted"
        );
    }
}

bool applyAd9833State(
    const FunctionGeneratorState& state
) {
    cancelOffsetTransition("complete hardware state applied");

    /*
     * OFF is valid for every logical waveform, including the PocketLab idle
     * state (DC, 0 Hz, 0 Vpp). Do not try to configure an unsupported waveform
     * before powering the DDS down.
     */
    if (!state.outputEnabled) {
        x9c.forceToVL();
        delay(SAFE_STOP_SETTLE_MS);
        ad9833.stop();
        ad5626.clear();

        Serial.printf(
            "[SAFE] Applied 0 V safe-off; logical WAVE=%s;FREQ=%lu\n",
            waveformToString(state.waveform).c_str(),
            static_cast<unsigned long>(state.frequencyHz)
        );

        return true;
    }

    if (!stateFitsUnipolarOutputEnvelope(state)) {
        Serial.printf(
            "[OUTPUT] Invalid envelope: OFFSET=%.3f V;AMP=%.3f Vpp\n",
            state.offsetV,
            state.amplitudeVpp
        );
        return false;
    }

    if (state.waveform == Waveform::DC) {
        x9c.forceToVL();
        ad9833.stop();
        applyOffset(state.offsetV);

        Serial.printf(
            "[AD5626] Applied DC output %.3f V\n",
            state.offsetV
        );
        return true;
    }

    if (!waveformSupportedByAd9833(state.waveform)) {
        Serial.printf(
            "[AD9833] Unsupported active waveform: %s\n",
            waveformToString(state.waveform).c_str()
        );

        return false;
    }

    if (
        state.frequencyHz < MIN_FREQUENCY_HZ ||
        state.frequencyHz > MAX_FREQUENCY_HZ
    ) {
        Serial.printf(
            "[AD9833] Active frequency out of range: %lu Hz\n",
            static_cast<unsigned long>(state.frequencyHz)
        );

        return false;
    }

    // Establish bias and amplitude before starting the DDS.
    applyOffset(state.offsetV);
    applyAmplitude(state.amplitudeVpp);

    if (!ad9833.apply(state.frequencyHz, state.waveform)) {
        x9c.forceToVL();
        return false;
    }

    Serial.printf(
        "[AD9833] Applied FREQ=%lu;WAVE=%s;OUTPUT=ON\n",
        static_cast<unsigned long>(state.frequencyHz),
        waveformToString(state.waveform).c_str()
    );

    return true;
}

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

    const bool validActiveFrequency =
        frequencyHz >= MIN_FREQUENCY_HZ &&
        frequencyHz <= MAX_FREQUENCY_HZ;

    const bool validIdleFrequency =
        frequencyHz == 0 &&
        generatorState.waveform == Waveform::DC &&
        !generatorState.outputEnabled;

    if (!validActiveFrequency && !validIdleFrequency) {
        sendError("FREQUENCY_OUT_OF_RANGE");
        return;
    }

    FunctionGeneratorState pendingState = generatorState;
    pendingState.frequencyHz = frequencyHz;

    if (!applyAd9833State(pendingState)) {
        sendError("HARDWARE_APPLY_FAILED");
        return;
    }

    generatorState = pendingState;

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

    FunctionGeneratorState pendingState = generatorState;
    pendingState.amplitudeVpp = amplitudeVpp;

    if (
        pendingState.outputEnabled &&
        !stateFitsUnipolarOutputEnvelope(pendingState)
    ) {
        sendError("AMPLITUDE_OFFSET_OUT_OF_RANGE");
        return;
    }

    if (pendingState.outputEnabled) {
        applyAmplitude(amplitudeVpp);
    }

    generatorState = pendingState;

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

    FunctionGeneratorState pendingState = generatorState;
    pendingState.offsetV = offsetV;

    if (
        pendingState.outputEnabled &&
        !stateFitsUnipolarOutputEnvelope(pendingState)
    ) {
        sendError("AMPLITUDE_OFFSET_OUT_OF_RANGE");
        return;
    }

    if (pendingState.outputEnabled) {
        if (pendingState.waveform == Waveform::DC) {
            applyOffset(offsetV);
        } else {
            beginOffsetTransition(offsetV);
        }
    }

    generatorState = pendingState;

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

    FunctionGeneratorState pendingState = generatorState;
    pendingState.waveform = waveform;

    if (waveform == Waveform::DC) {
        pendingState.frequencyHz = 0;
        pendingState.amplitudeVpp = 0.0f;
    } else if (!waveformSupportedByAd9833(waveform)) {
        sendError("UNSUPPORTED_WAVEFORM");
        return;
    } else if (pendingState.frequencyHz == 0) {
        /*
         * Give individual SET_WAVE commands a valid default frequency when
         * leaving the idle DC state. SET_STATE remains the preferred command.
         */
        pendingState.frequencyHz = 1000;
    }

    if (!applyAd9833State(pendingState)) {
        sendError("HARDWARE_APPLY_FAILED");
        return;
    }

    generatorState = pendingState;

    Serial.printf(
        "[STATE] Waveform set to %s\n",
        waveformToString(
            generatorState.waveform
        ).c_str()
    );

    sendOk();
}


bool parseStateField(
    const String& field,
    String& key,
    String& value
) {
    int separatorIndex = field.indexOf('=');

    if (
        separatorIndex <= 0 ||
        separatorIndex >= static_cast<int>(field.length()) - 1
    ) {
        return false;
    }

    key = field.substring(0, separatorIndex);
    value = field.substring(separatorIndex + 1);

    key.trim();
    value.trim();
    key.toUpperCase();

    return key.length() > 0 && value.length() > 0;
}

void handleSetState(const String& argument) {
    FunctionGeneratorState pendingState = generatorState;

    bool hasFrequency = false;
    bool hasAmplitude = false;
    bool hasOffset = false;
    bool hasWaveform = false;

    int fieldStart = 0;

    while (fieldStart <= static_cast<int>(argument.length())) {
        int fieldEnd = argument.indexOf(';', fieldStart);

        if (fieldEnd < 0) {
            fieldEnd = argument.length();
        }

        String field = argument.substring(fieldStart, fieldEnd);
        field.trim();

        if (field.length() == 0) {
            sendError("INVALID_STATE_FORMAT");
            return;
        }

        String key;
        String value;

        if (!parseStateField(field, key, value)) {
            sendError("INVALID_STATE_FORMAT");
            return;
        }

        if (key == "FREQ") {
            if (hasFrequency) {
                sendError("DUPLICATE_STATE_FIELD");
                return;
            }

            uint32_t frequencyHz = 0;

            if (!parseUnsignedInteger(value, frequencyHz)) {
                sendError("INVALID_FREQUENCY");
                return;
            }

            if (frequencyHz > MAX_FREQUENCY_HZ) {
                sendError("FREQUENCY_OUT_OF_RANGE");
                return;
            }

            pendingState.frequencyHz = frequencyHz;
            hasFrequency = true;
        } else if (key == "AMP") {
            if (hasAmplitude) {
                sendError("DUPLICATE_STATE_FIELD");
                return;
            }

            float amplitudeVpp = 0.0f;

            if (!parseFloatValue(value, amplitudeVpp)) {
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

            pendingState.amplitudeVpp = amplitudeVpp;
            hasAmplitude = true;
        } else if (key == "OFFSET") {
            if (hasOffset) {
                sendError("DUPLICATE_STATE_FIELD");
                return;
            }

            float offsetV = 0.0f;

            if (!parseFloatValue(value, offsetV)) {
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

            pendingState.offsetV = offsetV;
            hasOffset = true;
        } else if (key == "WAVE") {
            if (hasWaveform) {
                sendError("DUPLICATE_STATE_FIELD");
                return;
            }

            value.toUpperCase();

            Waveform waveform;

            if (!parseWaveform(value, waveform)) {
                sendError("INVALID_WAVEFORM");
                return;
            }

            pendingState.waveform = waveform;
            hasWaveform = true;
        } else {
            sendError("UNKNOWN_STATE_FIELD");
            return;
        }

        if (fieldEnd >= static_cast<int>(argument.length())) {
            break;
        }

        fieldStart = fieldEnd + 1;
    }

    if (
        !hasFrequency ||
        !hasAmplitude ||
        !hasOffset ||
        !hasWaveform
    ) {
        sendError("MISSING_STATE_FIELD");
        return;
    }

    if (pendingState.waveform == Waveform::DC) {
        if (
            pendingState.frequencyHz != 0 ||
            pendingState.amplitudeVpp != 0.0f
        ) {
            sendError("INVALID_DC_STATE");
            return;
        }
    } else {
        if (!waveformSupportedByAd9833(pendingState.waveform)) {
            sendError("UNSUPPORTED_WAVEFORM");
            return;
        }

        if (
            pendingState.frequencyHz < MIN_FREQUENCY_HZ ||
            pendingState.frequencyHz > MAX_FREQUENCY_HZ
        ) {
            sendError("FREQUENCY_OUT_OF_RANGE");
            return;
        }
    }

    const bool ddsConfigurationChanged =
        pendingState.frequencyHz != generatorState.frequencyHz ||
        pendingState.waveform != generatorState.waveform;

    const bool amplitudeChanged =
        fabsf(
            pendingState.amplitudeVpp - generatorState.amplitudeVpp
        ) > 0.0005f;

    const bool offsetChanged =
        fabsf(
            pendingState.offsetV - generatorState.offsetV
        ) > 0.0005f;

    if (
        pendingState.outputEnabled &&
        !stateFitsUnipolarOutputEnvelope(pendingState)
    ) {
        sendError("AMPLITUDE_OFFSET_OUT_OF_RANGE");
        return;
    }

    /*
     * SET_STATE is also used by the app for amplitude-slider updates. Avoid
     * restarting the AD9833 when only amplitude or the future offset setting
     * changed. Restarting the DDS unnecessarily creates a transient across
     * the AC-coupling capacitor.
     *
     * When output is off, retain the requested settings logically and leave
     * the physical path in its existing safe-off state. OUTPUT ON applies the
     * complete requested state later.
     */
    if (pendingState.outputEnabled) {
        if (
            offsetChanged &&
            pendingState.waveform != Waveform::DC
        ) {
            beginOffsetTransition(pendingState.offsetV);

            /*
             * If frequency or waveform changed in the same SET_STATE, update
             * the DDS while the amplitude path is muted. Do not use
             * applyAd9833State() here because it would restore amplitude
             * before the rebias interval has elapsed.
             */
            if (
                ddsConfigurationChanged &&
                !ad9833.apply(
                    pendingState.frequencyHz,
                    pendingState.waveform
                )
            ) {
                cancelOffsetTransition("DDS apply failed");
                x9c.forceToVL();
                sendError("HARDWARE_APPLY_FAILED");
                return;
            }

            Serial.println(
                "[STATE] Offset update started; AD9833 remains running"
            );
        } else if (ddsConfigurationChanged) {
            if (!applyAd9833State(pendingState)) {
                sendError("HARDWARE_APPLY_FAILED");
                return;
            }
        } else if (amplitudeChanged || offsetChanged) {
            if (amplitudeChanged) {
                applyAmplitude(pendingState.amplitudeVpp);
            }

            Serial.println(
                "[STATE] Analog-only update; AD9833 left running"
            );
        }
    }

    generatorState = pendingState;

    Serial.printf(
        "[STATE] Applied FREQ=%lu;AMP=%.2f;OFFSET=%.2f;WAVE=%s\n",
        static_cast<unsigned long>(generatorState.frequencyHz),
        generatorState.amplitudeVpp,
        generatorState.offsetV,
        waveformToString(generatorState.waveform).c_str()
    );

    sendOk();
}

void handleOutput(String argument) {
    argument.toUpperCase();

    FunctionGeneratorState pendingState = generatorState;

    if (argument == "ON") {
        if (
            generatorState.waveform != Waveform::DC &&
            !waveformSupportedByAd9833(generatorState.waveform)
        ) {
            sendError("UNSUPPORTED_WAVEFORM");
            return;
        }

        if (
            generatorState.waveform != Waveform::DC &&
            (
                generatorState.frequencyHz < MIN_FREQUENCY_HZ ||
                generatorState.frequencyHz > MAX_FREQUENCY_HZ
            )
        ) {
            sendError("FREQUENCY_OUT_OF_RANGE");
            return;
        }

        pendingState.outputEnabled = true;

        if (!stateFitsUnipolarOutputEnvelope(pendingState)) {
            sendError("AMPLITUDE_OFFSET_OUT_OF_RANGE");
            return;
        }
    } else if (argument == "OFF") {
        pendingState.outputEnabled = false;
    } else {
        sendError("INVALID_OUTPUT_STATE");
        return;
    }

    if (!applyAd9833State(pendingState)) {
        sendError("HARDWARE_APPLY_FAILED");
        return;
    }

    generatorState = pendingState;

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

    /*
     * Keep the verified transition atomic. Read-only commands and emergency
     * OUTPUT OFF remain available while the capacitor is rebiasing.
     */
    if (
        offsetTransition.active &&
        commandName != "PING" &&
        commandName != "INFO" &&
        commandName != "GET_STATE" &&
        !(commandName == "OUTPUT" && argument.equalsIgnoreCase("OFF"))
    ) {
        sendError("OFFSET_TRANSITION_BUSY");
        return;
    }

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

    if (commandName == "SET_STATE") {
        if (!requireArgument(argument)) {
            sendError("MISSING_ARGUMENT");
            return;
        }

        handleSetState(argument);
        return;
    }

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
         * Fail safe: a lost BLE connection must never leave the physical
         * output running. This also clears square-wave OPBITEN, which would
         * otherwise leave VOUT near 3.3 V while RESET is asserted.
         */
        generatorState.outputEnabled = false;
        cancelOffsetTransition("BLE disconnect");
        x9c.forceToVL();
        delay(SAFE_STOP_SETTLE_MS);
        ad9833.stop();
        ad5626.clear();

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
    // Initialize X9C103S in its safe minimum-amplitude state
    // -------------------------------------------------------------------------

    x9c.begin();

    // -------------------------------------------------------------------------
    // Initialize AD9833 and the shared hardware SPI bus
    // -------------------------------------------------------------------------

    if (!ad9833.begin()) {
        Serial.println(
            "[ERROR] Failed to initialize AD9833"
        );

        return;
    }

    // -------------------------------------------------------------------------
    // Initialize AD5626 in its calibrated 0 V safe state
    //
    // The DAC shares the hardware SPI bus initialized by the AD9833 driver.
    // -------------------------------------------------------------------------

    ad5626.begin();

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
    serviceOffsetTransition();
    delay(5);
}