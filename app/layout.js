import { Space_Mono, Share_Tech_Mono } from "next/font/google";
import "./globals.css";

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-space-mono",
});

const shareTechMono = Share_Tech_Mono({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-share-tech-mono",
});

export const metadata = {
  title: "MEEDA | Creative Studio & Interactive Experiences",
  description: "MEEDA is a hybrid design studio fusing high-end web development with interactive experiences.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="it" className={`${spaceMono.variable} ${shareTechMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
