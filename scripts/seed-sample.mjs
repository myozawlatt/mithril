// `npm run seed -- <email> [--yes]`: adds ~2 months of believable spending
// (the 1st of last month through today) to one account in Supabase. The app
// picks it up on the next sync.
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (a secret / legacy
// service_role key, which bypasses RLS) in .env.local or the environment. Keep
// that key out of NEXT_PUBLIC_* and out of Vercel's client env.
//
// The rows are ordinary data: there's no "sample" flag, so remove them in the
// Table Editor if needed. Labels the user already has (same name) are reused.
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";
import { cleanLabelName, labelColorAt, labelKey } from "../lib/labels.ts";

/** Everyday spending, weighted by how often it happens. Amounts in MMK. */
const DAILY = [
  { label: "Food", weight: 30, min: 3500, max: 25000, step: 500, notes: ["Lunch", "Mohinga breakfast", "Dinner out", "Shan noodles", "", ""] },
  { label: "Coffee", weight: 14, min: 2000, max: 8000, step: 500, notes: ["Tea shop", "Iced latte", "", ""] },
  { label: "Transport", weight: 18, min: 1500, max: 15000, step: 500, notes: ["Taxi", "Bus", "Ride share", ""] },
  { label: "Groceries", weight: 10, min: 15000, max: 85000, step: 1000, notes: ["Market", "Supermarket", ""] },
  { label: "Shopping", weight: 5, min: 12000, max: 120000, step: 1000, notes: ["Clothes", "Household", ""] },
  { label: "Phone top-up", weight: 4, min: 3000, max: 20000, step: 1000, notes: [""] },
  { label: "Health", weight: 3, min: 5000, max: 60000, step: 1000, notes: ["Pharmacy", "Clinic"] },
  { label: "Fun", weight: 5, min: 8000, max: 45000, step: 1000, notes: ["Movie", "Karaoke", ""] },
];

/** How many expenses a day gets: index = count, value = weight. */
const PER_DAY = [10, 30, 35, 18, 7];

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("-"))?.trim().toLowerCase();
const yes = args.includes("--yes") || args.includes("-y");

if (!email) fail("Usage: npm run seed -- <email> [--yes]");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const missing = [!url && "NEXT_PUBLIC_SUPABASE_URL", !secret && "SUPABASE_SECRET_KEY"].filter(Boolean);
if (missing.length) {
  fail(
    `Missing ${missing.join(" and ")} (in .env.local or the environment).` +
      (secret ? "" : "\nSUPABASE_SECRET_KEY is the secret key from Supabase → Project Settings → API Keys (or the legacy service_role key)."),
  );
}

const supabase = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "mithril" },
});

// 1. The user, by email.
const user = await findUser(email);
if (!user) fail(`No user with the email ${email}.`);
console.log(`Found ${user.email} → ${user.id}`);

// 2. The spending to add.
const drafts = generate();
const from = drafts[0]?.date;
const to = drafts[drafts.length - 1]?.date;
console.log(`Will add ${drafts.length} expenses from ${from} to ${to}.`);

if (!yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("Continue? [y/N] ");
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) fail("Cancelled.", 0);
}

// 3. Labels: reuse the user's own by name, create the rest.
const labelIds = await ensureLabels(user.id, drafts);

// 4. Expenses.
const now = Date.now();
const rows = drafts.map((d) => ({
  id: randomUUID(),
  user_id: user.id,
  amount: d.amount,
  note: d.note,
  label_id: labelIds.get(labelKey(d.label)),
  date: d.date,
  created_at: d.at,
  updated_at: now,
}));
for (let i = 0; i < rows.length; i += 500) {
  const { error } = await supabase.from("expenses").insert(rows.slice(i, i + 500));
  if (error) fail(`Couldn't add expenses: ${error.message}`);
}
console.log(`Added ${rows.length} expenses for ${user.email}.`);

// ---------------------------------------------------------------------------

function fail(message, code = 1) {
  (code ? console.error : console.log)(message);
  process.exit(code);
}

/** Pages through Auth users until the email matches. */
async function findUser(target) {
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) fail(`Couldn't list users: ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
}

/** Label id per normalised name: the user's existing labels win, new ones get the next colours. */
async function ensureLabels(userId, drafts) {
  const existing = await userLabels(userId);
  const usage = new Map();
  for (const d of drafts) {
    const key = labelKey(d.label);
    const u = usage.get(key) ?? { name: cleanLabelName(d.label), count: 0, last: 0 };
    u.count += 1;
    u.last = Math.max(u.last, d.at);
    usage.set(key, u);
  }
  const now = Date.now();
  // A reused label that was deleted in the app comes back, as it would there.
  const revived = [...usage.keys()].map((key) => existing.get(key)).filter((l) => l?.deletedAt != null).map((l) => l.id);
  if (revived.length) {
    const { error } = await supabase.from("labels").update({ deleted_at: null, updated_at: now }).in("id", revived);
    if (error) fail(`Couldn't restore labels: ${error.message}`);
  }
  const fresh = [...usage].filter(([key]) => !existing.has(key));
  const rows = fresh.map(([key, u], i) => ({
    id: randomUUID(),
    user_id: userId,
    name: u.name,
    key,
    color: labelColorAt(existing.size + i),
    use_count: u.count,
    last_used_at: u.last,
    created_at: now,
    updated_at: now,
  }));
  if (rows.length) {
    // A label added meanwhile (same name) is kept; its id is read back below.
    const { error } = await supabase.from("labels").upsert(rows, { onConflict: "user_id,key", ignoreDuplicates: true });
    if (error) fail(`Couldn't add labels: ${error.message}`);
  }
  console.log(`Labels: ${existing.size ? `${usage.size - fresh.length} reused, ` : ""}${fresh.length} new.`);
  const labels = rows.length ? await userLabels(userId) : existing;
  return new Map([...labels].map(([key, l]) => [key, l.id]));
}

async function userLabels(userId) {
  const { data, error } = await supabase.from("labels").select("id, key, deleted_at").eq("user_id", userId);
  if (error) fail(`Couldn't read labels: ${error.message}`);
  return new Map(data.map((l) => [l.key, { id: l.id, deletedAt: l.deleted_at }]));
}

// --- Generation ---------------------------------------------------------------

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pick(xs) {
  return xs[Math.floor(Math.random() * xs.length)];
}

function weighted(items, weightOf) {
  const total = items.reduce((s, t, i) => s + weightOf(t, i), 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weightOf(items[i], i);
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function amountFor(p) {
  return Math.round(rand(p.min, p.max) / p.step) * p.step;
}

/** YYYY-MM-DD in this machine's local time, like the app. */
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Random spending from the 1st of last month up to now, oldest first. */
function generate() {
  const today = new Date();
  const day = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const drafts = [];
  const add = (label, amount, note, at) => drafts.push({ label, amount, note, date: dateKey(at), at: at.getTime() });

  while (day <= today) {
    const count = weighted(PER_DAY.map((_, i) => i), (i) => PER_DAY[i]);
    for (let i = 0; i < count; i++) {
      const p = weighted(DAILY, (x) => x.weight);
      const at = new Date(day);
      at.setHours(Math.floor(rand(7, 22)), Math.floor(rand(0, 60)));
      if (at <= today) add(p.label, amountFor(p), pick(p.notes), at);
    }
    // Monthly bills land early in the month.
    if (day.getDate() === 5) {
      add("Bills", amountFor({ min: 25000, max: 60000, step: 500 }), "Electricity", new Date(day));
      add("Bills", 35000, "Internet", new Date(day));
    }
    day.setDate(day.getDate() + 1);
  }
  return drafts.sort((a, b) => a.at - b.at);
}
