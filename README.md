# PocketLab

PocketLab is a modular, portable electronics instrumentation platform designed to combine common bench tools with a mobile interface.

The system is built around a compact **Bluetooth Low Energy (BLE) digital multimeter**, with additional instruments designed as stackable hardware modules. The goal is to create a practical, low-cost electronics lab that can travel with a laptop or fit in a small work area.

## Current Development

The first hardware prototype, **PocketLab DMM EVT-0**, is currently in PCB development.

### DMM EVT-0

- **Nordic nRF52840** BLE microcontroller
- **TI ADS1220** 24-bit delta-sigma ADC
- Voltage and resistance measurement
- Relay-based measurement routing
- USB-C power and charging
- Battery-powered portable operation
- 4-layer custom PCB designed in **Altium Designer**
- Stackable interface for future PocketLab instrument modules
- BLE communication with the PocketLab mobile application

EVT-0 is intentionally focused on validating the complete hardware/software system: PCB design, assembly, measurement circuitry, calibration, firmware, BLE communication, and mobile application integration.

## Planned Modules

PocketLab is designed as a modular platform rather than a single instrument.

Planned development includes:

- **FPGA Oscilloscope** — high-speed single-channel acquisition using an AMD Artix-7 FPGA and TI ADS6125 12-bit, 125 MS/s ADC
- **Function Generator**
- Additional measurement and electronics-development modules

## Software

PocketLab includes a companion mobile application for instrument control, measurement display, data logging, and interaction with connected modules.

The application is being developed with **React Native** and communicates with PocketLab hardware over Bluetooth Low Energy.

## Project Goals

PocketLab is also an ongoing engineering platform for developing experience in:

- Mixed-signal circuit design
- PCB schematic capture and layout
- Embedded systems
- Bluetooth Low Energy
- Precision data acquisition
- FPGA and RTL development
- Hardware/software integration
- Test, calibration, and design validation

## License

The software in this repository is licensed under the Apache License 2.0.