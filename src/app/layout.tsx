import type { ReactNode } from "react";

export const metadata = {
  title: "نظام المراسلات الداخلية",
  description: "تواصل الموظفين والإدارة عبر بوت تيليجرام مع سجل متابعة داخلي",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif" }}>{children}</body>
    </html>
  );
}
