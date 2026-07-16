/**
 * PocketLab X9C103S amplitude-control test
 *
 * Generates a continuous 1 kHz sine wave with the AD9833 and provides
 * manual X9C103S wiper control through the Serial Monitor.
 *
 * Serial Monitor: 115200 baud; any line ending is acceptable.
 *
 * Commands:
 *   0, 25, 50, 75, 100  Set nominal amplitude percentage
 *   + / -                Move one wiper step
 *   SINE                 Select a 1 kHz sine wave
 *   TRIANGLE             Select a 1 kHz triangle wave
 *   START                Start the selected waveform
 *   STOP                 Move to VL, settle, then stop the AD9833
 *   ZERO                 Force the wiper to the VL endpoint
 *   STATUS               Print the current test state
 *   HELP                 Print command help
 */

#include <Arduino.h>
#include "Ad9833Driver.h"

// AD9833 pins from the existing, tested PocketLab firmware.
constexpr int AD9833_SCLK_PIN = 18;
constexpr int AD9833_SDATA_PIN = 23;
constexpr int AD9833_FSYNC_PIN = 5;

// X9C103S control pins.
constexpr int X9C_CS_PIN = 25;
constexpr int X9C_INC_PIN = 26;
constexpr int X9C_UD_PIN = 27;

constexpr uint32_t TEST_FREQUENCY_HZ = 1000;
constexpr int X9C_MAX_POSITION = 31;
// Slow timing improves signal integrity on the breadboard and easily exceeds
// the X9C103S minimum timing requirements.
constexpr uint32_t X9C_EDGE_DELAY_US = 100;
constexpr uint32_t SAFE_STOP_SETTLE_MS = 25;

Ad9833Driver ad9833(
    AD9833_SCLK_PIN,
    AD9833_SDATA_PIN,
    AD9833_FSYNC_PIN
);

int wiperPosition = 0;
Waveform selectedWaveform = Waveform::Sine;
bool outputRunning = false;

enum class WiperDirection {
    TowardVL,
    TowardVH
};

const char* waveformName(Waveform waveform) {
    return waveform == Waveform::Triangle ? "TRIANGLE" : "SINE";
}

void beginWiperAdjustment(WiperDirection direction) {
    digitalWrite(X9C_INC_PIN, HIGH);
    digitalWrite(
        X9C_UD_PIN,
        direction == WiperDirection::TowardVH ? HIGH : LOW
    );
    delayMicroseconds(X9C_EDGE_DELAY_US);

    digitalWrite(X9C_CS_PIN, LOW);
    delayMicroseconds(X9C_EDGE_DELAY_US);
}

void endWiperAdjustmentWithoutStore() {
    // INC is deliberately already low after the final counted step. Raising
    // CS in this state avoids a nonvolatile-memory store without introducing
    // an additional falling edge and unintended wiper movement.
    digitalWrite(X9C_CS_PIN, HIGH);
    delayMicroseconds(X9C_EDGE_DELAY_US);

    // Return INC high only after the device is deselected.
    digitalWrite(X9C_INC_PIN, HIGH);
}

void moveWiperSteps(WiperDirection direction, int stepCount) {
    if (stepCount <= 0) {
        return;
    }

    beginWiperAdjustment(direction);

    for (int step = 0; step < stepCount; ++step) {
        // Each falling edge moves exactly one position.
        digitalWrite(X9C_INC_PIN, LOW);
        delayMicroseconds(X9C_EDGE_DELAY_US);

        // Leave INC low after the final step so CS can rise without storing
        // the position or creating another counted falling edge.
        if (step + 1 < stepCount) {
            digitalWrite(X9C_INC_PIN, HIGH);
            delayMicroseconds(X9C_EDGE_DELAY_US);
        }
    }

    endWiperAdjustmentWithoutStore();
}

void forceWiperToVL() {
    // 31 downward pulses guarantee VL from any recalled power-up position.
    moveWiperSteps(
        WiperDirection::TowardVL,
        X9C_MAX_POSITION + 1
    );
    wiperPosition = 0;
    Serial.println("[X9C] Wiper forced to VL (0/31)");
}

void setWiperPosition(int requestedPosition) {
    requestedPosition = constrain(
        requestedPosition,
        0,
        X9C_MAX_POSITION
    );

    const int difference = requestedPosition - wiperPosition;

    if (difference > 0) {
        moveWiperSteps(WiperDirection::TowardVH, difference);
    } else if (difference < 0) {
        moveWiperSteps(WiperDirection::TowardVL, -difference);
    }

    wiperPosition = requestedPosition;

    Serial.printf(
        "[X9C] Wiper=%d/%d (%.1f%%)\n",
        wiperPosition,
        X9C_MAX_POSITION,
        100.0f * wiperPosition / X9C_MAX_POSITION
    );
}

void setAmplitudePercentage(int percentage) {
    percentage = constrain(percentage, 0, 100);

    const int position = static_cast<int>(lroundf(
        X9C_MAX_POSITION * percentage / 100.0f
    ));

    setWiperPosition(position);
}

void startOutput() {
    if (ad9833.apply(TEST_FREQUENCY_HZ, selectedWaveform)) {
        outputRunning = true;
        Serial.printf(
            "[TEST] %lu Hz %s started\n",
            static_cast<unsigned long>(TEST_FREQUENCY_HZ),
            waveformName(selectedWaveform)
        );
    } else {
        outputRunning = false;
        Serial.println("[ERROR] AD9833 start failed");
    }
}

void safeStop() {
    Serial.println("[TEST] Safe stop: moving wiper to VL");
    forceWiperToVL();
    delay(SAFE_STOP_SETTLE_MS);
    ad9833.stop();
    outputRunning = false;
    Serial.println("[TEST] Safe stop complete");
}

void printStatus() {
    Serial.printf(
        "[STATUS] WAVE=%s;FREQ=%lu;WIPER=%d/%d;OUTPUT=%s\n",
        waveformName(selectedWaveform),
        static_cast<unsigned long>(TEST_FREQUENCY_HZ),
        wiperPosition,
        X9C_MAX_POSITION,
        outputRunning ? "ON" : "OFF"
    );
}

void printHelp() {
    Serial.println();
    Serial.println("Commands:");
    Serial.println("  0 | 25 | 50 | 75 | 100  Set amplitude percentage");
    Serial.println("  + | -                    Move one wiper step");
    Serial.println("  SINE                     Select/start 1 kHz sine");
    Serial.println("  TRIANGLE                 Select/start 1 kHz triangle");
    Serial.println("  START                    Start selected waveform");
    Serial.println("  STOP                     Safe-stop output");
    Serial.println("  ZERO                     Force wiper to VL");
    Serial.println("  STATUS                   Show current state");
    Serial.println("  HELP                     Show commands");
    Serial.println();
}

void processSerialCommand(String command) {
    command.trim();
    command.toUpperCase();

    if (command.length() == 0) {
        return;
    }

    if (
        command == "0" ||
        command == "25" ||
        command == "50" ||
        command == "75" ||
        command == "100"
    ) {
        setAmplitudePercentage(command.toInt());
    } else if (command == "+") {
        setWiperPosition(wiperPosition + 1);
    } else if (command == "-") {
        setWiperPosition(wiperPosition - 1);
    } else if (command == "SINE") {
        selectedWaveform = Waveform::Sine;
        startOutput();
    } else if (command == "TRIANGLE") {
        selectedWaveform = Waveform::Triangle;
        startOutput();
    } else if (command == "START") {
        startOutput();
    } else if (command == "STOP") {
        safeStop();
    } else if (command == "ZERO" || command == "Z") {
        forceWiperToVL();
    } else if (command == "STATUS" || command == "?") {
        printStatus();
    } else if (command == "HELP" || command == "H") {
        printHelp();
    } else {
        Serial.printf("[ERROR] Unknown command: %s\n", command.c_str());
        printHelp();
    }
}

void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println();
    Serial.println("====================================");
    Serial.println(" PocketLab X9C103S Amplitude Test");
    Serial.println("====================================");

    // Establish safe X9C logic levels before enabling the GPIO outputs.
    digitalWrite(X9C_CS_PIN, HIGH);
    digitalWrite(X9C_INC_PIN, HIGH);
    digitalWrite(X9C_UD_PIN, LOW);
    pinMode(X9C_CS_PIN, OUTPUT);
    pinMode(X9C_INC_PIN, OUTPUT);
    pinMode(X9C_UD_PIN, OUTPUT);

    if (!ad9833.begin()) {
        Serial.println("[ERROR] Failed to initialize AD9833");
        return;
    }

    forceWiperToVL();
    selectedWaveform = Waveform::Sine;
    startOutput();

    Serial.println("[TEST] Started safely at 0% amplitude");
    printHelp();
    printStatus();
}

void loop() {
    if (Serial.available() > 0) {
        // Both carriage-return and newline Serial Monitor settings work because
        // trim() removes the received line terminator.
        String command = Serial.readStringUntil('\n');
        processSerialCommand(command);
    }
}