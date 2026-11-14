import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const env = (key: string) => process.env[key] ?? "";
const EMP = env("AIRTABLE_EMPLOYEES_TABLE_ID");
const MSG = env("AIRTABLE_MESSAGES_TABLE_ID");
const BASE = env("AIRTABLE_BASE_ID");
const EMP_NAME = "fldbD1AjNT4ArDVp6";
const EMP_TG = "fld7spJxeYERCzbak";
const EMP_CHAT = "fldNGoMjLOgqZQ6mz";
const EMP_STATUS = "fldcHCNDppjSdoaT6";
const EMP_DEPT = "fldKpcxqlBQvb6ghN";
const MSG_DEPT = "fldkwTgS7wPqSJpV6";

function escapeFormula(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function airtable(path: string, init: RequestInit = {}) {
  const token = env("AIRTABLE_API_TOKEN");
  if (!token || !BASE || !EMP || !MSG) throw new Error("Airtable configuration is incomplete");
  const response = await fetch(`https://api.airtable.com/v0/${BASE}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Airtable request failed: ${response.status}`);
  return data;
}

async function telegram(method: string, payload: Record<string, unknown>) {
  const token = env("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("Telegram configuration is incomplete");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(`Telegram delivery failed: ${data.description ?? response.status}`);
  return data.result;
}

export async function POST(request: NextRequest) {
  const secret = env("TELEGRAM_WEBHOOK_SECRET");
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const employeeName = String(body?.employeeName ?? "").trim();
  const messageText = String(body?.text ?? "").trim();
  const idempotencyKey = String(body?.idempotencyKey ?? "").trim();
  if (!employeeName || !messageText || !idempotencyKey || messageText.length > 4000 || idempotencyKey.length > 120) {
    return NextResponse.json({ ok: false, error: "employeeName, text and idempotencyKey are required" }, { status: 400 });
  }

  try {
    const formula = `{اسم الموظف}='${escapeFormula(employeeName)}'`;
    const query = new URLSearchParams({ filterByFormula: formula, maxRecords: "2", returnFieldsByFieldId: "true" });
    const matches = await airtable(`${encodeURIComponent(EMP)}?${query}`);
    if (matches.records?.length !== 1) {
      return NextResponse.json({ ok: false, error: matches.records?.length ? "ambiguous_employee" : "employee_not_found" }, { status: 404 });
    }

    const employee = matches.records[0];
    const fields = employee.fields ?? {};
    const status = fields[EMP_STATUS]?.name ?? fields[EMP_STATUS];
    if (status !== "على رأس العمل") return NextResponse.json({ ok: false, error: "employee_inactive" }, { status: 409 });
    const recipientId = String(fields[EMP_CHAT] || fields[EMP_TG] || "");
    if (!recipientId) return NextResponse.json({ ok: false, error: "telegram_not_linked" }, { status: 409 });

    const deptValue = fields[EMP_DEPT];
    const departmentId = Array.isArray(deptValue) ? String(deptValue[0]?.id ?? deptValue[0] ?? "") : String(deptValue?.id ?? deptValue ?? "");
    if (!departmentId) return NextResponse.json({ ok: false, error: "employee_department_missing" }, { status: 409 });

    const key = `ACTION-${idempotencyKey}`;
    const existingQuery = new URLSearchParams({ filterByFormula: `{رقم المراسلة}='${escapeFormula(key)}'`, maxRecords: "1", returnFieldsByFieldId: "true" });
    const existing = await airtable(`${encodeURIComponent(MSG)}?${existingQuery}`);
    if (existing.records?.length) {
      const prior = existing.records[0];
      const priorStatus = prior.fields?.["fldZV0JboWBmWE4ns"];
      if (priorStatus === "تم التسليم") {
        return NextResponse.json({ ok: true, alreadyDelivered: true, recordId: prior.id });
      }
      return NextResponse.json({ ok: false, error: "request_already_recorded", recordId: prior.id }, { status: 409 });
    }

    const adminId = env("ADMIN_TELEGRAM_ID");
    const recordData = await airtable(`${encodeURIComponent(MSG)}?returnFieldsByFieldId=true`, {
      method: "POST",
      body: JSON.stringify({ records: [{ fields: {
        "fldPh4CNH8yUHg1ab": key,
        "fldXGMB1LYq0p0XUj": "الإدارة",
        "fldblgGsIlHJXVjH4": employee.fields?.[EMP_NAME] ?? employeeName,
        "fldB243DhpbqpqpT7": "رسالة لموظف",
        "fldn8q8IJ6PwfTo2a": messageText,
        "fldlGqy827cH3MnT4": new Date().toISOString(),
        "fldZV0JboWBmWE4ns": "جديدة",
        "fldKgUavji53gIds5": adminId,
        "fldBr35okGCqh66Zo": recipientId,
        "fldnTKFg2r0Nzk4zi": "خاص",
        [MSG_DEPT]: [departmentId],
      } }] }),
    });
    const record = recordData.records?.[0];
    if (!record?.id) throw new Error("Could not save the message record");

    try {
      const sent = await telegram("sendMessage", { chat_id: recipientId, text: messageText });
      await airtable(`${encodeURIComponent(MSG)}/${record.id}`, {
        method: "PATCH",
        body: JSON.stringify({ fields: {
          "fldZV0JboWBmWE4ns": "تم التسليم",
          "fld6YPZNzvd3m1u97": String(sent.message_id),
        } }),
      });
      return NextResponse.json({ ok: true, delivered: true, recipient: employee.fields?.[EMP_NAME], recordId: record.id, telegramMessageId: sent.message_id });
    } catch (error) {
      await airtable(`${encodeURIComponent(MSG)}/${record.id}`, {
        method: "PATCH",
        body: JSON.stringify({ fields: { "fldZV0JboWBmWE4ns": "فشل الإرسال", "fldO0qVyrm5iIaTKX": String(error) } }),
      });
      return NextResponse.json({ ok: false, error: "telegram_delivery_failed", recordId: record.id }, { status: 502 });
    }
  } catch (error) {
    console.error("Authorized Telegram send failed", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
