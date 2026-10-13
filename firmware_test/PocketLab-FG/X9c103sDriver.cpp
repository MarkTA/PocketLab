#include "X9c103sDriver.h"

X9c103sDriver::X9c103sDriver(
    int csPin,
    int incPin,
    int directionPin,
    uint32_t edgeDelayUs
) :
    csPin_(csPin),
    incPin_(incPin),
    directionPin_(directionPin),
    edgeDelayUs_(edgeDelayUs) {}

void X9c103sDriver::begin() {
    // Establish inactive levels before enabling the output drivers.
    digitalWrite(csPin_, HIGH);
    digitalWrite(incPin_, HIGH);
    digitalWrite(directionPin_, LOW);

    pinMode(csPin_, OUTPUT);
    pinMode(incPin_, OUTPUT);
    pinMode(directionPin_, OUTPUT);

    forceToVL();
}

void X9c103sDriver::forceToVL() {
    // One more pulse than the usable range guarantees the lower endpoint.
    moveSteps(Direction::TowardVL, MAX_POSITION + 1);
    position_ = 0;

    Serial.printf(
        "[X9C] Wiper forced to VL (%d/%d)\n",
        position_,
        MAX_POSITION
    );
}

void X9c103sDriver::setPosition(int requestedPosition) {
    requestedPosition = constrain(
        requestedPosition,
        0,
        MAX_POSITION
    );

    const int difference = requestedPosition - position_;

    if (difference > 0) {
        moveSteps(Direction::TowardVH, difference);
    } else if (difference < 0) {
        moveSteps(Direction::TowardVL, -difference);
    }

    position_ = requestedPosition;

    Serial.printf(
        "[X9C] Wiper=%d/%d\n",
        position_,
        MAX_POSITION
    );
}

int X9c103sDriver::position() const {
    return position_;
}

void X9c103sDriver::beginAdjustment(Direction direction) {
    digitalWrite(incPin_, HIGH);
    digitalWrite(
        directionPin_,
        direction == Direction::TowardVH ? HIGH : LOW
    );
    delayMicroseconds(edgeDelayUs_);
    digitalWrite(csPin_, LOW);
    delayMicroseconds(edgeDelayUs_);
}

void X9c103sDriver::endAdjustmentWithoutStore() {
    // INC is low after the final counted step. Raising CS in this state avoids
    // a nonvolatile-memory store and introduces no additional wiper step.
    digitalWrite(csPin_, HIGH);
    delayMicroseconds(edgeDelayUs_);
    digitalWrite(incPin_, HIGH);
}

void X9c103sDriver::moveSteps(Direction direction, int stepCount) {
    if (stepCount <= 0) {
        return;
    }

    beginAdjustment(direction);

    for (int step = 0; step < stepCount; ++step) {
        digitalWrite(incPin_, LOW);
        delayMicroseconds(edgeDelayUs_);

        if (step + 1 < stepCount) {
            digitalWrite(incPin_, HIGH);
            delayMicroseconds(edgeDelayUs_);
        }
    }

    endAdjustmentWithoutStore();
}