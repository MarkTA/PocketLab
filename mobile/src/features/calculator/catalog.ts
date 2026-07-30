export type CalculatorTemplate = "Quick converter" | "Circuit solver" | "Interactive";

export type CalculatorCategory = {
  slug: string;
  title: string;
  description: string;
  icon: string;
};

export type CalculatorTool = {
  slug: string;
  title: string;
  description: string;
  categorySlug: CalculatorCategory["slug"];
  aliases: string[];
  template: CalculatorTemplate;
};

export const calculatorCategories: CalculatorCategory[] = [
  {
    slug: "circuit-fundamentals",
    title: "Circuit Fundamentals",
    description: "Voltage, current, resistance, power, and circuit-analysis laws.",
    icon: "flash",
  },
  {
    slug: "components",
    title: "Components",
    description: "Identify, select, combine, and safely operate common components.",
    icon: "memory",
  },
  {
    slug: "signals-ac-filters",
    title: "Signals, AC & Filters",
    description: "Waveforms, impedance, frequency response, gain, and noise.",
    icon: "sine-wave",
  },
  {
    slug: "analog-power",
    title: "Analog & Power",
    description: "Op-amps, converters, regulators, batteries, and thermal design.",
    icon: "power-plug-outline",
  },
  {
    slug: "digital-logic",
    title: "Digital Logic",
    description: "Number systems, Boolean algebra, K-maps, and digital timing.",
    icon: "gate-and",
  },
  {
    slug: "electromagnetics-rf",
    title: "Electromagnetics & RF",
    description: "Fields, waves, transmission lines, antennas, and matching.",
    icon: "radio-tower",
  },
  {
    slug: "lab-engineering",
    title: "Lab & Engineering Tools",
    description: "Units, uncertainty, scopes, sampling, wiring, and PCB calculations.",
    icon: "tools",
  },
];

export const calculatorTools: CalculatorTool[] = [
  {
    slug: "ohms-law-power",
    title: "Ohm’s Law & Power",
    description:
      "Enter known electrical values and solve for voltage, current, resistance, or power.",
    categorySlug: "circuit-fundamentals",
    aliases: ["V=IR", "voltage", "current", "resistance", "wattage"],
    template: "Circuit solver",
  },
  {
    slug: "series-parallel",
    title: "Series & Parallel",
    description: "Combine resistors, capacitors, or inductors in series or parallel.",
    categorySlug: "circuit-fundamentals",
    aliases: [
      "equivalent resistance",
      "equivalent capacitance",
      "component combinations",
    ],
    template: "Circuit solver",
  },
  {
    slug: "voltage-divider",
    title: "Voltage Divider",
    description:
      "Solve loaded or unloaded dividers and find nearby standard resistor values.",
    categorySlug: "circuit-fundamentals",
    aliases: ["potential divider", "R1 R2", "loaded divider"],
    template: "Circuit solver",
  },
  {
    slug: "kvl-kcl",
    title: "KVL & KCL",
    description: "Build Kirchhoff equations for loops and nodes with engineering units.",
    categorySlug: "circuit-fundamentals",
    aliases: ["Kirchhoff", "loop rule", "node rule", "current law", "voltage law"],
    template: "Interactive",
  },
  {
    slug: "node-voltage",
    title: "Node-Voltage Solver",
    description: "Find unknown node voltages using KCL.",
    categorySlug: "circuit-fundamentals",
    aliases: ["nodal analysis", "KCL", "node voltage"],
    template: "Interactive",
  },
  {
    slug: "thevenin-norton",
    title: "Thévenin & Norton",
    description: "Find equivalent source voltage, current, and resistance.",
    categorySlug: "circuit-fundamentals",
    aliases: ["equivalent circuit", "maximum power transfer"],
    template: "Circuit solver",
  },
  {
    slug: "resistor-identification",
    title: "Resistor Identification",
    description: "Decode color bands and SMD markings or generate a code from a value.",
    categorySlug: "components",
    aliases: ["color code", "SMD code", "bands", "resistor value"],
    template: "Interactive",
  },
  {
    slug: "standard-values",
    title: "Standard Values",
    description: "Find the nearest E-series value and useful two-component combinations.",
    categorySlug: "components",
    aliases: ["E6", "E12", "E24", "E48", "E96", "E192", "preferred value"],
    template: "Quick converter",
  },
  {
    slug: "led-resistor",
    title: "LED Resistor",
    description: "Choose a safe series resistor and power rating for one or more LEDs.",
    categorySlug: "components",
    aliases: ["current limiting resistor", "forward voltage", "LED current"],
    template: "Circuit solver",
  },
  {
    slug: "component-tolerance",
    title: "Component Tolerance",
    description: "Calculate min/max values and worst-case combinations.",
    categorySlug: "components",
    aliases: ["range", "percent", "worst case"],
    template: "Circuit solver",
  },
  {
    slug: "frequency-period",
    title: "Frequency & Period",
    description:
      "Convert frequency, period, angular frequency, duty cycle, and pulse width.",
    categorySlug: "signals-ac-filters",
    aliases: ["Hz", "seconds", "omega", "pulse", "duty cycle"],
    template: "Quick converter",
  },
  {
    slug: "signal-levels",
    title: "RMS, Peak & Vpp",
    description: "Convert waveform levels for sine, square, and triangle waves.",
    categorySlug: "signals-ac-filters",
    aliases: ["peak-to-peak", "Vrms", "Vpeak", "amplitude"],
    template: "Quick converter",
  },
  {
    slug: "reactance-impedance",
    title: "Reactance & Impedance",
    description: "Calculate complex impedance and admittance for R, L, and C networks.",
    categorySlug: "signals-ac-filters",
    aliases: ["XL", "XC", "phasor", "admittance", "RLC"],
    template: "Circuit solver",
  },
  {
    slug: "rc-rl-filters",
    title: "RC & RL Filters",
    description: "Solve cutoff frequency, time constant, attenuation, and phase.",
    categorySlug: "signals-ac-filters",
    aliases: ["low pass", "high pass", "time constant", "cutoff", "tau"],
    template: "Circuit solver",
  },
  {
    slug: "decibels",
    title: "Decibels & Gain",
    description: "Convert voltage and power ratios, dBV, dBm, gain, and loss.",
    categorySlug: "signals-ac-filters",
    aliases: ["dB", "dBm", "dBV", "attenuation", "ratio"],
    template: "Quick converter",
  },
  {
    slug: "op-amp-gain",
    title: "Op-Amp Gain",
    description: "Design common amplifier configurations and check output limits.",
    categorySlug: "analog-power",
    aliases: ["inverting", "non-inverting", "follower", "summing amplifier"],
    template: "Circuit solver",
  },
  {
    slug: "adc-dac",
    title: "ADC & DAC",
    description: "Calculate resolution, code, voltage, quantization error, and ENOB.",
    categorySlug: "analog-power",
    aliases: ["LSB", "reference voltage", "code", "quantization", "ENOB"],
    template: "Circuit solver",
  },
  {
    slug: "regulator-power",
    title: "Regulator Power",
    description:
      "Estimate regulator dissipation, efficiency, junction temperature, and headroom.",
    categorySlug: "analog-power",
    aliases: ["linear regulator", "LDO", "heat", "dropout", "efficiency"],
    template: "Circuit solver",
  },
  {
    slug: "battery-runtime",
    title: "Battery Runtime",
    description:
      "Estimate operating time from capacity, load profile, and conversion efficiency.",
    categorySlug: "analog-power",
    aliases: ["mAh", "energy budget", "battery life"],
    template: "Circuit solver",
  },
  {
    slug: "number-systems",
    title: "Number Systems",
    description: "Convert binary, octal, decimal, hexadecimal, and two’s complement.",
    categorySlug: "digital-logic",
    aliases: ["base converter", "hex", "binary", "signed", "two's complement"],
    template: "Quick converter",
  },
  {
    slug: "logic-solver",
    title: "Boolean & K-Map Solver",
    description:
      "Simplify expressions, truth tables, minterms, maxterms, and Karnaugh maps.",
    categorySlug: "digital-logic",
    aliases: ["Boolean algebra", "Karnaugh", "Kmap", "truth table", "SOP", "POS"],
    template: "Interactive",
  },
  {
    slug: "digital-timing",
    title: "Digital Timing",
    description:
      "Calculate clock periods, setup/hold margins, propagation delay, and throughput.",
    categorySlug: "digital-logic",
    aliases: ["clock", "propagation delay", "setup time", "hold time"],
    template: "Circuit solver",
  },
  {
    slug: "maxwell-equations",
    title: "Maxwell’s Equations",
    description:
      "Explore integral and differential forms, variables, meaning, and related calculations.",
    categorySlug: "electromagnetics-rf",
    aliases: ["Gauss", "Faraday", "Ampere", "electric field", "magnetic field"],
    template: "Interactive",
  },
  {
    slug: "wavelength-antenna",
    title: "Wavelength & Antenna Length",
    description:
      "Calculate wavelength and practical full-, half-, and quarter-wave dimensions.",
    categorySlug: "electromagnetics-rf",
    aliases: ["lambda", "frequency", "velocity factor", "dipole", "quarter wave"],
    template: "Circuit solver",
  },
  {
    slug: "vswr-reflection",
    title: "VSWR & Reflection",
    description:
      "Convert impedance, reflection coefficient, return loss, and mismatch loss.",
    categorySlug: "electromagnetics-rf",
    aliases: ["Gamma", "return loss", "S11", "mismatch"],
    template: "Circuit solver",
  },
  {
    slug: "smith-chart",
    title: "Smith Chart",
    description:
      "Plot impedance, transform transmission lines, and explore matching networks.",
    categorySlug: "electromagnetics-rf",
    aliases: ["impedance matching", "admittance", "transmission line", "S11"],
    template: "Interactive",
  },
  {
    slug: "engineering-units",
    title: "Engineering Units",
    description: "Convert SI prefixes, notation, and compatible electrical units.",
    categorySlug: "lab-engineering",
    aliases: ["micro", "milli", "kilo", "mega", "scientific notation"],
    template: "Quick converter",
  },
  {
    slug: "measurement-uncertainty",
    title: "Measurement Uncertainty",
    description:
      "Combine tolerances, instrument accuracy, resolution, and repeated measurements.",
    categorySlug: "lab-engineering",
    aliases: ["error", "accuracy", "precision", "significant figures"],
    template: "Circuit solver",
  },
  {
    slug: "scope-sampling",
    title: "Scope & Sampling",
    description: "Check probe scaling, sample rate, aliasing, rise time, and bandwidth.",
    categorySlug: "lab-engineering",
    aliases: ["oscilloscope", "Nyquist", "probe attenuation", "bandwidth"],
    template: "Circuit solver",
  },
  {
    slug: "wire-voltage-drop",
    title: "Wire Voltage Drop",
    description:
      "Estimate conductor resistance, voltage loss, heating, and power delivery.",
    categorySlug: "lab-engineering",
    aliases: ["AWG", "cable", "current", "length"],
    template: "Circuit solver",
  },
];

export const defaultFavoriteSlugs = [
  "ohms-law-power",
  "series-parallel",
  "voltage-divider",
  "frequency-period",
];

export function findCategory(slug: string | undefined): CalculatorCategory | undefined {
  return calculatorCategories.find((category) => category.slug === slug);
}

export function findTool(slug: string | undefined): CalculatorTool | undefined {
  return calculatorTools.find((tool) => tool.slug === slug);
}

export function searchTools(query: string): CalculatorTool[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  return calculatorTools.filter((tool) =>
    [tool.title, tool.description, ...tool.aliases].some((value) =>
      value.toLocaleLowerCase().includes(normalizedQuery)
    )
  );
}