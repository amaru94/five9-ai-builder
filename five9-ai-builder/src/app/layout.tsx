import type { ReactNode } from "react";
import Providers from "./providers";

export const metadata = {
  title: "Five9 AI Builder",
  description: "Chat-driven Five9 configuration and IVR builder",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0c1929", color: "#e2e8f0" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
