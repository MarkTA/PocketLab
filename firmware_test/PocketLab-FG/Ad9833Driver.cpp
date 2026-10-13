#include "Ad9833Driver.h"

#include <SPI.h>

namespace {
constexpr uint16_t CONTROL_B28 = 0x2000;
constexpr uint16_t CONTROL_RESET = 0x0100;
constexpr uint16_t CONTROL_SLEEP1 = 0x0080;
constexpr uint16_t CONTROL_SLEEP12 = 0x0040;
constexpr uint16_t CONTROL_OPBITEN = 0x0020;
constexpr uint16_t CONTROL_DIV2 = 0x0008;
constexpr uint16_t CONTROL_MODE = 0x0002;

constexpr uint16_t FREQ0_REGISTER = 0x4000;
constexpr uint16_t PHASE0_REGISTER = 0xC000;
constexpr double TUNING_WORD_SCALE = 268435456.0;  // 2^28
}

Ad9833Driver::Ad9833Driver(
    int sclkPin,
    int sdataPin,
    int fsyncPin,
    double masterClockHz,
    uint32_t spiClockHz
) :
    sclkPin_(sclkPin),
    sdataPin_(sdataPin),
    fsyncPin_(fsyncPin),
    masterClockHz_(masterClockHz),
    spiClockHz_(spiClockHz) {}

bool Ad9833Driver::begin() {
    pinMode(fsyncPin_, OUTPUT);
    digitalWrite(fsyncPin_, HIGH);

    SPI.begin(sclkPin_, -1, sdataPin_, fsyncPin_);
    delay(10);

    initialized_ = true;
    stop();

    Serial.println("[AD9833] Hardware initialized in safe-off state");
    return true;
}

bool Ad9833Driver::apply(uint32_t frequencyHz, Waveform waveform) {
    if (!initialized_) {
        Serial.println("[AD9833] Cannot apply settings before initialization");
        return false;
    }

    if (!supports(waveform)) {
        Serial.println("[AD9833] Unsupported active waveform");
        return false;
    }

    if (frequencyHz == 0) {
        Serial.println("[AD9833] Active frequency must be greater than zero");
        return false;
    }

    // Hold the phase accumulator in reset while updating frequency and phase.
    writeWord(buildControlWord(waveform, true));
    writeFrequency(frequencyHz);
    writeWord(PHASE0_REGISTER);
    writeWord(buildControlWord(waveform, false));

    Serial.printf(
        "[AD9833] Applied FREQ=%lu;OUTPUT=ON\n",
        static_cast<unsigned long>(frequencyHz)
    );
    return true;
}

void Ad9833Driver::stop() {
    if (!initialized_) {
        return;
    }

    // Clear OPBITEN, assert RESET, and power down the clock and DAC.
    const uint16_t safeOffControl =
        CONTROL_B28 |
        CONTROL_RESET |
        CONTROL_SLEEP1 |
        CONTROL_SLEEP12;

    writeWord(safeOffControl);
    Serial.println("[AD9833] Output disabled (RESET + SLEEP1 + SLEEP12)");
}

bool Ad9833Driver::supports(Waveform waveform) {
    return waveform == Waveform::Sine ||
           waveform == Waveform::Triangle ||
           waveform == Waveform::Square;
}

uint16_t Ad9833Driver::buildControlWord(
    Waveform waveform,
    bool reset
) const {
    uint16_t control = CONTROL_B28;

    if (reset) {
        control |= CONTROL_RESET;
    }

    switch (waveform) {
        case Waveform::Triangle:
            control |= CONTROL_MODE;
            break;

        case Waveform::Square:
            control |= CONTROL_OPBITEN | CONTROL_DIV2;
            break;

        case Waveform::Sine:
        case Waveform::RampUp:
        case Waveform::RampDown:
        case Waveform::DC:
            break;
    }

    return control;
}

uint32_t Ad9833Driver::calculateFrequencyWord(uint32_t frequencyHz) const {
    const double tuningWord =
        static_cast<double>(frequencyHz) *
        TUNING_WORD_SCALE /
        masterClockHz_;

    return static_cast<uint32_t>(tuningWord + 0.5);
}

void Ad9833Driver::writeFrequency(uint32_t frequencyHz) {
    const uint32_t frequencyWord = calculateFrequencyWord(frequencyHz);
    const uint16_t lower14 = static_cast<uint16_t>(frequencyWord & 0x3FFF);
    const uint16_t upper14 =
        static_cast<uint16_t>((frequencyWord >> 14) & 0x3FFF);

    writeWord(FREQ0_REGISTER | lower14);
    writeWord(FREQ0_REGISTER | upper14);

    Serial.printf(
        "[AD9833] Frequency word 0x%07lX\n",
        static_cast<unsigned long>(frequencyWord)
    );
}

void Ad9833Driver::writeWord(uint16_t word) {
    SPI.beginTransaction(SPISettings(spiClockHz_, MSBFIRST, SPI_MODE2));
    digitalWrite(fsyncPin_, LOW);
    SPI.transfer16(word);
    digitalWrite(fsyncPin_, HIGH);
    SPI.endTransaction();

    Serial.printf("[AD9833] SPI write 0x%04X\n", word);
}