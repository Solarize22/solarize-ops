import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { UserRoleProvider } from "@/lib/useUserRole";
import { ThemeProvider } from "@/lib/theme";
import { appConfig } from "@/lib/app-config";

export const metadata = {
  title: appConfig.appName,
  description: appConfig.appDescription,
  icons: {
    icon: "/logo-2026.png",
    apple: "/logo-2026.png",
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
