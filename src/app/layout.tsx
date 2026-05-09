import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI English Teacher — Handwriting Grammar Checker",
  description:
    "Upload a photo of your English handwriting and get instant grammar corrections powered by Google Gemini AI.",
  keywords: ["English grammar", "handwriting OCR", "AI teacher", "Gemini AI"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
