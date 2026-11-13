export default function Home() {
  return (
    <main style={{ minHeight: "100vh", background: "#f3f7fb", padding: "48px 20px", direction: "rtl", fontFamily: "Arial, sans-serif", color: "#17324d" }}>
      <section style={{ maxWidth: 760, margin: "0 auto", background: "#fff", borderRadius: 20, padding: 32, boxShadow: "0 8px 30px rgba(20,60,90,.08)" }}>
        <div style={{ color: "#1683bd", fontWeight: 700, marginBottom: 12 }}>الاتحاد الميسر للتسويق</div>
        <h1 style={{ fontSize: 30, margin: "0 0 14px" }}>التواصل الداخلي للموظفين</h1>
        <p style={{ lineHeight: 1.9, color: "#526579" }}>تواصل مع زملائك داخل قسمك من خلال بوت تيليجرام المرتبط بالنظام.</p>
        <div style={{ background: "#eef7fc", border: "1px solid #d5eaf6", borderRadius: 14, padding: 20, marginTop: 22 }}>
          <h2 style={{ fontSize: 19, marginTop: 0 }}>طريقة بدء محادثة</h2>
          <ol style={{ lineHeight: 2, paddingRight: 22 }}>
            <li>افتح محادثة بوت الاتحاد الميسر في تيليجرام.</li>
            <li>اكتب /menu لعرض قائمة الخدمات.</li>
            <li>اضغط على زر «تواصل مع موظف».</li>
            <li>اختر زميلك من قائمة موظفي قسمك، ثم اكتب رسالتك.</li>
          </ol>
        </div>
        <p style={{ marginTop: 22, lineHeight: 1.9, color: "#526579" }}>تظهر لك قائمة موظفي قسمك فقط. وتستطيع الإدارة التواصل مع الموظفين ومتابعة سجل المراسلات حسب صلاحياتها.</p>
      </section>
    </main>
  );
}
