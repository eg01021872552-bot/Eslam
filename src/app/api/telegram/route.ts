import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const env = (key: string) => process.env[key] ?? "";

async function airtable(path: string, init: RequestInit = {}) {
  const token = env("AIRTABLE_API_TOKEN");
  const base = env("AIRTABLE_BASE_ID");
  if (!token || !base) throw new Error("Airtable environment is incomplete");
  const response = await fetch(`https://api.airtable.com/v0/${base}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) {
    console.error("Airtable error", response.status, data?.error?.type ?? "unknown");
    throw new Error(`Airtable request failed: ${response.status}`);
  }
  return data;
}

async function findEmployee(telegramId: string) {
  const table = env("AIRTABLE_EMPLOYEES_TABLE_ID");
  const formula = `{fldNGoMjLOgqZQ6mz}='${telegramId.replace(/'/g, "\\'")}'`;
  const query = new URLSearchParams({ filterByFormula: formula, maxRecords: "1" });
  const data = await airtable(`${encodeURIComponent(table)}?${query.toString()}`);
  return data.records?.[0] ?? null;
}

async function saveGroupMessage(message: any, employee: any) {
  const table = env("AIRTABLE_MESSAGES_TABLE_ID");
  const messageId = String(message.message_id);
  const formula = `{fld6YPZNzvd3m1u97}='${messageId}'`;
  const query = new URLSearchParams({ filterByFormula: formula, maxRecords: "1" });
  const existing = await airtable(`${encodeURIComponent(table)}?${query.toString()}`);
  if (existing.records?.length) return;

  const sender = message.from ?? {};
  const employeeName = employee?.cellValuesByFieldId?.fldbD1AjNT4ArDVp6;
  const senderName = employeeName || [sender.first_name, sender.last_name].filter(Boolean).join(" ") || "عضو المجموعة";
  const body = String(message.text ?? message.caption ?? "").trim();
  if (!body) return;

  const fields: Record<string, unknown> = {
    "fldPh4CNH8yUHg1ab": `TG-${message.chat.id}-${messageId}`,
    "fldXGMB1LYq0p0XUj": senderName,
    "fldblgGsIlHJXVjH4": "مجموعة الشركة",
    "fldB243DhpbqpqpT7": "إعلان عام",
    "fldn8q8IJ6PwfTo2a": body,
    "fldlGqy827cH3MnT4": new Date((message.date ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    "fldZV0JboWBmWE4ns": "تم التسليم",
    "fldKgUavji53gIds5": String(sender.id ?? ""),
    "fld6YPZNzvd3m1u97": messageId,
    "fldnTKFg2r0Nzk4zi": "المجموعة",
  };
  await airtable(encodeURIComponent(table), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: false }),
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "company-group-communications", mode: "group-only" });
}

export async function POST(request: NextRequest) {
  const secret = env("TELEGRAM_WEBHOOK_SECRET");
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const update = await request.json();
    const message = update.message ?? update.edited_message;
    if (!message?.chat || !message?.from) return NextResponse.json({ ok: true });
    const groupId = env("COMPANY_GROUP_CHAT_ID");
    if (!groupId || String(message.chat.id) !== String(groupId)) {
      return NextResponse.json({ ok: true, ignored: true });
    }
    if (message.from.is_bot) return NextResponse.json({ ok: true });
    const employee = await findEmployee(String(message.from.id));
    await saveGroupMessage(message, employee);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Group-only Telegram webhook failed:", error);
    return NextResponse.json({ ok: true, logged: false });
  }
}