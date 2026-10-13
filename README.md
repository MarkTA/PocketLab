# PocketLab

**Measure. Understand. Build.**

PocketLab is an experimental, low-cost **Bluetooth digital multimeter and companion app** designed to make electronics work more intuitive. Instead of simply displaying a measurement, PocketLab aims to help you *use* it: save a reading, explore what it means, and carry it directly into a circuit-design tool.

The goal is to bring useful bench measurements and practical design assistance together in one portable experience for students, makers, and electronics hobbyists.

> **Project status:** Active prototype development. PocketLab is not yet a finished or safety-certified measuring instrument.

## The idea

A conventional multimeter tells you a voltage or resistance. PocketLab is being designed to make the next step easier.

For example, the intended workflow is to measure a supply voltage, save the result, open a voltage-divider tool, and use that measured value as the input to calculate practical resistor combinations. Similar workflows could help with identifying unknown components, visualizing measurements, and troubleshooting simple circuits.

The focus is on **useful measurements, approachable tools, and a seamless connection between hardware and software**.

## Current development

Development is centered on the **PocketLab DMM EVT1** prototype and its integration with the mobile app.

| Area | Status |
| --- | --- |
| Custom DMM hardware | EVT1 PCB assembled; hardware bring-up and validation in progress |
| BLE connectivity | Prototype firmware and app integration under active development |
| DC voltage and resistance | Measurement routines implemented in firmware; calibration and end-to-end validation ongoing |
| Mobile interface | React Native / Expo app in development |
| Design-assist workflows | Product direction; features being developed incrementally |
| Current, continuity, and component identification | Planned for future hardware iterations |

### EVT1 hardware

The current prototype uses:

- **Nordic nRF52840** for Bluetooth Low Energy communication
- **Texas Instruments ADS1220** 24-bit delta-sigma ADC
- Relay-controlled measurement routing and resistance-ranging circuitry
- Custom mixed-signal PCB designed in Altium Designer
- Battery-powered operation

EVT1 is primarily an engineering validation platform. A simpler, lower-cost design with more everyday multimeter functions is being explored for a future revision.

## Software and firmware

**Mobile app:** React Native, Expo, TypeScript, and `react-native-ble-plx`. The app is intended to provide a measurement interface, device control, and tools that turn readings into useful design inputs.

**Embedded firmware:** C with Zephyr / Nordic nRF Connect SDK. The current EVT1 firmware includes BLE command/response handling and work-in-progress voltage and resistance measurement support.

### Repository structure

```text
PocketLab/
├── mobile/            # React Native / Expo application
├── firmware_nrf52/    # nRF52 / Zephyr firmware for DMM EVT1
├── firmware_test/     # Earlier firmware experiments
├── README.md
└── LICENSE
```

Hardware CAD projects are maintained separately from the public application and firmware repository.

## Getting started

### Mobile app

You'll need Node.js, npm, and an Android development environment for a native BLE build.

```bash
cd mobile
npm ci
npm run android
```

After installing the development build, start the Expo development server with:

```bash
npm start
```

**Note:** BLE features require native modules and will not work in standard Expo Go. A physical BLE-capable device is recommended for hardware testing.

### nRF52 firmware

The firmware is currently developed using **Nordic nRF Connect SDK 3.4.1** and a Zephyr build target based on the **nRF52840 DK**.

In an nRF Connect / Zephyr-enabled terminal:

```bash
cd firmware_nrf52
west build -b nrf52840dk/nrf52840 -p always .
```

Flashing and debugging the custom EVT1 board requires the appropriate SWD/J-Link setup. The firmware is still under development, so building it does not imply that every hardware feature is fully tested.

## Roadmap

Current areas of exploration include:

- Completing EVT1 measurements, calibration, and BLE-to-app integration
- Adding current measurement and responsive audible continuity testing
- Developing an integrated component identifier for common discrete components
- Building measurement-aware design tools, starting with practical circuit calculations
- Exploring measurement history, graphs, and guided circuit-building workflows
- Reducing hardware cost and complexity for a more accessible future DMM

These are development goals, not promises of completed features. Earlier modular-instrument concepts remain possible longer-term experiments, but the present focus is a capable, affordable standalone DMM and its companion app.

## Safety and limitations

PocketLab prototypes are intended for **low-voltage electronics experimentation**. They are **not CAT-rated, certified for mains measurements, or suitable for safety-critical use**. Measurement accuracy, input protection, and safe operating limits are still being validated; do not rely on prototype readings as a safety check.

## License

Software in this repository is licensed under the [Apache License 2.0](LICENSE). Hardware design files are maintained separately.
