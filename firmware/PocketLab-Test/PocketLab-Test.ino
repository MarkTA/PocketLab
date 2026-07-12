#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>

constexpr char SERVICE_UUID[] =
    "7a110001-2d44-4a73-a8f1-3d9ea01c0001";

constexpr char CHARACTERISTIC_UUID[] =
    "7a110002-2d44-4a73-a8f1-3d9ea01c0001";

class CharacteristicCallbacks : public BLECharacteristicCallbacks {
public:
    void onRead(BLECharacteristic* characteristic) override {
        String value = characteristic->getValue();

        Serial.printf(
            "READ length=%u value=%s\n",
            static_cast<unsigned int>(value.length()),
            value.c_str()
        );
    }

    void onWrite(BLECharacteristic* characteristic) override {
        String value = characteristic->getValue();

        Serial.printf(
            "WRITE length=%u value=%s\n",
            static_cast<unsigned int>(value.length()),
            value.c_str()
        );
    }
};

CharacteristicCallbacks callbacks;

void setup() {
    Serial.begin(115200);
    delay(500);

    BLEDevice::init("PocketLab-Bluedroid");

    BLEServer* server =
        BLEDevice::createServer();

    BLEService* service =
        server->createService(SERVICE_UUID);

    BLECharacteristic* characteristic =
        service->createCharacteristic(
            CHARACTERISTIC_UUID,
            BLECharacteristic::PROPERTY_READ |
            BLECharacteristic::PROPERTY_WRITE |
            BLECharacteristic::PROPERTY_WRITE_NR
        );

    characteristic->setValue("EMPTY");
    characteristic->setCallbacks(&callbacks);

    service->start();

    BLEAdvertising* advertising =
        BLEDevice::getAdvertising();

    advertising->addServiceUUID(SERVICE_UUID);
    advertising->setScanResponse(true);
    advertising->start();

    Serial.println("PocketLab-Bluedroid ready");
}

void loop() {
    delay(1000);
}