import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
 const key = request.nextUrl.searchParams.get("key") ?? "";
 const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
 const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
 const host = process.env.TELEGRAM_WEBHOOK_PUBLIC_URL ?? "https://etihad-almoyaser-employee-bot.vercel.app";
 if (!secret || key !== secret) return NextResponse.json({ ok: false }, { status: 401 });
 if (!token) return NextResponse.json({ ok: false, error: "bot token missing" }, { status: 500 });
 const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
   url: `${host}/api/telegram`,
   secret_token: secret,
   allowed_updates: ["message", "edited_message"],
   drop_pending_updates: false
  })
 });
 const result = await response.json();
 if (!response.ok || !result.ok) return NextResponse.json({ ok: false, error: "Telegram webhook registration failed" }, { status: 502 });
 return NextResponse.json({ ok: true, webhook: `${host}/api/telegram`, telegram: result.result });
}