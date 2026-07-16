#!/usr/bin/env python3
"""Display the PocketLab fixed-gain OP484 amplifier schematic.

Install and run:
    python -m pip install schemdraw matplotlib
    python PocketLab_OP484_Amplifier_Schematic.py

The schematic opens in an interactive Matplotlib window. Close the window
to return to the terminal. The script does not automatically save any files.

The drawing assumes OP484 amplifier A (DIP-14): OUT=1, IN-=2, IN+=3,
V+=4, and V-=11. If another amplifier section is used, change the pin
labels to match that section while keeping the same electrical topology.
"""

import matplotlib.pyplot as plt
import schemdraw
import schemdraw.elements as elm


def build_schematic() -> schemdraw.Drawing:
    schemdraw.config(unit=3.0, fontsize=12, lw=1.8)
    d = schemdraw.Drawing(show=False)

    # Title and operating notes
    d += elm.Label().at((5.8, 7.2)).label(
        "PocketLab — AD9833 AC-Coupled OP484 Amplifier",
        fontsize=17,
        halign="center",
    )
    d += elm.Label().at((5.8, 6.65)).label(
        "Fixed non-inverting gain about buffered VREF",
        fontsize=11,
        halign="center",
    )

    # Signal input and AC coupling.
    d += elm.SourceSin().at((-1.0, 2.0)).up().label(
        "AD9833 OUT\n≈0.62 Vpp",
        loc="left",
    )
    d += elm.Ground().at((-1.0, 2.0))
    d += elm.Line().at((-1.0, 5.0)).right().length(1.0)
    d += elm.Capacitor().right().label("C1  1 µF\nAC coupling")
    d += elm.Line().right().length(1.0)
    input_node = d.here
    d += elm.Dot().label("TP1", loc="top")

    # Op-amp, using channel A pin labels.
    op = elm.Opamp().at((7.0, 4.1)).right().label("U1A\nOP484", loc="center")
    d += op
    d += elm.Wire().at(input_node).to(op.in2)
    d += elm.Label().at((6.35, 3.33)).label("3  (+)", fontsize=10, halign="right")
    d += elm.Label().at((6.35, 4.87)).label("2  (−)", fontsize=10, halign="right")

    # Output and output test point.
    d += elm.Line().at(op.out).right().length(1.7)
    output_node = d.here
    d += elm.Dot().label("TP2", loc="top")
    d += elm.Line().right().length(0.8).label("VOUT\n≈4.3 Vpp max", loc="right")
    d += elm.Label().at((8.7, 4.1)).label("1  OUT", fontsize=10, halign="left")

    # Feedback resistor from output to the inverting input.
    d += elm.Line().at(output_node).up().length(1.5)
    d += elm.Resistor().left().length(3.0).label("Rf  62.0 kΩ", loc="top")
    d += elm.Wire().to(op.in1)
    d += elm.Dot().at(op.in1)

    # Buffered VREF rail. Both Rbias and Rg MUST return here, not to ground.
    vref_y = 0.7
    d += elm.Line().at((0.0, vref_y)).right().length(8.1).color("#2166ac")
    d += elm.Label().at((0.0, vref_y)).label(
        "BUFFERED VREF ≈ 2.4 V",
        color="#2166ac",
        halign="left",
        valign="bottom",
    )
    d += elm.Dot().at((7.4, vref_y)).label("TP3", loc="bottom", color="#2166ac")

    # Input bias resistor from the post-capacitor node to VREF.
    d += elm.Resistor().at(input_node).down().to((input_node[0], vref_y)).label(
        "Rbias  10 kΩ",
        loc="right",
    )
    d += elm.Dot().at((input_node[0], vref_y))

    # Gain-setting resistor from inverting input to VREF.
    d += elm.Resistor().at(op.in1).down().to((op.in1[0], vref_y)).label(
        "Rg  10.19 kΩ",
        loc="right",
    )
    d += elm.Dot().at((op.in1[0], vref_y))

    # Oscilloscope test-point key.
    d += elm.Label().at((10.0, 5.65)).label(
        "OSCILLOSCOPE CONNECTIONS",
        fontsize=11,
        halign="left",
    )
    d += elm.Label().at((10.0, 5.05)).label(
        "C1+ → TP1 (coupled input)\n"
        "C2+ → TP2 (amplifier output)\n"
        "C1−, C2− → circuit GND",
        halign="left",
        valign="top",
        fontsize=10,
    )

    # Supply/decoupling inset. Power pins are shared by all four amplifiers.
    d += elm.Label().at((10.0, 2.8)).label(
        "OP484 power (shared)",
        fontsize=11,
        halign="left",
    )
    d += elm.Line().at((10.0, 2.35)).right().length(2.3).label("+5 V → pin 4", loc="top")
    d += elm.Dot().at((10.8, 2.35))
    d += elm.Capacitor().at((10.8, 2.35)).down().length(1.0).label("C2\n100 nF", loc="left")
    d += elm.Ground()
    d += elm.Dot().at((11.8, 2.35))
    d += elm.Capacitor(polar=True).at((11.8, 2.35)).down().length(1.0).label(
        "C3\n10 µF",
        loc="right",
    )
    d += elm.Ground()
    d += elm.Label().at((10.0, 0.85)).label("GND → pin 11", halign="left")

    # Design equations and wiring warning.
    d += elm.Label().at((0.0, -0.15)).label(
        "Av = 1 + Rf/Rg = 1 + 62.0k/10.19k ≈ 7.08",
        halign="left",
        fontsize=11,
    )
    d += elm.Label().at((0.0, -0.65)).label(
        "VOUT = VREF + Av(VIN − VREF)",
        halign="left",
        fontsize=11,
    )
    d += elm.Label().at((6.4, -0.4)).label(
        "Important: Rbias and Rg connect to buffered VREF — not GND.",
        color="#b2182b",
        halign="left",
        fontsize=11,
    )

    return d


def main() -> None:
    drawing = build_schematic()
    drawing.draw(show=False)
    plt.show()


if __name__ == "__main__":
    main()