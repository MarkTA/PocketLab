/*
  X9C103S Manual Amplitude Test
  ESP32 NodeMCU-32S

  Wiring:
    X9C CS  -> GPIO25
    X9C INC -> GPIO26
    X9C U/D -> GPIO27
    X9C VCC -> 4.75 V
    X9C GND -> common ground

    VH -> post-47 uF conditioned signal node
    VL -> buffered VREF (2.375 V)
    VW -> OP484 pin 3

  Serial commands:
    0, 25, 50, 75, 100  Set amplitude percentage
    +                    Increase one wiper step
    -                    Decrease one wiper step
    z                    Move to VL endpoint
    h                    Move to VH endpoint
    ?                    Show help/status

  Serial Monitor:
    Baud: 115200
    Line ending: Newline
*/

#include <Arduino.h>

constexpr uint8_t X9C_CS_PIN  = 25;
constexpr uint8_t X9C_INC_PIN = 26;
constexpr uint8_t X9C_UD_PIN  = 27;

constexpr int X9C_MAX_POSITION = 99;

// Conservative timing. The X9C103S only requires microsecond-scale timing.
constexpr unsigned int X9C_DELAY_US = 10;

int currentPosition = 0;

// U/D HIGH moves VW toward VH.
// U/D LOW moves VW toward VL.
enum class WiperDirection {
  TowardVL,
  TowardVH
};

void beginAdjustment(WiperDirection direction)
{
  // INC must be high before selecting the device.
  digitalWrite(X9C_INC_PIN, HIGH);

  digitalWrite(
    X9C_UD_PIN,
    direction == WiperDirection::TowardVH ? HIGH : LOW
  );

  delayMicroseconds(X9C_DELAY_US);

  // Select the X9C103S.
  digitalWrite(X9C_CS_PIN, LOW);
  delayMicroseconds(X9C_DELAY_US);
}

void pulseIncrement()
{
  // The wiper changes on the falling edge of INC.
  digitalWrite(X9C_INC_PIN, LOW);
  delayMicroseconds(X9C_DELAY_US);

  digitalWrite(X9C_INC_PIN, HIGH);
  delayMicroseconds(X9C_DELAY_US);
}

void endAdjustmentWithoutStore()
{
  /*
    Raise CS while INC is LOW to avoid storing the current position
    in the X9C103S nonvolatile memory.
  */
  digitalWrite(X9C_INC_PIN, LOW);
  delayMicroseconds(X9C_DELAY_US);

  digitalWrite(X9C_CS_PIN, HIGH);
  delayMicroseconds(X9C_DELAY_US);

  // Return INC to its idle-high state after the device is deselected.
  digitalWrite(X9C_INC_PIN, HIGH);
}

void moveSteps(WiperDirection direction, int steps)
{
  if (steps <= 0) {
    return;
  }

  beginAdjustment(direction);

  for (int i = 0; i < steps; i++) {
    pulseIncrement();
  }

  endAdjustmentWithoutStore();
}

void initializeAtVL()
{
  Serial.println("Forcing wiper to the VL endpoint...");

  /*
    The saved power-up position is unknown. Sending 100 downward
    steps guarantees that the wiper reaches VL regardless of its
    initial position. Extra pulses at the endpoint have no effect.
  */
  moveSteps(WiperDirection::TowardVL, 100);

  currentPosition = 0;

  Serial.println("Wiper initialized at VL: 0%");
}

void setPosition(int requestedPosition)
{
  requestedPosition =
    constrain(requestedPosition, 0, X9C_MAX_POSITION);

  int difference = requestedPosition - currentPosition;

  if (difference > 0) {
    moveSteps(WiperDirection::TowardVH, difference);
  }
  else if (difference < 0) {
    moveSteps(WiperDirection::TowardVL, -difference);
  }

  currentPosition = requestedPosition;

  float percentage =
    100.0f * currentPosition / X9C_MAX_POSITION;

  Serial.printf(
    "Wiper position: %d/99 (%.1f%%)\n",
    currentPosition,
    percentage
  );
}

void setPercentage(int percentage)
{
  percentage = constrain(percentage, 0, 100);

  int position = lroundf(
    X9C_MAX_POSITION * percentage / 100.0f
  );

  Serial.printf("Requested amplitude: %d%%\n", percentage);
  setPosition(position);
}

void printHelp()
{
  Serial.println();
  Serial.println("X9C103S commands:");
  Serial.println("  0     Move to VL (approximately 0% amplitude)");
  Serial.println("  25    Set approximately 25% amplitude");
  Serial.println("  50    Set approximately 50% amplitude");
  Serial.println("  75    Set approximately 75% amplitude");
  Serial.println("  100   Move to VH (approximately 100% amplitude)");
  Serial.println("  +     Move one step toward VH");
  Serial.println("  -     Move one step toward VL");
  Serial.println("  z     Force the wiper to the VL endpoint");
  Serial.println("  h     Move to the VH endpoint");
  Serial.println("  ?     Show this help");
  Serial.println();
}

void processCommand(String command)
{
  command.trim();
  command.toLowerCase();

  if (command.length() == 0) {
    return;
  }

  if (command == "+") {
    setPosition(currentPosition + 1);
  }
  else if (command == "-") {
    setPosition(currentPosition - 1);
  }
  else if (command == "z") {
    initializeAtVL();
  }
  else if (command == "h") {
    setPosition(X9C_MAX_POSITION);
  }
  else if (command == "?") {
    printHelp();
    Serial.printf("Current position: %d/99\n", currentPosition);
  }
  else if (
    command == "0"   ||
    command == "25"  ||
    command == "50"  ||
    command == "75"  ||
    command == "100"
  ) {
    setPercentage(command.toInt());
  }
  else {
    Serial.print("Unknown command: ");
    Serial.println(command);
    printHelp();
  }
}

void setup()
{
  Serial.begin(115200);
  delay(500);

  /*
    Establish safe output levels before changing the pins to outputs.
    CS starts high so the X9C103S remains deselected.
  */
  digitalWrite(X9C_CS_PIN, HIGH);
  digitalWrite(X9C_INC_PIN, HIGH);
  digitalWrite(X9C_UD_PIN, LOW);

  pinMode(X9C_CS_PIN, OUTPUT);
  pinMode(X9C_INC_PIN, OUTPUT);
  pinMode(X9C_UD_PIN, OUTPUT);

  delay(100);

  Serial.println();
  Serial.println("================================");
  Serial.println(" X9C103S Manual Amplitude Test");
  Serial.println("================================");
  Serial.println("VREF expected: 2.375 V");
  Serial.println("X9C VCC expected: 4.75 V");

  initializeAtVL();
  printHelp();
}

void loop()
{
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    processCommand(command);
  }
}
