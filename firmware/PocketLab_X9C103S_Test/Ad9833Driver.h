#pragma once

#include <Arduino.h>

enum class Waveform {
    Sine,
    Square,
    Triangle,
    RampUp,
    RampDown,
    DC
};

class Ad9833Driver {
public:
    Ad9833Driver(
        int sclkPin,
        int sdataPin,
        int fsyncPin,
        double masterClockHz = 25000000.0,
        uint32_t spiClockHz = 1000000
    );

    bool begin();
    bool apply(uint32_t frequencyHz, Waveform waveform);
    void stop();

private:
    static bool supports(Waveform waveform);
    uint16_t buildControlWord(Waveform waveform, bool reset) const;
    uint32_t calculateFrequencyWord(uint32_t frequencyHz) const;
    void writeFrequency(uint32_t frequencyHz);
    void writeWord(uint16_t word);

    int sclkPin_;
    int sdataPin_;
    int fsyncPin_;
    double masterClockHz_;
    uint32_t spiClockHz_;
    bool initialized_ = false;
};
