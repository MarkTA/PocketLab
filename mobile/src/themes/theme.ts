// src/theme/theme.ts
import { MD3DarkTheme, MD3LightTheme } from "react-native-paper";

export const pocketLabColors = {
  darkTeal: "#3893ac",
  teal: "#62C8D3",
  green: "#67a33c",
  darkGreen: "#5f913b",
  orange: "#D85B24",
  background: "#F4F6F8",
  surface: "#FFFFFF",
  elevation: "#FFFFFF",
  text: "#202124",
  mutedText: "#6B7280",
  grid: "#D9D9D9",
  axis: "#222222",
  danger: "#D31F11",
};

// export const recommendedColors = {
//   App background       #1E2226
//   Card background      #F7F8F8
//   Primary teal         #23899A
//   Header background    #D8F0F3
//   Run green            #4F8F3A
//   Stop orange-red      #D85B24
//   Primary text         #1D2529
//   Secondary text       #667078
//   Grid                 #D7DDE0
// }

export const paperTheme = {
  ...MD3LightTheme,
  roundness: 2,
  colors: {
    ...MD3LightTheme.colors,
    primary: pocketLabColors.darkTeal,
    secondary: pocketLabColors.orange,
    background: pocketLabColors.background,
    surface: pocketLabColors.surface,
    surfaceVariant: pocketLabColors.surface,
    onSurface: pocketLabColors.text,
    onBackground: pocketLabColors.text,
    error: pocketLabColors.danger,
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level0: pocketLabColors.elevation,
      level1: pocketLabColors.elevation,
      level2: pocketLabColors.elevation,
      level3: pocketLabColors.elevation,
      level4: pocketLabColors.elevation,
      level5: pocketLabColors.elevation,
    },
  },
};
