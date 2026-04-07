/**
 * Tech-oriented palette: blue + smoke gray.
 * Use for inline styles across the app.
 */
export const theme = {
  /** Page / body background – deep blue-smoke */
  bgDeep: "#0c1929",
  /** Cards, panels, raised surfaces */
  bgSurface: "#1e293b",
  /** Inputs, nested panels */
  bgInput: "#162032",
  /** Borders – smoke gray */
  border: "#334155",
  /** Primary text */
  text: "#e2e8f0",
  /** Muted / secondary text */
  textMuted: "#94a3b8",
  /** Links & accents – tech blue */
  link: "#60a5fa",
  linkHover: "#38bdf8",
  /** Primary CTA gradient */
  gradientBtn: "linear-gradient(135deg,#1e40af,#3b82f6)",
  /** Small footer / disclaimer */
  textSubtle: "#64748b",
  /** Error */
  error: "#f87171",
} as const;
