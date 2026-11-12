import type { ReactNode } from "react";

export const metadata = {
  title: "نظام مراسلات مجموعة الاتحاد الميسر",
  description: "تسجيل مراسلات مجموعة الشركة فقط",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif" }}>{children}</body>
    </html>
  );
}
