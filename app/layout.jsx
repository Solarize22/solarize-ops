import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { UserRoleProvider } from "@/lib/useUserRole";
import { ThemeProvider } from "@/lib/theme";

export const metadata = {
  title: "Solarize Home Energy",
  description: "Solar operations dashboard",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ClerkProvider>
          <ThemeProvider>
            <UserRoleProvider>
              {children}
            </UserRoleProvider>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
