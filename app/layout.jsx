import "./globals.css";

export const metadata = {
  title: "Solarize Home Energy",
  description: "Solar operations dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
