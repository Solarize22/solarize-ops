import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { UserRoleProvider } from "@/lib/useUserRole";

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
      <body>
        <ClerkProvider>
          <UserRoleProvider>
            {children}
          </UserRoleProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
