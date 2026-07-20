# PocketLab Phone-Case Multimeter Concept

**Recorded:** July 16, 2026  
**Status:** Future project idea—defer until the current PocketLab function generator is complete

## Concept

A compact, low-voltage digital multimeter integrated into—or attached to—a phone case. The phone supplies the display, controls, graphing, data logging, and user interface through a native mobile app. A thin measurement module contains the analog front end, precision ADC, low-power nRF52 microcontroller, BLE interface, and power source.

The defining physical feature would be two independently retractable probes with approximately 12-inch leads. Each probe would store along the edge of the case, while its wire retracts into a replaceable twin-reel cartridge on the back of the phone.

## Initial Product Scope

- Low-voltage electronics use only
- Approximately 0–30 V DC measurement
- Resistance and continuity
- Diode test
- Live numeric display and scrolling graph
- Automatic BLE connection and offline operation
- Measurement history and data export
- Two independent 12-inch retractable probes
- No mains rating
- No current measurement in the first version

## Proposed Architecture

- nRF52 MCU/module for low-power BLE and measurement control
- External precision ADC
- Protected, autoranging analog front end
- Thin rechargeable battery, coin cell, or USB-C power
- React Native PocketLab app as the display and interface
- Modular electronics pod compatible with multiple phone-specific shells
- 3D-printed enclosure prototypes using PETG, with optional TPU phone-retention features

## Retractable-Probe Design

- Two side-by-side reels, approximately 25–30 mm in diameter
- Thin, flexible 28–30 AWG silicone-insulated wire
- Constant-force or clock-style return springs
- Pull-and-lock ratchet with tug-to-release retraction
- Short probes stored in molded channels along the phone edges
- Replaceable reel/probe cartridge for serviceability
- Prefer a limited-rotation flexible clock-spring electrical connection instead of sliding contacts or inexpensive slip rings
- Calibrate and subtract lead resistance for continuity and low-resistance measurements

## Product Differentiators

- Always available because it stays attached to the phone
- Self-storing probes with no separate lead pouch
- Phone-quality display, controls, graphing, and logging
- Pocketable low-voltage electronics tool for students, makers, embedded developers, and technicians
- Fast, memorable demonstration for interviews and professional networking
- Potential foundation for additional PocketLab modules, including a function generator, oscilloscope, and logic analyzer

## Important Engineering Questions

- Can the twin-reel mechanism remain thin, smooth, and reliable over thousands of cycles?
- Can the rotating electrical connection maintain stable resistance without adding noise?
- What reel and probe geometry is comfortable in a pocket?
- How should the instrument pod attach across different phone models?
- What input protection is appropriate for the stated 30 V maximum?
- What accuracy, sample rate, battery life, and production cost are achievable?
- Does the mechanical design contain protectable intellectual property, and what related prior art exists?

## Recommended Future Development Sequence

1. Inventory the available nRF52 modules and development board.
2. Build a bench prototype that measures 0–5 V DC and sends readings to the PocketLab app over BLE.
3. Characterize accuracy, noise, update rate, and power consumption.
4. Disassemble inexpensive badge reels or retractable cable mechanisms for dimensional and durability studies.
5. Print a non-electronic PETG phone-case mockup with a twin-reel cartridge.
6. Develop and cycle-test the reel, ratchet, probe storage, and clock-spring connection.
7. Combine the mechanical prototype with the measurement electronics.
8. Expand to 0–30 V, resistance, continuity, and diode modes.
9. Conduct prior-art, market, manufacturability, and cost studies before designing a production PCB.

## Current Decision

Preserve this concept for later development without interrupting the present PocketLab function-generator work. Finish and document the function generator first, then revisit the phone-case multimeter as a potential second PocketLab instrument and commercial product.