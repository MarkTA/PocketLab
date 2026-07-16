#!/usr/bin/env python3
"""Interactive first-draft PocketLab breadboard wiring diagram.

Requirements:
    python -m pip install schemdraw matplotlib

Run:
    python PocketLab_Breadboard_Mockup.py

This script displays the drawing and does not automatically save an image.
Edit the PLACEMENT section to match your physical breadboard.
"""

import matplotlib.pyplot as plt
import schemdraw
import schemdraw.elements as elm
from schemdraw import pictorial


# ---------------------------------------------------------------------------
# PLACEMENT — change these rows first to match the physical breadboard.
# ---------------------------------------------------------------------------

OP484_FIRST_ROW = 15       # DIP spans rows 15 through 21
VREF_DIVIDER_ROW = 8
COUPLING_START_ROW = 25
COUPLING_END_ROW = 26       # pictorial ceramic capacitor uses adjacent holes
BREADBOARD_GAP = pictorial.PINSPACING

# As-built values
RF_OHMS = 62_000
RG_OHMS = 10_190
RBIAS_OHMS = 10_150
VREF_TOP_OHMS = 10_190
VREF_BOTTOM_OHMS = 10_180
COUPLING_CAP_UF = 10

# Wire colors by function
COLOR_5V = "#d62728"
COLOR_3V3 = "#ff7f0e"
COLOR_GND = "#222222"
COLOR_VREF_RAW = "#9467bd"
COLOR_VREF_BUFFERED = "#6f42c1"
COLOR_SIGNAL = "#2ca02c"
COLOR_FEEDBACK = "#17becf"
COLOR_SPI = "#1f77b4"

# Label readability. Set alpha closer to 1.0 for a more opaque background.
LABEL_BACKGROUND = "white"
LABEL_BACKGROUND_ALPHA = 0.88
LABEL_BACKGROUND_PADDING = 1.5


def make_nodemcu():
    """Compact top-view NodeMCU block containing the pins used by PocketLab."""
    pins = [
        elm.IcPin(name="3V3", side="left", pin="", anchorname="V3V3"),
        elm.IcPin(name="5V", side="left", pin="", anchorname="V5"),
        elm.IcPin(name="GND", side="left", pin="", anchorname="GND"),
        elm.IcPin(name="GPIO23", side="right", pin="", anchorname="GPIO23"),
        elm.IcPin(name="GPIO18", side="right", pin="", anchorname="GPIO18"),
        elm.IcPin(name="GPIO5", side="right", pin="", anchorname="GPIO5"),
    ]
    return (
        elm.Ic(pins=pins, pinspacing=0.8, edgepadW=0.8)
        .label("NodeMCU-32S\nTOP VIEW\nUSB ↓", loc="center", fontsize=10)
    )


def make_ad9833():
    """AD9833 front/component view; order is reversed from the back photo."""
    names = ["OUT", "AGND", "FSYNC", "SCLK", "SDATA", "DGND", "VCC"]
    pins = [
        elm.IcPin(
            name=name,
            side="left",
            pin="",
            slot=f"{index + 1}/{len(names)}",
            anchorname=name,
        )
        for index, name in enumerate(names)
    ]
    return (
        elm.Ic(pins=pins, pinspacing=0.65, edgepadW=0.8)
        .label("AD9833\nFRONT VIEW", loc="center", fontsize=10)
    )


def jumper(drawing, start, end, color, label=None, shape="|-", width=3):
    """Draw one breadboard/module jumper."""
    wire = elm.Wire(shape=shape).at(start).to(end).color(color).linewidth(width)
    if label:
        wire = wire.label(label, loc="top", fontsize=8)
    drawing += wire


def breadboard_hole(bb1, bb2, column, row):
    """Return a center-strip hole using global row numbers 1 through 60."""
    if not 1 <= row <= 60:
        raise ValueError("Breadboard row must be between 1 and 60")
    board = bb1 if row <= 30 else bb2
    local_row = row if row <= 30 else row - 30
    return getattr(board, f"{column.upper()}{local_row}")


def power_hole(bb1, bb2, strip, row):
    """Return a power-strip hole on L1, L2, R1, or R2 using rows 1–60.

    Schemdraw omits the break positions in each power strip. If an anchor is
    unavailable, move the requested row to the next populated power hole.
    """
    if not 1 <= row <= 60:
        raise ValueError("Power-strip row must be between 1 and 60")
    board = bb1 if row <= 30 else bb2
    local_row = row if row <= 30 else row - 30
    anchor = f"{strip.upper()}_{local_row}"
    if not hasattr(board, anchor):
        raise ValueError(f"Power-strip position {strip} row {row} is a rail break")
    return getattr(board, anchor)


def build_breadboard_drawing():
    d = schemdraw.Drawing(show=False)
    d.config(fontsize=10, lw=1.5)

    # Two physical 30-row boards placed end-to-end. bb is retained as an
    # alias for bb1 so the original rows 1–30 remain easy to edit.
    bb1 = pictorial.Breadboard().at((0, 0)).up()
    d += bb1
    bb2 = (
        pictorial.Breadboard()
        .at((30 * pictorial.PINSPACING + BREADBOARD_GAP, 0))
        .up()
    )
    d += bb2
    bb = bb1

    # The DIP is placed across the center trench. Schemdraw's DIP exposes
    # anchors pin1 through pin14 in physical top-view order.
    op = (
        pictorial.DIP(npins=14)
        .at(getattr(bb, f"E{OP484_FIRST_ROW}"))
        .up()
        .label("OP484\nnotch ↑", loc="center", fontsize=8)
    )
    d += op

    # ------------------------------------------------------------------
    # OP484 hardwire follower connections.
    # B: 7-6, C: 8-9, D: 14-13. Pins 5, 10, and 12 share raw VREF.
    # ------------------------------------------------------------------
    jumper(d, op.pin7, op.pin6, COLOR_VREF_BUFFERED, "B follower: 7–6")
    jumper(d, op.pin8, op.pin9, COLOR_VREF_RAW, "C follower: 8–9")
    jumper(d, op.pin14, op.pin13, COLOR_VREF_RAW, "D follower: 14–13")

    raw_vref_bus = getattr(bb, f"A{VREF_DIVIDER_ROW}")
    jumper(d, op.pin5, raw_vref_bus, COLOR_VREF_RAW, "raw VREF")
    jumper(d, op.pin10, raw_vref_bus, COLOR_VREF_RAW)
    jumper(d, op.pin12, raw_vref_bus, COLOR_VREF_RAW)

    # ------------------------------------------------------------------
    # VREF divider: 10.19 kΩ from +5 V and 10.18 kΩ to ground.
    # These locations are intentionally easy to edit.
    # ------------------------------------------------------------------
    d += (
        pictorial.Resistor(VREF_TOP_OHMS)
        .at(getattr(bb, f"A{VREF_DIVIDER_ROW}"))
        .to(getattr(bb, f"L2_{VREF_DIVIDER_ROW}"))
        .label("10.19 kΩ", loc="top", fontsize=8)
    )
    d += (
        pictorial.Resistor(VREF_BOTTOM_OHMS)
        .at(getattr(bb, f"B{VREF_DIVIDER_ROW}"))
        .to(getattr(bb, f"R2_{VREF_DIVIDER_ROW}"))
        .label("10.18 kΩ", loc="bottom", fontsize=8)
    )

    # Power-rail jumpers to OP484 pins 4 and 11.
    jumper(d, op.pin4, getattr(bb, "L2_4"), COLOR_5V, "pin 4: +5 V")
    jumper(d, op.pin11, getattr(bb, "R2_4"), COLOR_GND, "pin 11: GND")

    # ------------------------------------------------------------------
    # Channel A gain stage.
    # Rf: pin 1 to pin 2. Rg: pin 2 to buffered VREF at pin 7.
    # Rbias: pin 3 to buffered VREF at pin 7.
    # ------------------------------------------------------------------
    d += (
        pictorial.Resistor(RF_OHMS)
        .at(op.pin1)
        .to(getattr(bb, f"A{OP484_FIRST_ROW - 2}"))
        .label("Rf 62.0 kΩ", loc="top", fontsize=8)
    )
    jumper(
        d,
        getattr(bb, f"A{OP484_FIRST_ROW - 2}"),
        op.pin2,
        COLOR_FEEDBACK,
    )

    d += (
        pictorial.Resistor(RG_OHMS)
        .at(op.pin2)
        .to(getattr(bb, f"A{OP484_FIRST_ROW + 9}"))
        .label("Rg 10.19 kΩ", loc="left", fontsize=8)
    )
    jumper(
        d,
        getattr(bb, f"A{OP484_FIRST_ROW + 9}"),
        op.pin7,
        COLOR_VREF_BUFFERED,
    )

    d += (
        pictorial.Resistor(RBIAS_OHMS)
        .at(op.pin3)
        .to(getattr(bb, f"B{OP484_FIRST_ROW + 10}"))
        .label("Rbias 10.15 kΩ", loc="right", fontsize=8)
    )
    jumper(
        d,
        getattr(bb, f"B{OP484_FIRST_ROW + 10}"),
        op.pin7,
        COLOR_VREF_BUFFERED,
    )

    # Ceramic coupling capacitor from the AD9833 output node to pin 3.
    cap = (
        pictorial.CapacitorCeramic()
        .at(getattr(bb, f"J{COUPLING_START_ROW}"))
        .label(f"C1 {COUPLING_CAP_UF} µF ceramic", loc="right", fontsize=8)
    )
    d += cap
    jumper(d, getattr(bb, f"J{COUPLING_END_ROW}"), op.pin3, COLOR_SIGNAL, "to pin 3")

    # Test point labels.
    d += elm.Dot(radius=0.12).at(op.pin1).color(COLOR_SIGNAL).label("TP2 VOUT", loc="left", fontsize=8)
    d += elm.Dot(radius=0.12).at(op.pin7).color(COLOR_VREF_BUFFERED).label("TP3 buffered VREF", loc="right", fontsize=8)

    # Title and concise netlist reminder.
    d += elm.Label().at((13.0, 16.3)).label(
        "PocketLab OP484 Double Breadboard — First Editable Draft",
        fontsize=16,
        halign="center",
    )
    d += elm.Label().at((0.0, -1.5)).label(
        "Verify against the physical breadboard before applying power.\n"
        "Rows 1–30 are on the first board; global rows 31–60 map to local rows 1–30 on the second.\n"
        "Key nets: 1–Rf–2; 2–Rg–7; 3–Rbias–7; 7–6; 8–9; 14–13; raw VREF → 5,10,12.",
        fontsize=9,
        halign="left",
        color="#b2182b",
    )

    return d


def build_module_drawing():
    """Separate module view so the breadboard remains large and readable."""
    d = schemdraw.Drawing(show=False)
    d.config(fontsize=10, lw=1.5)

    esp = make_nodemcu().at((0.0, 0.0))
    ad = make_ad9833().at((8.0, 0.0))
    d += esp
    d += ad

    jumper(d, esp.GPIO5, ad.FSYNC, COLOR_SPI, "GPIO5 / FSYNC")
    jumper(d, esp.GPIO18, ad.SCLK, COLOR_SPI, "GPIO18 / SCLK")
    jumper(d, esp.GPIO23, ad.SDATA, COLOR_SPI, "GPIO23 / SDATA")
    jumper(d, esp.V3V3, ad.VCC, COLOR_3V3, "3V3")
    jumper(d, esp.GND, ad.DGND, COLOR_GND, "GND")
    jumper(d, ad.AGND, ad.DGND, COLOR_GND)

    d += elm.Line().at(ad.OUT).right().length(2.0).color(COLOR_SIGNAL).label(
        "OUT → C1 on breadboard",
        loc="top",
        fontsize=9,
    )
    d += elm.Line().at(esp.V5).left().length(1.8).color(COLOR_5V).label(
        "5 V → breadboard + rail",
        loc="top",
        fontsize=9,
    )
    d += elm.Line().at(esp.GND).left().length(1.8).color(COLOR_GND).label(
        "GND → breadboard ground rail",
        loc="bottom",
        fontsize=9,
    )

    d += elm.Label().at((5.0, 7.0)).label(
        "PocketLab Module Wiring — First Editable Draft",
        fontsize=16,
        halign="center",
    )
    d += elm.Label().at((5.0, -1.2)).label(
        "AD9833 is shown from the front/component side; pin order is reversed from the supplied backside photograph.",
        fontsize=9,
        halign="center",
    )
    return d


def add_label_backgrounds(schemdraw_figure):
    """Add readable backgrounds to rendered labels without boxing titles."""
    for text in schemdraw_figure.ax.texts:
        if text.get_fontsize() >= 14:
            continue
        text.set_bbox(
            {
                "facecolor": LABEL_BACKGROUND,
                "edgecolor": "none",
                "alpha": LABEL_BACKGROUND_ALPHA,
                "pad": LABEL_BACKGROUND_PADDING,
            }
        )


def main():
    # module_drawing = build_module_drawing()
    breadboard_drawing = build_breadboard_drawing()
    # module_figure = module_drawing.draw(show=False)
    breadboard_figure = breadboard_drawing.draw(show=False)
    # add_label_backgrounds(module_figure)
    # add_label_backgrounds(breadboard_figure)
    plt.show()


if __name__ == "__main__":
    main()