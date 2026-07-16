#pragma once

#include <Arduino.h>

class X9c103sDriver {
public:
    // The installed breakout modules expose 32 usable positions (0..31).
    static constexpr int MAX_POSITION = 31;

    X9c103sDriver(
        int csPin,
        int incPin,
        int directionPin,
        uint32_t edgeDelayUs = 100
    );

    // Initializes the GPIO and establishes a known position at VL.
    void begin();

    // Sweeps past the lower endpoint so the tracked position is known.
    void forceToVL();

    // Moves from the tracked position without writing nonvolatile memory.
    void setPosition(int requestedPosition);

    int position() const;

private:
    enum class Direction {
        TowardVL,
        TowardVH
    };

    int csPin_;
    int incPin_;
    int directionPin_;
    uint32_t edgeDelayUs_;
    int position_ = 0;

    void beginAdjustment(Direction direction);
    void endAdjustmentWithoutStore();
    void moveSteps(Direction direction, int stepCount);
};