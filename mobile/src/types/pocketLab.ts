export type Waveform = "sine" | "square" | "triangle" | "dc" | "rampUp" | "rampDown";

export interface FunctionGeneratorState {
  connected: boolean;
  deviceName: string | null;
  frequencyHz: number;
  amplitudeVpp: number;
  offsetV: number;
  waveform: Waveform;
  outputEnabled: boolean;
}
