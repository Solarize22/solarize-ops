import "./globals.css";

export const metadata = {
  title: "Solarize Home Energy",
  description: "Solar operations dashboard",
  icons: {
    icon: "/logo.jpg",
    apple: "/logo.jpg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
