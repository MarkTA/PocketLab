#include <SPI.h>

// ============================================================
// PocketLab DMM Rev A
// ADS1220 20:1-Class Bipolar Divider Breadboard Test
//
// Adafruit nRF52840 Feather
// ============================================================

// ---------------- TEST SELECTION ----------------
//
// Set to 1 for Phase A:
//   12.0 MΩ / 620 kΩ passive divider
//   Internal ADS1220 2.048 V reference
//
// Set to 2 for Phase B:
//   Biased bipolar resistor network
//   External REFP0/REFN0 reference = Feather 3V3
//
constexpr uint8_t TEST_PHASE = 1;


// ---------------- FEATHER PINS ----------------

constexpr uint8_t PIN_CS   = 10;   // Feather D10
constexpr uint8_t PIN_DRDY = 9;    // Feather D9

// SCK, MOSI, and MISO use Feather hardware SPI pins.


// ---------------- ADS1220 COMMANDS ----------------

constexpr uint8_t CMD_RESET      = 0x06;
constexpr uint8_t CMD_START_SYNC = 0x08;
constexpr uint8_t CMD_RDATA      = 0x10;
constexpr uint8_t CMD_RREG_4     = 0x23;  // Read registers 0-3
constexpr uint8_t CMD_WREG_4     = 0x43;  // Write registers 0-3


// ---------------- ADC SETTINGS ----------------

constexpr uint32_t SPI_CLOCK_HZ = 1000000;
constexpr uint32_t DRDY_TIMEOUT_MS = 500;
constexpr bool PRINT_RAW_SAMPLE = true;

// ADS1220 full-scale conversion denominator for signed 24-bit data
constexpr double ADC_COUNTS = 8388608.0;  // 2^23

constexpr double INTERNAL_VREF = 2.048;


// ============================================================
// CALIBRATION / MEASURED VALUES
// ============================================================
//
// Replace nominal values with your actual Fluke measurements
// before doing the final accuracy calculations.

// ---------------- Phase A ----------------

double phaseA_Rhi = 11960000.0;   // four 3 MΩ resistors
double phaseA_Rlo =   620000.0;

double phaseA_Vref = INTERNAL_VREF;


// ---------------- Phase B ----------------
//
//                    12 MΩ
// VIN ---------/\/\/\/\/\/\/\-----+---- VADC
//                                 |
// 3V3 ---- 620k ---- 620k --------+
//                                 |
// GND ---- 620k -- 360k -- 360k --+
//
// REFP0 = measured Feather 3V3
// REFN0 = GND

double phaseB_Rvin = 12000000.0;
double phaseB_R3v3 =  1240000.0;
double phaseB_Rgnd =  1340000.0;

// IMPORTANT:
// Measure the Feather 3V3 rail with the Fluke and enter it here
// before the Phase B accuracy run.
double phaseB_V3v3 = 3.300000;


// ============================================================
// SPI HELPERS
// ============================================================

SPISettings adsSPI(SPI_CLOCK_HZ, MSBFIRST, SPI_MODE1);

void adsSelect()
{
  SPI.beginTransaction(adsSPI);
  digitalWrite(PIN_CS, LOW);
  delayMicroseconds(2);
}

void adsDeselect()
{
  delayMicroseconds(2);
  digitalWrite(PIN_CS, HIGH);
  SPI.endTransaction();
}

void adsCommand(uint8_t command)
{
  adsSelect();
  SPI.transfer(command);
  adsDeselect();
}


// ============================================================
// ADS1220 REGISTER ACCESS
// ============================================================

void adsWriteRegisters(uint8_t r0,
                       uint8_t r1,
                       uint8_t r2,
                       uint8_t r3)
{
  adsSelect();

  SPI.transfer(CMD_WREG_4);
  SPI.transfer(r0);
  SPI.transfer(r1);
  SPI.transfer(r2);
  SPI.transfer(r3);

  adsDeselect();
}


void adsReadRegisters(uint8_t regs[4])
{
  adsSelect();

  SPI.transfer(CMD_RREG_4);

  for (int i = 0; i < 4; i++)
  {
    regs[i] = SPI.transfer(0x00);
  }

  adsDeselect();
}


// ============================================================
// ADS1220 INITIALIZATION
// ============================================================

void adsInit()
{
  adsCommand(CMD_RESET);

  // Datasheet requires at least 50 us + 32 tCLK after RESET.
  // 1 ms is deliberately generous.
  delay(1);

  /*
     CONFIG0
     bits 7:4 MUX  = 0000 -> AIN0 - AIN1
     bits 3:1 GAIN = 000  -> Gain 1
     bit  0 PGA_BYPASS = 1

     CONFIG0 = 0000 0001 = 0x01
  */
  const uint8_t reg0 = 0x01;

  /*
     CONFIG1
     bits 7:5 DR   = 000 -> 20 SPS
     bits 4:3 MODE = 00  -> Normal mode
     bit 2 CM      = 1   -> Continuous conversion
     bit 1 TS      = 0
     bit 0 BCS     = 0

     CONFIG1 = 0000 0100 = 0x04
  */
  const uint8_t reg1 = 0x04;

  /*
     CONFIG2

     Phase A:
       VREF = 00 -> internal 2.048 V
       CONFIG2 = 0x00

     Phase B:
       VREF = 01 -> REFP0 / REFN0 external reference
       CONFIG2 = 0x40

     IDACs off in both cases.
  */
  const uint8_t reg2 = (TEST_PHASE == 2) ? 0x40 : 0x00;

  /*
     CONFIG3
       IDAC routing disabled
       Dedicated DRDY pin used
  */
  const uint8_t reg3 = 0x00;

  adsWriteRegisters(reg0, reg1, reg2, reg3);

  delay(1);

  uint8_t regs[4];
  adsReadRegisters(regs);

  Serial.println();
  Serial.println("ADS1220 register readback:");
  Serial.print("CONFIG0 = 0x");
  Serial.println(regs[0], HEX);

  Serial.print("CONFIG1 = 0x");
  Serial.println(regs[1], HEX);

  Serial.print("CONFIG2 = 0x");
  Serial.println(regs[2], HEX);

  Serial.print("CONFIG3 = 0x");
  Serial.println(regs[3], HEX);

  if (regs[0] != reg0 ||
      regs[1] != reg1 ||
      regs[2] != reg2 ||
      regs[3] != reg3)
  {
    Serial.println("*** REGISTER READBACK FAILED ***");
  }
  else
  {
    Serial.println("Register configuration OK.");
  }

  // Required to begin continuous conversion after CM = 1.
  adsCommand(CMD_START_SYNC);

  delay(100);
}


// ============================================================
// READ 24-BIT ADC RESULT
// ============================================================

int32_t adsReadRaw(uint8_t &b0, uint8_t &b1, uint8_t &b2)
{
  adsSelect();

  // Known-good acquisition method used in the original firmware.
  SPI.transfer(CMD_RDATA);

  b0 = SPI.transfer(0x00);
  b1 = SPI.transfer(0x00);
  b2 = SPI.transfer(0x00);

  adsDeselect();

  uint32_t raw24 =
      ((uint32_t)b0 << 16) |
      ((uint32_t)b1 << 8)  |
      (uint32_t)b2;

  // Sign-extend ADS1220 24-bit two's-complement result.
  if (raw24 & 0x00800000UL)
  {
    raw24 |= 0xFF000000UL;
  }

  return (int32_t)raw24;
}


// ============================================================
// CONVERSION FUNCTIONS
// ============================================================

double adcCodeToVolts(int32_t code)
{
  double vref;

  if (TEST_PHASE == 1)
    vref = phaseA_Vref;
  else
    vref = phaseB_V3v3;

  // Gain = 1 for this test.
  return ((double)code / ADC_COUNTS) * vref;
}


double phaseA_ReconstructVIN(double vsense)
{
  const double ratio =
      (phaseA_Rhi + phaseA_Rlo) / phaseA_Rlo;

  return vsense * ratio;
}


void phaseB_GetTransfer(double &a, double &b)
{
  /*
     Nodal equation:

       (VADC - VIN)/Rvin
     + (VADC - V3V3)/R3v3
     + VADC/Rgnd = 0

     Therefore:

       VADC = a*VIN + b
  */

  const double Gvin = 1.0 / phaseB_Rvin;
  const double G3v3 = 1.0 / phaseB_R3v3;
  const double Ggnd = 1.0 / phaseB_Rgnd;

  const double Gtotal = Gvin + G3v3 + Ggnd;

  a = Gvin / Gtotal;
  b = (phaseB_V3v3 * G3v3) / Gtotal;
}


double phaseB_ReconstructVIN(double vadc)
{
  double a, b;
  phaseB_GetTransfer(a, b);

  return (vadc - b) / a;
}


// ============================================================
// DRDY / DIAGNOSTIC HELPERS
// ============================================================

bool waitForDRDY()
{
  const uint32_t start = millis();

  while (digitalRead(PIN_DRDY) == HIGH)
  {
    if ((millis() - start) >= DRDY_TIMEOUT_MS)
    {
      Serial.println("*** DRDY TIMEOUT ***");
      return false;
    }
  }

  return true;
}

void printRawSample(uint8_t b0, uint8_t b1, uint8_t b2, int32_t code)
{
  Serial.print("raw bytes      = ");

  if (b0 < 0x10) Serial.print("0");
  Serial.print(b0, HEX);
  Serial.print(" ");

  if (b1 < 0x10) Serial.print("0");
  Serial.print(b1, HEX);
  Serial.print(" ");

  if (b2 < 0x10) Serial.print("0");
  Serial.println(b2, HEX);

  Serial.print("raw code       = ");
  Serial.println(code);
}


// ============================================================
// SAMPLE / STATISTICS
// ============================================================

constexpr int SAMPLES_PER_REPORT = 20;

void takeMeasurement()
{
  int64_t sumCode = 0;

  int32_t minCode = INT32_MAX;
  int32_t maxCode = INT32_MIN;

  uint8_t firstB0 = 0;
  uint8_t firstB1 = 0;
  uint8_t firstB2 = 0;
  int32_t firstCode = 0;
  bool haveFirst = false;

  for (int i = 0; i < SAMPLES_PER_REPORT; i++)
  {
    // Dedicated DRDY is active low.
    if (!waitForDRDY())
      return;

    uint8_t b0, b1, b2;
    int32_t code = adsReadRaw(b0, b1, b2);

    if (!haveFirst)
    {
      firstB0 = b0;
      firstB1 = b1;
      firstB2 = b2;
      firstCode = code;
      haveFirst = true;
    }

    sumCode += code;

    if (code < minCode) minCode = code;
    if (code > maxCode) maxCode = code;
  }

  double avgCode =
      (double)sumCode / (double)SAMPLES_PER_REPORT;

  double measuredADC =
      (avgCode / ADC_COUNTS) *
      ((TEST_PHASE == 1) ? phaseA_Vref : phaseB_V3v3);

  double minV =
      adcCodeToVolts(minCode);

  double maxV =
      adcCodeToVolts(maxCode);

  double reconstructedVIN;

  if (TEST_PHASE == 1)
    reconstructedVIN = phaseA_ReconstructVIN(measuredADC);
  else
    reconstructedVIN = phaseB_ReconstructVIN(measuredADC);


  Serial.println();
  Serial.println("----------------------------------------");

  if (PRINT_RAW_SAMPLE && haveFirst)
  {
    printRawSample(firstB0, firstB1, firstB2, firstCode);
  }

  Serial.print("avg_code       = ");
  Serial.println(avgCode, 1);

  Serial.print("ADC node       = ");
  Serial.print(measuredADC, 6);
  Serial.println(" V");

  Serial.print("span           = ");
  Serial.print((maxV - minV) * 1000000.0, 2);
  Serial.println(" uV");

  Serial.print("VIN reconstructed = ");
  Serial.print(reconstructedVIN, 6);
  Serial.println(" V");

  if (TEST_PHASE == 1)
  {
    const double ratio =
        (phaseA_Rhi + phaseA_Rlo) / phaseA_Rlo;

    Serial.print("divider ratio  = ");
    Serial.print(ratio, 6);
    Serial.println(":1");
  }
  else
  {
    double a, b;
    phaseB_GetTransfer(a, b);

    Serial.print("transfer a     = ");
    Serial.println(a, 9);

    Serial.print("transfer b     = ");
    Serial.print(b, 6);
    Serial.println(" V");

    Serial.print("scale 1/a      = ");
    Serial.println(1.0 / a, 6);
  }
}


// ============================================================
// SETUP
// ============================================================

void setup()
{
  pinMode(PIN_CS, OUTPUT);
  digitalWrite(PIN_CS, HIGH);

  pinMode(PIN_DRDY, INPUT);

  Serial.begin(115200);

  // Don't block forever if USB serial isn't opened.
  unsigned long startWait = millis();
  while (!Serial && (millis() - startWait < 5000))
  {
    delay(10);
  }

  Serial.println();
  Serial.println("========================================");
  Serial.println("PocketLab DMM ADS1220 Breadboard Test");
  Serial.println("========================================");
  Serial.println("Acquisition: RDATA, 1 MHz, SPI MODE1");

  Serial.print("Test phase: ");
  Serial.println(TEST_PHASE);

  SPI.begin();

  adsInit();

  if (TEST_PHASE == 1)
  {
    Serial.println();
    Serial.println("PHASE A");
    Serial.println("Passive 12.0M / 620k divider test");
    Serial.println("ADS1220 internal 2.048 V reference");
  }
  else
  {
    double a, b;
    phaseB_GetTransfer(a, b);

    Serial.println();
    Serial.println("PHASE B");
    Serial.println("Biased bipolar direct-ADC test");
    Serial.print("External VREF entered as: ");
    Serial.print(phaseB_V3v3, 6);
    Serial.println(" V");

    Serial.print("Expected zero-input VADC: ");
    Serial.print(b, 6);
    Serial.println(" V");

    Serial.print("Expected transfer slope: ");
    Serial.println(a, 9);
  }
}


// ============================================================
// LOOP
// ============================================================

void loop()
{
  takeMeasurement();
}