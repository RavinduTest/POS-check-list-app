// Seeds the default checklist template (v1) and the first Admin.
// Env: GCLOUD_PROJECT, ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_NAME
// Emulators: set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST.
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-serp-pos" });
const db = getFirestore();
const auth = getAuth();

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const item = (label, o = {}) => ({ label, type: "checklist", required: true, allowNote: true, allowPhoto: true, ...o });
const text = (label, o = {}) => ({ label, type: "text", required: true, ...o });

const sections = [
  { name: "Machine Requirements", icon: "computer", description: "Prepare the machine", fields: [
    item("Date Format"), item("User Control"), item("Create Supervision Soft Folder"), item("Create Supervision"), item("Firewall Port") ] },
  { name: "Installation", icon: "download", description: "Install required software", fields: [
    item("Crystal Report"), item("Fonts"), item("Barcode"), item("Navicat / Patch"),
    item("SQL Server", { options: ["2019", "2008"], placeholder: "SQL Server version" }),
    item("System 32"), item("Visual Basic"), item("Customer Display", { required: false }), item("Card Reader Software", { required: false }) ] },
  { name: "Software Settings Check", icon: "settings", description: "Verify software settings", fields: [
    item("SQL Configuration"), item("SQL Management Setting"),
    item("Attach / Restore", { options: ["Attach", "Restore"] }), item("ODBC Connect"), item("Static IP") ] },
  { name: "Database", icon: "database", description: "Values recorded from the POS database",
    groups: ["m_setting", "m_branch"], fields: [
    text("Branch ID", { group: "m_setting" }), text("Code", { group: "m_setting" }),
    text("Branch Code", { group: "m_branch" }), text("Branch ID", { group: "m_branch" }) ] },
  { name: "Installation Details", icon: "info", description: "Who, where and when", fields: [
    text("Company", { role: "company" }), text("Branch", { role: "branch" }),
    { label: "Date", type: "date", required: true, defaultValue: "today", role: "installDate" },
    text("Terminal ID", { role: "terminalId" }),
    { label: "AnyDesk Number", type: "number", required: true, role: "anydeskNo", validation: { regex: "^\\d{9,10}$", message: "9–10 digits" } } ] },
];

const out = sections.map((s, si) => {
  const id = `s${si + 1}`;
  const groups = (s.groups ?? []).map((g, gi) => ({ id: `${id}_g${gi + 1}`, name: g }));
  const used = new Set();
  const fields = s.fields.map((f, fi) => {
    const { group, ...rest } = f;
    const g = groups.find((x) => x.name === group);
    let key = slug(`${g ? g.name + "_" : ""}${f.label}`);
    while (used.has(key)) key += "_2";
    used.add(key);
    return { helpText: "", placeholder: "", options: [], validation: {}, defaultValue: null, visibleIf: null,
      allowNote: false, allowPhoto: false, hidden: false, ...rest, key, order: fi, groupId: g?.id ?? null };
  });
  return { id, name: s.name, description: s.description, icon: s.icon, order: si, hidden: false, groups, fields };
});

await db.doc("templateVersions/1").set({
  sections: out, versionNo: 1, publishedBy: "seed", publishedByName: "Seed", publishedAt: FieldValue.serverTimestamp(), changeSummary: "Initial template" });
await db.doc("templateDraft/current").set({ sections: out, updatedBy: "seed", updatedAt: FieldValue.serverTimestamp() });
await db.doc("config/app").set({ currentVersion: 1, minAppVersion: "1.0.0", maintenanceMode: false }, { merge: true });
console.log("Template v1 seeded");

const username = (process.env.ADMIN_USERNAME || "admin").toLowerCase();
const password = process.env.ADMIN_PASSWORD || "ChangeMe123";
let uid;
try { uid = (await auth.getUserByEmail(`${username}@serp-pos.local`)).uid; }
catch { uid = (await auth.createUser({ email: `${username}@serp-pos.local`, password, displayName: process.env.ADMIN_NAME || "Administrator" })).uid; }
await auth.setCustomUserClaims(uid, { role: "admin", active: true });
await db.doc(`users/${uid}`).set({
  fullName: process.env.ADMIN_NAME || "Administrator", username, employeeId: "", phone: "", email: "", role: "admin",
  status: "active", mustChangePassword: true, lastLoginAt: null, createdBy: "seed", createdAt: FieldValue.serverTimestamp() }, { merge: true });
console.log(`Admin ready: ${username} / ${password} (must change on first login)`);
