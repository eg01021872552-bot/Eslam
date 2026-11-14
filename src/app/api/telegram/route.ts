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
const EMP_DEPT = "fldKpcxqlBQvb6ghN";
const MSG_DEPT = "fldkwTgS7wPqSJpV6";
const DEPT_GROUP_CHAT = "fldwXlQlXnr75eE79";
const MSG_SOURCE_CHAT = "fldAr6w4UnA01SYXE";
const DEPT_TABLE = "tblfmch4vVWwJnFO1";

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

async function copyMessage(chatId: string | number, fromChatId: string | number, messageId: number, extra: Record<string, unknown> = {}) {
  return tg("copyMessage", { chat_id: chatId, from_chat_id: fromChatId, message_id: messageId, ...extra });
}

function messageBody(message: any) {
  const caption = String(message.text ?? message.caption ?? "").trim();
  if (caption) return caption;
  if (message.photo) return "[صورة مرفقة]";
  if (message.video) return "[مقطع فيديو]";
  if (message.document) return `[مستند: ${message.document.file_name ?? "مرفق"}]`;
  if (message.voice) return "[رسالة صوتية]";
  if (message.audio) return "[ملف صوتي]";
  if (message.video_note) return "[فيديو دائري]";
  if (message.sticker) return "[ملصق]";
  if (message.animation) return "[صورة متحركة]";
  if (message.location) return "[موقع جغرافي]";
  if (message.contact) return "[جهة اتصال]";
  if (message.poll) return "[استطلاع]";
  return "";
}

function hasCopyableContent(message: any) {
  return Boolean(message.photo || message.video || message.document || message.voice || message.audio || message.video_note || message.sticker || message.animation || message.location || message.contact || message.poll);
}

function departmentIdOf(employee: any): string {
  const value = employee?.fields?.[EMP_DEPT];
  if (Array.isArray(value)) return String(value[0]?.id ?? value[0] ?? "");
  return String(value?.id ?? value ?? "");
}
function isGlobalAdmin(employee: any, actorId?: string): boolean {
  const role = String(employee?.fields?.[EMP_ROLE]?.name ?? employee?.fields?.[EMP_ROLE] ?? "");
  return role === "مدير النظام" || (!!actorId && actorId === env("ADMIN_TELEGRAM_ID"));
}
async function departmentName(id: string): Promise<string> {
  if (!id) return "";
  const record = await airtable(`${encodeURIComponent(DEPT_TABLE)}/${id}?returnFieldsByFieldId=true`);
  return String(record.fields?.["fldeOw0yyQ4o3iPlR"] ?? "");
}
function messageDepartmentIds(record: any): string[] {
  const value = record?.fields?.[MSG_DEPT];
  if (!Array.isArray(value)) return value ? [String(value.id ?? value)] : [];
  return value.map((v: any) => String(v?.id ?? v)).filter(Boolean);
}
function canAccessMessage(employee: any, record: any, actorId: string): boolean {
  if (isGlobalAdmin(employee, actorId)) return true;
  const senderId = String(record?.fields?.["fldKgUavji53gIds5"] ?? "");
  const recipientId = String(record?.fields?.["fldBr35okGCqh66Zo"] ?? "");
  return actorId === senderId || actorId === recipientId || recipientId === "ALL";
}
function isActiveEmployee(employee: any) {
  const status = employee?.fields?.[EMP_STATUS]?.name ?? employee?.fields?.[EMP_STATUS];
  return status === "على رأس العمل";
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
  departmentId: string; kind?: string; destination?: string; sourceChatId?: string;
}) {
  const existingQuery = new URLSearchParams({
    filterByFormula: `{رقم المراسلة}='${formulaValue(args.key)}'`,
    maxRecords: "1",
    returnFieldsByFieldId: "true",
  });
  const existing = await airtable(`${encodeURIComponent(MSG)}?${existingQuery}`);
  if (existing.records?.length) return { ...existing.records[0], _alreadyHandled: true };

  const fields: Record<string, unknown> = {
    "fldPh4CNH8yUHg1ab": args.key,
    "fldXGMB1LYq0p0XUj": args.senderName,
    "fldblgGsIlHJXVjH4": args.recipientName,
    "fldB243DhpbqpqpT7": args.kind ?? (args.recipientName === "الإدارة" ? "رسالة للإدارة" : "رسالة لموظف"),
    "fldn8q8IJ6PwfTo2a": args.body,
    "fldlGqy827cH3MnT4": new Date().toISOString(),
    "fldZV0JboWBmWE4ns": "جديدة",
    "fldKgUavji53gIds5": args.senderId,
    "fldBr35okGCqh66Zo": args.recipientId,
    "fld6YPZNzvd3m1u97": args.telegramMessageId ?? "",
    [MSG_SOURCE_CHAT]: args.sourceChatId ?? args.senderId,
    "fldnTKFg2r0Nzk4zi": args.destination ?? "خاص",
    [MSG_DEPT]: [args.departmentId],
  };
  const data = await airtable(`${encodeURIComponent(MSG)}?returnFieldsByFieldId=true`, { method: "POST", body: JSON.stringify({ records: [{ fields }] }) });
  return data.records?.[0];
}

async function setMessageStatus(recordId: string, status: string, note?: string) {
  const fields: Record<string, unknown> = { "fldZV0JboWBmWE4ns": status };
  if (note) fields["fldO0qVyrm5iIaTKX"] = note;
  await airtable(`${encodeURIComponent(MSG)}/${recordId}`, { method: "PATCH", body: JSON.stringify({ fields }) });
}

async function deliver(record: any, recipientId: string, body: string, senderName: string, recipientName: string, source?: any) {
  try {
    // Deliver the original message to its intended recipient first.
    const recipientKeyboard = recipientName === "الإدارة"
      ? { reply_markup: { inline_keyboard: [[{ text: "رد على الرسالة", callback_data: `reply:${record.id}` }]] } }
      : { reply_markup: { inline_keyboard: [[{ text: "رد على الرسالة", callback_data: `reply:${record.id}` }]] } };
    if (source && hasCopyableContent(source)) {
      await copyMessage(recipientId, source.chat.id, source.message_id, recipientKeyboard);
    } else {
      await sendText(recipientId, `رسالة من ${senderName}:\n\n${body}`, recipientKeyboard);
    }

    // Employee-to-employee private messages are copied to the manager only.
    // Never copy private employee correspondence into the marketing team group.
    const managerId = env("ADMIN_TELEGRAM_ID");
    const sentTo = new Set<string>([String(recipientId), String(source?.chat?.id ?? "")]);
    const timestamp = String(record.fields?.["fldlGqy827cH3MnT4"] ?? new Date().toISOString());
    const destinations: Array<{ id: string; label: string; isGroup: boolean }> = [];
    if (managerId && managerId !== String(source?.from?.id ?? "") && managerId !== String(recipientId)) {
      destinations.push({ id: managerId, label: "نسخة للمدير", isGroup: false });
    }

    for (const destination of destinations) {
      if (sentTo.has(destination.id)) continue;
      const header = `${destination.label}\nمن: ${senderName}\nإلى: ${recipientName}\nالتاريخ والوقت: ${timestamp}\n\n${body}\n\nرقم المراسلة: ${record.id}`;
      await sendText(destination.id, header);
      if (source && hasCopyableContent(source)) {
        await copyMessage(destination.id, source.chat.id, source.message_id);
      }
      sentTo.add(destination.id);
    }

    await setMessageStatus(record.id, "تم التسليم");
  } catch (e) {
    await setMessageStatus(record.id, "فشل الإرسال", String(e));
    throw e;
  }
}

async function showMenu(chatId: number, employee: any) {
  const rows: any[] = [
    [{ text: "رسالة جماعية لجميع الموظفين", callback_data: "broadcast" }],
    [{ text: "رسالة خاصة لموظف", callback_data: "new" }],
    [{ text: "مراسلة الإدارة", callback_data: "management" }],
    [{ text: "مراسلاتي", callback_data: "inbox" }],
  ];
  await sendText(chatId, `حياك ${nameOf(employee)}. اختر نوع المراسلة:`, { reply_markup: { inline_keyboard: rows } });
}

async function deliverBroadcast(record: any, body: string, senderName: string, source: any, senderId: string) {
  try {
    const all = await employees();
    const delivered = new Set<string>([senderId, String(source?.chat?.id ?? senderId)]);
    const recipients = all.filter((person: any) =>
      (person.fields?.[EMP_CHAT] || person.fields?.[EMP_TG])
    );

    for (const person of recipients) {
      const targetId = String(person.fields?.[EMP_CHAT] || person.fields?.[EMP_TG] || "");
      if (!targetId || delivered.has(targetId)) continue;
      if (source && hasCopyableContent(source)) {
        await sendText(targetId, `رسالة جماعية من ${senderName}`);
        await copyMessage(targetId, source.chat.id, source.message_id);
      } else {
        await sendText(targetId, `رسالة جماعية من ${senderName}:\n\n${body}`);
      }
      delivered.add(targetId);
    }

    const managerId = env("ADMIN_TELEGRAM_ID");
    const groupId = env("COMPANY_GROUP_CHAT_ID");
    const timestamp = String(record.fields?.["fldlGqy827cH3MnT4"] ?? new Date().toISOString());
    const destinations = [
      { id: managerId, label: "نسخة للمدير" },
      { id: groupId, label: "نسخة لمجموعة الإدارة" },
    ];
    for (const destination of destinations) {
      if (!destination.id || delivered.has(destination.id)) continue;
      await sendText(destination.id, `${destination.label}\nرسالة جماعية من: ${senderName}\nإلى: جميع الموظفين\nالتاريخ والوقت: ${timestamp}\n\n${body}\n\nرقم المراسلة: ${record.id}`);
      if (source && hasCopyableContent(source)) {
        await copyMessage(destination.id, source.chat.id, source.message_id);
      }
      delivered.add(destination.id);
    }
    await setMessageStatus(record.id, "تم التسليم");
  } catch (error) {
    await setMessageStatus(record.id, "فشل الإرسال", String(error));
    throw error;
  }
}

async function startLink(chatId: number) {
  await sendText(chatId, "لربط حسابك، اكتب اسمك الكامل كما هو مسجل في الشركة. لا تحتاج لمشاركة رقم الجوال.");
}

function normalizeName(value: string) {
  return value.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

async function linkEmployeeByName(chatId: number, fromId: string, inputName: string) {
  const wanted = normalizeName(inputName.replace(/^\/start\s*/i, ""));
  if (!wanted || wanted.length < 2) {
    await startLink(chatId);
    return;
  }
  const all = await employees();
  const matches = all.filter((r: any) => normalizeName(String(r.fields?.[EMP_NAME] ?? "")) === wanted);
  if (matches.length !== 1) {
    await sendText(chatId, matches.length > 1
      ? "الاسم متكرر في سجلات الشركة. اكتب اسمك الثلاثي أو الرباعي كما هو مسجل."
      : "ما لقينا الاسم في سجلات الموظفين. اكتب الاسم الكامل كما هو مسجل في الشركة.");
    return;
  }
  const match = matches[0];
  const existing = String(match.fields?.[EMP_TG] ?? match.fields?.[EMP_CHAT] ?? "");
  if (existing && existing !== fromId) {
    await sendText(chatId, "هذا الاسم مرتبط بحساب تيليجرام آخر. تواصل مع الإدارة لمراجعة الربط.");
    return;
  }
  const already = await employeeByTelegram(fromId);
  if (already && already.id !== match.id) {
    await sendText(chatId, "حساب تيليجرام هذا مرتبط بموظف آخر. تواصل مع الإدارة.");
    return;
  }
  await updateEmployee(match.id, { [EMP_TG]: fromId, [EMP_CHAT]: String(chatId), [EMP_LINK]: "مرتبط", [EMP_MODE]: "لا شيء", [EMP_TARGET]: "" });
  await sendText(chatId, `تم ربط حسابك بنجاح يا ${nameOf(match)}.`);
  await showMenu(chatId, match);
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
  if (match) {
    const alreadyLinked = String(match.fields?.[EMP_TG] || match.fields?.[EMP_CHAT] || "");
    if (alreadyLinked && alreadyLinked !== String(message.from.id)) {
      await sendText(message.chat.id, "حساب الموظف مرتبط مسبقاً بحساب تيليجرام آخر. اطلب من الإدارة مراجعة الربط.");
      return;
    }
  }
  if (!match) {
    await sendText(message.chat.id, "ما لقينا رقمك ضمن سجلات الموظفين. تواصل مع الإدارة لتفعيل حسابك.");
    return;
  }
  await updateEmployee(match.id, { [EMP_TG]: String(message.from.id), [EMP_CHAT]: String(message.chat.id), [EMP_LINK]: "مرتبط", [EMP_MODE]: "لا شيء", [EMP_TARGET]: "" });
  await sendText(message.chat.id, `تم ربط حسابك بنجاح يا ${nameOf(match)}.`, { reply_markup: { remove_keyboard: true } });
  await showMenu(message.chat.id, match);
}

async function handleNew(chatId: number, employee: any) {
  const list = await employees();
  const globalAdmin = isGlobalAdmin(employee, String(employee.fields?.[EMP_TG] ?? ""));
  const ownDepartment = departmentIdOf(employee);
  const rows = list.filter((r: any) =>
    r.id !== employee.id &&
    (r.fields?.[EMP_TG] || r.fields?.[EMP_CHAT]) &&
    (globalAdmin || isGlobalAdmin(r, String(r.fields?.[EMP_TG] ?? "")) || (!!ownDepartment && departmentIdOf(r) === ownDepartment))
  ).map((r: any) => ([{ text: nameOf(r), callback_data: `to:${r.id}` }]));
  if (!rows.length) return sendText(chatId, "ما فيه موظفين مرتبطين بالبوت حتى الآن.");
  await sendText(chatId, "اختر الموظف اللي تبي تراسله:", { reply_markup: { inline_keyboard: rows.slice(0, 90) } });
}

async function sendInbox(chatId: number, employee: any, actorId: string) {
  const globalAdmin = isGlobalAdmin(employee, actorId);
  const q = new URLSearchParams({ pageSize: "100", "sort[0][field]": "تاريخ ووقت الإرسال", "sort[0][direction]": "desc", returnFieldsByFieldId: "true" });
  const result = await airtable(`${encodeURIComponent(MSG)}?${q}`);
  const allRecords = result.records ?? [];
  const records = (globalAdmin ? allRecords : allRecords.filter((r: any) =>
    String(r.fields?.["fldKgUavji53gIds5"] ?? "") === actorId ||
    String(r.fields?.["fldBr35okGCqh66Zo"] ?? "") === actorId ||
    String(r.fields?.["fldBr35okGCqh66Zo"] ?? "") === "ALL"
  )).slice(0, 10);
  if (!records.length) return sendText(chatId, "ما فيه مراسلات مسجلة ضمن صلاحياتك.");
  const lines = records.map((r: any) => `من ${r.fields?.fldXGMB1LYq0p0XUj ?? "—"} إلى ${r.fields?.fldblgGsIlHJXVjH4 ?? "—"}: ${String(r.fields?.fldn8q8IJ6PwfTo2a ?? "").slice(0, 90)}`);
  const keyboard = records.map((r: any, i: number) => ([{ text: `عرض المراسلة ${i + 1}`, callback_data: `view:${r.id}` }]));
  await sendText(chatId, `سجل مراسلاتك:\n\n${lines.join("\n\n")}\n\nاختر مراسلة لعرض محتواها ومرفقاتها.`, { reply_markup: { inline_keyboard: keyboard } });
}

async function handleCallback(query: any) {
  const actorId = String(query.from.id);
  const chatId = Number(actorId);
  const employee = await employeeByTelegram(actorId);
  if (!employee || !isActiveEmployee(employee) || String(employee.fields?.[EMP_LINK]?.name ?? employee.fields?.[EMP_LINK] ?? "") !== "مرتبط") {
    await tg("answerCallbackQuery", { callback_query_id: query.id, text: "اربط حسابك أولاً", show_alert: true });
    return;
  }
  const data = String(query.data ?? "");
  if (data === "broadcast") {
    await updateEmployee(employee.id, { [EMP_MODE]: "كتابة رسالة جماعية", [EMP_TARGET]: "" });
    await tg("answerCallbackQuery", { callback_query_id: query.id });
    await sendText(chatId, "اكتب الرسالة اللي تبي توصل لجميع الموظفين. تقدر ترسل نص أو مرفق. للإلغاء أرسل /cancel");
    return;
  }
  if (data === "new") {
    await tg("answerCallbackQuery", { callback_query_id: query.id });
    await handleNew(chatId, employee);
    return;
  }
  if (data === "management") {
    const managerId = env("ADMIN_TELEGRAM_ID");
    const manager = await employeeByTelegram(managerId);
    if (!manager || !isActiveEmployee(manager) || manager.id === employee.id) {
      await tg("answerCallbackQuery", { callback_query_id: query.id, text: "تعذر تحديد حساب الإدارة", show_alert: true });
      return;
    }
    await updateEmployee(employee.id, { [EMP_MODE]: "كتابة رسالة خاصة", [EMP_TARGET]: manager.id });
    await tg("answerCallbackQuery", { callback_query_id: query.id });
    await sendText(chatId, "اكتب رسالتك للإدارة الآن. للإلغاء أرسل /cancel");
    return;
  }
  if (data === "inbox") {
    await tg("answerCallbackQuery", { callback_query_id: query.id });
    await sendInbox(chatId, employee, actorId);
    return;
  }
  if (data.startsWith("to:")) {
    const target = await employeeByRecord(data.slice(3));
    const targetIsManagement = isGlobalAdmin(target, String(target.fields?.[EMP_TG] ?? ""));
    const targetId = String(target.fields?.[EMP_TG] || target.fields?.[EMP_CHAT] || "");
    if (!isActiveEmployee(target) || (!isGlobalAdmin(employee, actorId) && !targetIsManagement && (!departmentIdOf(employee) || departmentIdOf(employee) !== departmentIdOf(target)))) {
      await tg("answerCallbackQuery", { callback_query_id: query.id, text: "ما عندك صلاحية مراسلة موظف خارج قسمك", show_alert: true });
      return;
    }
    if (!targetId || targetId === actorId) {
      await tg("answerCallbackQuery", { callback_query_id: query.id, text: "الموظف غير مرتبط أو لا يمكن مراسلة نفسك", show_alert: true });
      return;
    }
    await updateEmployee(employee.id, { [EMP_MODE]: "كتابة رسالة خاصة", [EMP_TARGET]: target.id });
    await tg("answerCallbackQuery", { callback_query_id: query.id });
    await sendText(chatId, `اكتب رسالتك إلى ${nameOf(target)} الآن. للإلغاء أرسل /cancel`);
    return;
  }
  if (data.startsWith("view:")) {
    const record = await airtable(`${encodeURIComponent(MSG)}/${data.slice(5)}?returnFieldsByFieldId=true`);
    if (!canAccessMessage(employee, record, actorId)) {
      await tg("answerCallbackQuery", { callback_query_id: query.id, text: "ما عندك صلاحية الاطلاع على هذه المراسلة", show_alert: true });
      return;
    }
    const sender = String(record.fields?.[MSG_SOURCE_CHAT] ?? record.fields?.["fldKgUavji53gIds5"] ?? "");
    const messageId = Number(record.fields?.["fld6YPZNzvd3m1u97"] ?? 0);
    if (sender && messageId) await copyMessage(chatId, sender, messageId);
    else await sendText(chatId, String(record.fields?.["fldn8q8IJ6PwfTo2a"] ?? "لا يوجد محتوى محفوظ."));
    await tg("answerCallbackQuery", { callback_query_id: query.id });
    return;
  }
  if (data.startsWith("reply:")) {
    const original = await airtable(`${encodeURIComponent(MSG)}/${data.slice(6)}?returnFieldsByFieldId=true`);
    const originalSender = String(original.fields?.["fldKgUavji53gIds5"] ?? "");
    const originalRecipient = String(original.fields?.["fldBr35okGCqh66Zo"] ?? "");
    const admin = isGlobalAdmin(employee, actorId);
    if (!canAccessMessage(employee, original, actorId)) {
      await tg("answerCallbackQuery", { callback_query_id: query.id, text: "هذه المراسلة خارج نطاق قسمك", show_alert: true });
      return;
    }
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
  if (message.contact) {
    await sendText(chatId, "لربط حسابك بالاسم، أرسل /start ثم اكتب اسمك الكامل كما هو مسجل بالشركة.");
    return;
  }
  let employee = await employeeByTelegram(fromId);
  if (!employee) {
    if (message.text === "/start") return startLink(chatId);
    return linkEmployeeByName(chatId, fromId, String(message.text ?? ""));
  }
  if (!isActiveEmployee(employee)) return sendText(chatId, "حسابك غير نشط حالياً. تواصل مع الإدارة.");
  if (!isGlobalAdmin(employee, fromId) && !departmentIdOf(employee)) return sendText(chatId, "حسابك غير مرتبط بقسم. تواصل مع الإدارة لتفعيل صلاحياتك.");
  const linkState = employee.fields?.[EMP_LINK]?.name ?? employee.fields?.[EMP_LINK];
  if (linkState !== "مرتبط") return startLink(chatId);
  const text = String(message.text ?? "").trim();
  if (text === "/start" || text === "/menu") return showMenu(chatId, employee);
  if (text === "/new") return handleNew(chatId, employee);
  if (text === "/cancel") {
    await updateEmployee(employee.id, { [EMP_MODE]: "لا شيء", [EMP_TARGET]: "" });
    return sendText(chatId, "تم إلغاء الإرسال.");
  }
  if (text === "/inbox") return sendInbox(chatId, employee, fromId);
  const body = messageBody(message);
  if (!body) return sendText(chatId, "أرسل نصاً أو مرفقاً مدعوماً. أرسل /menu لعرض الخيارات.");
  const mode = employee.fields?.[EMP_MODE]?.name ?? employee.fields?.[EMP_MODE] ?? "لا شيء";
  let target: any = null;
  if (mode === "كتابة رسالة خاصة" && employee.fields?.[EMP_TARGET]) {
    target = await employeeByRecord(String(employee.fields[EMP_TARGET]));
  } else {
    target = null; // Default free-form message is sent to management.
  }
  const isAdmin = isGlobalAdmin(employee, fromId);
  if (mode === "كتابة رسالة جماعية") {
    const departmentId = departmentIdOf(employee);
    if (!departmentId) {
      await updateEmployee(employee.id, { [EMP_MODE]: "لا شيء", [EMP_TARGET]: "" });
      return sendText(chatId, "تعذر تحديد القسم المرتبط بحسابك.");
    }
    const record = await saveMessage({
      key: `TG-BROADCAST-${updateId}`,
      senderName: nameOf(employee),
      recipientName: "جميع الموظفين",
      body,
      senderId: fromId,
      recipientId: "ALL",
      telegramMessageId: String(message.message_id),
      departmentId,
      kind: "إعلان عام",
      destination: "المجموعة",
    });
    await updateEmployee(employee.id, { [EMP_MODE]: "لا شيء", [EMP_TARGET]: "" });
    if (record._alreadyHandled && record.fields?.["fldZV0JboWBmWE4ns"] === "تم التسليم") {
      return sendText(chatId, "تم إرسال هذه الرسالة الجماعية مسبقاً.");
    }
    try {
      await deliverBroadcast(record, body, nameOf(employee), message, fromId);
      await sendText(chatId, "تم إرسال الرسالة لجميع الموظفين المرتبطين بالبوت.");
    } catch (error) {
      console.error("Broadcast delivery failed", error);
      await sendText(chatId, "تعذر إكمال إرسال الرسالة لجميع الموظفين. تم تسجيل الحالة لمراجعة الإدارة.");
    }
    return;
  }
  let recipientId = "";
  let recipientName = "";
  if (target) {
    const targetIsManagement = isGlobalAdmin(target, String(target.fields?.[EMP_TG] ?? ""));
    if (!isGlobalAdmin(employee, fromId) && !targetIsManagement && departmentIdOf(employee) !== departmentIdOf(target)) {
      await updateEmployee(employee.id, { [EMP_MODE]: "لا شيء", [EMP_TARGET]: "" });
      return sendText(chatId, "لا يمكن إرسال مراسلات خارج قسمك.");
    }
    recipientId = String(target.fields?.[EMP_TG] || target.fields?.[EMP_CHAT] || "");
    recipientName = nameOf(target);
  } else if (isAdmin) {
    await updateEmployee(employee.id, { [EMP_MODE]: "لا شيء", [EMP_TARGET]: "" });
    return sendText(chatId, "اختر الموظف أولاً عبر /new ثم اكتب رسالتك.");
  } else {
    recipientId = env("ADMIN_TELEGRAM_ID");
    recipientName = "الإدارة";
  }
  if (!recipientId) return sendText(chatId, "ما قدرنا نحدد حساب المستلم. تواصل مع الإدارة.");
  const targetIsManagement = target && isGlobalAdmin(target, String(target.fields?.[EMP_TG] ?? ""));
  const messageDepartmentId = target && !targetIsManagement ? departmentIdOf(target) : departmentIdOf(employee);
  if (!messageDepartmentId) return sendText(chatId, "تعذر تحديد القسم المرتبط بهذه المراسلة.");
  const record = await saveMessage({ key: `TG-${updateId}`, senderName: nameOf(employee), recipientName, body, senderId: fromId, recipientId, telegramMessageId: String(message.message_id), departmentId: messageDepartmentId });
  await updateEmployee(employee.id, { [EMP_MODE]: "لا شيء", [EMP_TARGET]: "" });
  if (record._alreadyHandled && record.fields?.["fldZV0JboWBmWE4ns"] === "تم التسليم") {
    return sendText(chatId, "تم استلام رسالتك وإرسالها مسبقاً.");
  }
  try {
    await deliver(record, recipientId, body, nameOf(employee), recipientName, message);
    await sendText(chatId, "تم إرسال رسالتك.");
  } catch (e) {
    console.error("Private message delivery failed", e);
    await sendText(chatId, "تعذر إرسال الرسالة حالياً. تم تسجيلها لمراجعة الإدارة.");
  }
}

async function handleGroupReply(message: any, updateId: string) {
  if (String(message.chat.id) !== env("COMPANY_GROUP_CHAT_ID")) return;
  const body = messageBody(message);
  if (!body) {
    await sendText(message.chat.id, "أرسل نص الرد أو مرفقاً مدعوماً.");
    return;
  }
  const actorId = String(message.from.id);
  const adminRecord = await employeeByTelegram(actorId);
  const role = String(adminRecord?.fields?.[EMP_ROLE]?.name ?? adminRecord?.fields?.[EMP_ROLE] ?? "");
  const isAdmin = isActiveEmployee(adminRecord) && (actorId === env("ADMIN_TELEGRAM_ID") || ["مدير", "مدير النظام"].includes(role));
  if (!isAdmin) {
    await sendText(message.chat.id, "الرد على مراسلات الموظفين متاح للإدارة فقط.");
    return;
  }
  const repliedText = String(message.reply_to_message?.text ?? message.reply_to_message?.caption ?? "");
  const match = repliedText.match(/رقم المراسلة:\s*(rec[A-Za-z0-9]{14})/);
  if (!match) {
    await sendText(message.chat.id, "للرد على موظف، اضغط رد على رسالة البوت التي تحتوي على رقم المراسلة.");
    return;
  }
  const original = await airtable(`${encodeURIComponent(MSG)}/${match[1]}?returnFieldsByFieldId=true`);
  const originalSenderId = String(original.fields?.["fldKgUavji53gIds5"] ?? "");
  const originalRecipientId = String(original.fields?.["fldBr35okGCqh66Zo"] ?? "");
  if (originalRecipientId !== env("ADMIN_TELEGRAM_ID")) {
    await sendText(message.chat.id, "هذه المراسلة ليست رسالة واردة إلى الإدارة.");
    return;
  }
  const originalEmployee = await employeeByTelegram(originalSenderId);
  if (!originalEmployee || !isActiveEmployee(originalEmployee)) {
    await sendText(message.chat.id, "تعذر تحديد الموظف صاحب المراسلة.");
    return;
  }
  const record = await saveMessage({
    key: `TG-GROUP-REPLY-${updateId}`,
    senderName: nameOf(adminRecord) || "الإدارة",
    recipientName: nameOf(originalEmployee),
    body,
    senderId: actorId,
    recipientId: originalSenderId,
    telegramMessageId: String(message.message_id),
    sourceChatId: String(message.chat.id),
    departmentId: departmentIdOf(originalEmployee),
  });
  if (record._alreadyHandled && record.fields?.["fldZV0JboWBmWE4ns"] === "تم التسليم") return;
  try {
    const replyKeyboard = { reply_markup: { inline_keyboard: [[{ text: "الرد على الإدارة", callback_data: `reply:${record.id}` }]] } };
    if (hasCopyableContent(message)) await copyMessage(originalSenderId, message.chat.id, message.message_id, replyKeyboard);
    else await sendText(originalSenderId, `رد الإدارة:\n\n${body}`, replyKeyboard);
    await setMessageStatus(record.id, "تم التسليم");
    await sendText(message.chat.id, `تم إرسال الرد إلى ${nameOf(originalEmployee)}.`);
  } catch (error) {
    await setMessageStatus(record.id, "فشل الإرسال", String(error));
    await sendText(message.chat.id, "تعذر توصيل الرد للموظف. تم تسجيل الخطأ للمراجعة.");
    throw error;
  }
}

async function handleDepartmentGroupMessage(message: any, updateId: string) {
  const chatId = String(message.chat.id);
  const senderId = String(message.from?.id ?? "");
  const employee = await employeeByTelegram(senderId);
  const text = String(message.text ?? "").trim();
  const registration = text.match(/^\/register_department(?:@\w+)?\s+(.+)$/i);
  const groups = await airtable(`${encodeURIComponent(DEPT_TABLE)}?pageSize=100&returnFieldsByFieldId=true`);

  if (registration) {
    if (!isGlobalAdmin(employee, senderId)) {
      await sendText(chatId, "تسجيل جروبات الأقسام متاح للإدارة العليا فقط.");
      return;
    }
    const requestedName = normalizeName(registration[1]);
    const departmentToRegister = (groups.records ?? []).find((r: any) =>
      normalizeName(String(r.fields?.["fldeOw0yyQ4o3iPlR"] ?? "")) === requestedName
    );
    if (!departmentToRegister) {
      await sendText(chatId, "اسم القسم غير صحيح. استخدم: التسويق أو التشغيل أو البرمجة أو المبيعات.");
      return;
    }
    await airtable(`${encodeURIComponent(DEPT_TABLE)}/${departmentToRegister.id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: { [DEPT_GROUP_CHAT]: chatId } }),
    });
    await sendText(chatId, "تم ربط هذا الجروب بقسم " + String(departmentToRegister.fields?.["fldeOw0yyQ4o3iPlR"]) + ". ستُحفظ رسائل القسم في سجله المستقل.");
    return;
  }

  const department = (groups.records ?? []).find((r: any) => String(r.fields?.[DEPT_GROUP_CHAT] ?? "").trim() === chatId);
  if (!department || !employee || !isActiveEmployee(employee)) return;
  const departmentId = String(department.id);
  const authorized = isGlobalAdmin(employee, senderId) || departmentIdOf(employee) === departmentId;
  if (!authorized) { await sendText(chatId, "ما عندك صلاحية استخدام جروب هذا القسم."); return; }
  const body = messageBody(message);
  if (!body) return;
  const record = await saveMessage({
    key: `TG-DEPT-GROUP-${updateId}`,
    senderName: nameOf(employee),
    recipientName: "جروب " + String(department.fields?.["fldeOw0yyQ4o3iPlR"] ?? "القسم"),
    body, senderId, recipientId: chatId, telegramMessageId: String(message.message_id),
    sourceChatId: chatId, departmentId, kind: "إعلان عام", destination: "المجموعة",
  });
  if (!record._alreadyHandled) await setMessageStatus(record.id, "تم التسليم");
}

export async function GET(request: NextRequest) {
  try {
    let info = await tg("getWebhookInfo", {});
    const expectedUrl = "https://etihad-almoyaser-employee-bot.vercel.app/api/telegram";
    let webhookRepaired = false;
    if (info.url !== expectedUrl) {
      await tg("setWebhook", {
        url: expectedUrl,
        secret_token: env("TELEGRAM_WEBHOOK_SECRET"),
        allowed_updates: ["message", "callback_query", "edited_message"],
        drop_pending_updates: false,
      });
      info = await tg("getWebhookInfo", {});
      webhookRepaired = true;
    }
    let adminGroupStatus = "not_configured";
    const adminGroupId = env("COMPANY_GROUP_CHAT_ID");
    if (adminGroupId) {
      try {
        const bot = await tg("getMe", {});
        const membership = await tg("getChatMember", { chat_id: adminGroupId, user_id: bot.id });
        adminGroupStatus = ["creator", "administrator", "member"].includes(String(membership.status))
          ? "connected"
          : String(membership.status ?? "unavailable");
      } catch (groupError) {
        console.error("Admin group health check failed", groupError);
        adminGroupStatus = "unavailable";
      }
    }
    return NextResponse.json({
      ok: true,
      service: "employee-private-messaging",
      mode: "employee-private-and-broadcast-messaging",
      webhookConfigured: Boolean(info.url),
      webhookMatchesEndpoint: info.url === expectedUrl,
      adminGroupConfigured: Boolean(adminGroupId),
      adminGroupStatus,
      webhookRepaired,
      pendingUpdates: info.pending_update_count ?? 0,
    });
  } catch (error) {
    console.error("Webhook health check failed", error);
    return NextResponse.json({ ok: false, service: "employee-private-messaging" }, { status: 503 });
  }
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
    if (message.chat.type === "private") {
      await handlePrivateMessage(message, String(update.update_id));
    } else if ((message.chat.type === "group" || message.chat.type === "supergroup") &&
      String(message.chat.id) === env("COMPANY_GROUP_CHAT_ID") &&
      message.reply_to_message) {
      await handleGroupReply(message, String(update.update_id));
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}