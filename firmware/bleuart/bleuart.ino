#include <bluefruit.h>
#include <Adafruit_TinyUSB.h>

BLEUart bleuart;

void setup()
{
  Serial.begin(115200);
  delay(2000);

  Serial.println("1: Serial alive");
  Serial.flush();

  delay(1000);

  Serial.println("2: Before Bluefruit.begin()");
  Serial.flush();

  Bluefruit.begin();

  Serial.println("3: After Bluefruit.begin()");
  Serial.flush();

  Bluefruit.setName("PocketLab");

  Serial.println("4: Name set");
  Serial.flush();

  bleuart.begin();

  Serial.println("5: BLE UART started");
  Serial.flush();

  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  Bluefruit.Advertising.addService(bleuart);
  Bluefruit.ScanResponse.addName();
  Bluefruit.Advertising.start(0);

  Serial.println("6: Advertising");
  Serial.flush();
}

void loop()
{
  delay(1000);
  Serial.println("loop");
}