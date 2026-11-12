import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const env = (key: string) => process.env[key] ?? "";
const EMP = env("AIRTABLE_EMPLOYEES_TABLE_ID");
const MSG = env("AIRTABLE_MESSAGES_TABLE_ID");
const BASE = env("AIRTABLE_BASE_ID");
const EMP_NAME = "fldbD1AjNT4ArDVp6";
const EMP_PHONE = "fldZVkrzRCAV61y41";
const EMP_TG = "fld7spJxeYERCzbak";
const EMP_CHAT = "fldNGoMjLOgqZQ6mz";
const EMP_ROLE = "fldUmhZvjeh6rWJzo";
const EMP_STATUS = "fldcHCNDppjSdoaT6";
const EMP_LINK = "fld4GJUS7j41jFXcU";
const EMP_MODE = "fld0XUBzsCx1MaEqO";
const EMP_TARGET = "fldCYKrXjNEDfSyrg";

async function airtable(path: string, init: RequestInit = {}) {
  const token = env("AIRTABLE_API_TOKEN");
  if (!token || !BASE) throw new Error("Airtable environment is incomplete");
  const res = await fetch(`https://api.airtable.com/v0/${BASE}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Airtable rejected request", res.status, JSON.stringify(data?.error ?? {}));
    throw new Error(`Airtable ${res.status}: ${data?.error?.message ?? data?.error?.type ?? "request failed"}`);
  }
  return data;
}

async function tg(method: string, payload: Record<string, unknown>) {
  const token = env("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("Telegram bot token is missing");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(`Telegram ${method} failed: ${data.description ?? res.status}`);
  return data.result;
}

function formulaValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function employeeByTelegram(id: string) {
  const formula = `OR({معرّف Telegram}='${formulaValue(id)}',{معرّف محادثة تيليجرام (سري)}='${formulaValue(id)}')`;
  const q = new URLSearchParams({ filterByFormula: formula, maxRecords: "1", returnFieldsByFieldId: "true" });
  const data = await airtable(`${encodeURIComponent(EMP)}?${q}`);
  return data.records?.[0] ?? null;
}

async function employeeByRecord(id: string) {
  const data = await airtable(`${encodeURIComponent(EMP)}/${id}?returnFieldsByFieldId=true`);
  return data;
}

async function employees() {
  const q = new URLSearchParams({ pageSize: "100", returnFieldsByFieldId: "true" });
  const data = await airtable(`${encodeURIComponent(EMP)}?${q}`);
  return (data.records ?? []).filter((r: any) => r.fields?.[EMP_STATUS] === "على رأس العمل");
}

async function updateEmployee(id: string, fields: Record<string, unknown>) {
  return airtable(`${encodeURIComponent(EMP)}/${id}`, { method: "PATCH", body: JSON.stringify({ fields }) });
}

async function sendText(chatId: string | number, text: string, extra: Record<string, unknown> = {}) {
  return tg("sendMessage", { chat_id: chatId, text, ...extra });
}

function nameOf(employee: any) {
  return employee?.fields?.[EMP_NAME] ?? "موظف";
}

function normalizePhone(value: string) {
  let n = value.replace(/[^0-9]/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("05")) n = "966" + n.slice(1);
  if (n.startsWith("5") && n.length === 9) n = "966" + n;
  return n;
}

async function saveMessage(args: {
  key: string; senderName: string; recipientName: string; body: string;
  senderId: string; recipientId: string; telegramMessageId?: string;
}) {
  const fields: Record<string, unknown> = {
    "fldPh4CNH8yUHg1ab": args.key,
    "fldXGMB1LYq0p0XUj": args.senderName,
    "fldblgGsIlHJXVjH4": args.recipientName,
    "fldB243DhpbqpqpT7": args.recipientName === "الإدارة" ? "رسالة للإدارة" : "رسالة لموظف",
    "fldn8q8IJ6PwfTo2a": args.body,
    "fldlGqy827cH3MnT4": new Date().toISOString(),
    "fldZV0JboWBmWE4ns": "جديدة",
    "fldKgUavji53gIds5": args.senderId,
    "fldBr35okGCqh66Zo": args.recipientId,
    "fld6YPZNzvd3m1u97": args.telegramMessageId ?? "",
    "fldnTKFg2r0Nzk4zi": "خاص",
  };
  const data = await airtable(`${encodeURIComponent(MSG)}?returnFieldsByFieldId=true`, { method: "POST", body: JSON.stringify({ records: [{ fields }] }) });
  return data.records?.[0];
}

async function setMessageStatus(recordId: string, status: string, note?: string) {
  const fields: Record<string, unknown> = { "fldZV0JboWBmWE4ns": status };
  if (note) fields["fldO0qVyrm5iIaTKX"] = note;
  await airtable(`${encodeURIComponent(MSG)}/${recordId}`, { method: "PATCH", body: JSON.stringify({ fields }) });
}

async function announceInGroup(record: any, body: string, senderName: string, recipientName: string) {
  const groupId = env("COMPANY_GROUP_CHAT_ID");
  if (!groupId) return;
  const caption = `مراسلة داخلية\nمن: ${senderName}\nإلى: ${recipientName}\n\n${body}\n\nرقم المراسلة: ${record.id}`;
  await sendText(groupId, caption, { reply_markup: { inline_keyboard: [[{ text: "الرد على الموظف", callback_data: `reply:${record.id}` }]] } });
}

async function deliver(record: any, recipientId: string, body: string, senderName: string, recipientName: string) {
  try {
    const sent = await sendText(recipientId, `رسالة من ${senderName}:\n\n${body}`, {
      reply_markup: { inline_keyboard: [[{ text: "رد على الرسالة", callback_data: `reply:${record.id}` }]] },
    });
    await setMessageStatus(record.id, "تم التسليم");
    try { await announceInGroup(record, body, senderName, recipientName); }
    catch (e) { console.error("Group copy failed", e); await setMessageStatus(record.id, "تم التسليم", "وصلت للمستلم، وتعذر إرسال نسخة الجروب"); }
    return sent;
  } catch (e) {
    await setMessageStatus(record.id, "فشل الإرسال", String(e));
    throw e;
  }
}

async function showMenu(chatId: number, employee: any) {
  const rows = [[{ text: "إرسال رسالة لموظف", callback_data: "new" }], [{ text: "مراسلاتي", callback_data: "inbox" }]];
  await sendText(chatId, `حياك ${nameOf(employee)}. اختر الخدمة:`, { reply_markup: { inline_keyboard: rows } });
}

async function startLink(chatId: number) {
  await sendText(chatId, "لربط حسابك، اضغط مشاركة رقم الجوال المسجل لدى الشركة.", {
    reply_markup: { keyboard: [[{ text: "مشاركة رقم الجوال", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
  });
}

async function handleContact(message: any) {
  const contact = message.contact;
  if (!contact?.user_id || String(contact.user_id) !== String(message.from.id)) {
    await sendText(message.chat.id, "فضلاً شارك رقم جوالك من زر المشاركة الخاص بحسابك.");
    return;
  }
  const all = await employees();
  const phone = normalizePhone(String(contact.phone_number ?? ""));
  const match = all.find((r: any) => normalizePhone(String(r.fields?.[EMP_PHONE] ?? "")) === phone);
  if (!match) {
    await sendText(message.chat.id, "ما لقينا رقمك ضمن سجلات الموظفين. تواصل مع الإدارة لتفعيل حسابك.");
    return;
  }
  await updateEmployee(match.id, { [EMP_TG]: String(message.from.id), [EMP_CHAT]: String(message.chat.id), [EMP_LINK]: "مرتبط", [EMP_MODE]: "لا شيء", [EMP_TARGET]: "" });
  await sendText(message.chat.id, `تم ربط حسابك بنجاح يا ${nameOf(match)}.`, { reply_markup: { remove_keyboard: true } });
  await showMenu(message.chat.id, match);
}

async function handleNew(chatId: number) {
  const list = await employees();
  const rows = list.filter((r: any) => r.fields?.[EMP_TG] || r.fields?.[EMP_CHAT]).map((r: any) => ([{ text: nameOf(r), callback_data: `to:${r.id}` }]));
  if (!rows.length) return sendText(chatId, "ما فيه موظفين مرتبطين بالبوت حتى الآن.");
  await sendText(chatId, "اختر الموظف اللي تبي تراسله:", { reply_markup: { inline_keyboard: rows.slice(0, 90) } });
}

async function handleCallback(query: any) {
  const actorId = String(query.from.id);
  const chatId = Number(actorId);
  const employee = await employeeByTelegram(actorId);
  if (!employee || String(employee.fields?.[EMP_LINK]?.name ?? employee.fields?.[EMP_LINK] ?? "") !== "مرتبط") {
    await tg("answerCallbackQuery", { callback_query_id: query.id, text: "اربط حسابك أولاً", show_alert: true });
    return;
  }
  const data = String(query.data ?? "");
  if (data === "new") {
    await tg("answerCallbackQuery", { callback_query_id: query.id });
    await handleNew(chatId);
    return;
  }
  if (data === "inbox") {
    await tg("answerCallbackQuery", { callback_query_id: query.id });
    const q = new URLSearchParams({ filterByFormula: `OR({معرّف المرسل السري}='${formulaValue(actorId)}',{معرّف المستلم السري}='${formulaValue(actorId)}')`, pageSize: "10", returnFieldsByFieldId: "true" });
    const result = await airtable(`${encodeURIComponent(MSG)}?${q}`);
    const lines = (result.records ?? []).map((r: any) => `• ${r.fields?.fldXGMB1LYq0p0XUj ?? "—"} ← ${r.fields?.fldblgGsIlHJXVjH4 ?? "—"}: ${String(r.fields?.fldn8q8IJ6PwfTo2a ?? "").slice(0, 160)}`);
    await sendText(chatId, lines.length ? `آخر مراسلاتك:\n\n${lines.join("\n")}` : "ما عندك مراسلات سابقة.");
    return;
  }
  if (data.startsWith("to:")) {
    const target = await employeeByRecord(data.slice(3));
    const targetId = String(target.fields?.[EMP_TG] ?? target.fields?.[EMP_CHAT] ?? "");
    if (!targetId || targetId === actorId) {
      await tg("answerCallbackQuery", { callback_query_id: query.id, text: "الموظف غير مرتبط أو لا يمكن مراسلة نفسك", show_alert: true });
      return;
    }
    await updateEmployee(employee.id, { [EMP_MODE]: "كتابة رسالة خاصة", [EMP_TARGET]: target.id });
    await tg("answerCallbackQuery", { callback_query_id: query.id });
    await sendText(chatId, `اكتب رسالتك إلى ${nameOf(target)} الآن. للإلغاء أرسل /cancel`);
    return;
  }
  if (data.startsWith("reply:")) {
    const original = await airtable(`${encodeURIComponent(MSG)}/${data.slice(6)}?returnFieldsByFieldId=true`);
    const originalSender = String(original.fields?.["fldKgUavji53gIds5"] ?? "");
    const originalRecipient = String(original.fields?.["fldBr35okGCqh66Zo"] ?? "");
    const admin = actorId === env("ADMIN_TELEGRAM_ID") || ["مدير", "مدير النظام"].includes(String(employee.fields?.[EMP_ROLE]?.name ?? employee.fields?.[EMP_ROLE] ?? ""));
    if (actorId !== originalRecipient && !admin) {
      await tg("answerCallbackQuery", { callback_query_id: query.id, text: "ما عندك صلاحية الرد على هذه الرسالة", show_alert: true });
      return;
    }
    const senderRecord = await employeeByTelegram(originalSender);
    if (!senderRecord) {
      await tg("answerCallbackQuery", { callback_query_id: query.id, text: "تعذر تحديد الموظف المرسل", show_alert: true });
      return;
    }
    await updateEmployee(employee.id, { [EMP_MODE]: "كتابة رسالة خاصة", [EMP_TARGET]: senderRecord.id });
    await tg("answerCallbackQuery", { callback_query_id: query.id });
    await sendText(chatId, `اكتب ردك إلى ${nameOf(senderRecord)} الآن. للإلغاء أرسل /cancel`);
  }
}

async function handlePrivateMessage(message: any, updateId: string) {
  const fromId = String(message.from.id);
  const chatId = message.chat.id;
  if (message.contact) return handleContact(message);
  let employee = await employeeByTelegram(fromId);
  if (!employee) {
    if (message.text === "/start") return startLink(chatId);
    return sendText(chatId, "حسابك غير مربوط. أرسل /start ثم شارك رقم جوالك المسجل بالشركة.");
  }
  const linkState = employee.fields?.[EMP_LINK]?.name ?? employee.fields?.[EMP_LINK];
  if (linkState !== "مرتبط") return startLink(chatId);
  const text = String(message.text ?? "").trim();
  if (text === "/start" || text === "/menu") return showMenu(chatId, employee);
  if (text === "/new") return handleNew(chatId);
  if (text === "/cancel") {
    await updateEmployee(employee.id, { [EMP_MODE]: "لا شيء", [EMP_TARGET]: "" });
    return sendText(chatId, "تم إلغاء الإرسال.");
  }
  if (text === "/inbox") {
    const q = new URLSearchParams({ filterByFormula: `OR({معرّف المرسل السري}='${formulaValue(fromId)}',{معرّف المستلم السري}='${formulaValue(fromId)}')`, pageSize: "10" });
    const result = await airtable(`${encodeURIComponent(MSG)}?${q}`);
    const lines = (result.records ?? []).map((r: any) => `• ${r.fields?.fldXGMB1LYq0p0XUj ?? "—"} ← ${r.fields?.fldblgGsIlHJXVjH4 ?? "—"}: ${String(r.fields?.fldn8q8IJ6PwfTo2a ?? "").slice(0, 160)}`);
    return sendText(chatId, lines.length ? `آخر مراسلاتك:\n\n${lines.join("\n")}` : "ما عندك مراسلات سابقة.");
  }
  if (!text) return sendText(chatId, "حالياً أرسل الرسائل النصية. أرسل /menu لعرض الخيارات.");
  const mode = employee.fields?.[EMP_MODE]?.name ?? employee.fields?.[EMP_MODE] ?? "لا شيء";
  let target: any = null;
  if (mode === "كتابة رسالة خاصة" && employee.fields?.[EMP_TARGET]) {
    target = await employeeByRecord(String(employee.fields[EMP_TARGET]));
  } else {
    target = null; // Default free-form message is sent to management.
  }
  const isAdmin = fromId === env("ADMIN_TELEGRAM_ID") || ["مدير", "مدير النظام"].includes(String(employee.fields?.[EMP_ROLE]?.name ?? employee.fields?.[EMP_ROLE] ?? ""));
  let recipientId = "";
  let recipientName = "";
  if (target) {
    recipientId = String(target.fields?.[EMP_TG] ?? target.fields?.[EMP_CHAT] ?? "");
    recipientName = nameOf(target);
  } else if (isAdmin) {
    await updateEmployee(employee.id, { [EMP_MODE]: "لا شيء", [EMP_TARGET]: "" });
    return sendText(chatId, "اختر الموظف أولاً عبر /new ثم اكتب رسالتك.");
  } else {
    recipientId = env("ADMIN_TELEGRAM_ID");
    recipientName = "الإدارة";
  }
  if (!recipientId) return sendText(chatId, "ما قدرنا نحدد حساب المستلم. تواصل مع الإدارة.");
  const record = await saveMessage({ key: `TG-${updateId}`, senderName: nameOf(employee), recipientName, body: text, senderId: fromId, recipientId, telegramMessageId: String(message.message_id) });
  await updateEmployee(employee.id, { [EMP_MODE]: "لا شيء", [EMP_TARGET]: "" });
  try {
    await deliver(record, recipientId, text, nameOf(employee), recipientName);
    await sendText(chatId, "تم إرسال رسالتك.");
  } catch (e) {
    console.error("Private message delivery failed", e);
    await sendText(chatId, "تعذر إرسال الرسالة حالياً. تم تسجيلها لمراجعة الإدارة.");
  }
}

async function saveGroupMessage(message: any, updateId: string) {
  const senderId = String(message.from?.id ?? "");
  const employee = await employeeByTelegram(senderId);
  const body = String(message.text ?? message.caption ?? "").trim();
  if (!body || !employee) return;
  const record = await saveMessage({ key: `TG-GROUP-${updateId}`, senderName: nameOf(employee), recipientName: "مجموعة الشركة", body, senderId, recipientId: env("ADMIN_TELEGRAM_ID"), telegramMessageId: String(message.message_id) });
  await setMessageStatus(record.id, "تم التسليم");
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "employee-private-messaging", mode: "private-dm-peer-admin-group-copy" });
}

export async function POST(request: NextRequest) {
  const secret = env("TELEGRAM_WEBHOOK_SECRET");
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const update = await request.json();
    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return NextResponse.json({ ok: true });
    }
    const message = update.message ?? update.edited_message;
    if (!message?.chat || !message?.from || message.from.is_bot) return NextResponse.json({ ok: true });
    const groupId = env("COMPANY_GROUP_CHAT_ID");
    if (String(message.chat.id) === String(groupId)) {
      if (message.reply_to_message) {
        await sendText(message.chat.id, "للرد على موظف، استخدم زر «الرد على الموظف» أسفل نسخة المراسلة التي أرسلها البوت.");
      } else {
        await saveGroupMessage(message, String(update.update_id));
      }
      return NextResponse.json({ ok: true });
    }
    if (message.chat.type === "private") await handlePrivateMessage(message, String(update.update_id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
