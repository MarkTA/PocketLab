constexpr int RELAY_PIN = 25;

void setup() {
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);  // Relay safely off at startup
}

void loop() {
  // digitalWrite(RELAY_PIN, HIGH); // Energize relay
  // delay(10000);

  digitalWrite(RELAY_PIN, LOW);  // Release relay
  delay(10000);
}