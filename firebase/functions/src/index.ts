import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

initializeApp();
const db = getFirestore();
const auth = getAuth();

type Role = "technical_officer" | "supervisor" | "admin";
const ROLES: Role[] = ["technical_officer", "supervisor", "admin"];
const EMAIL_DOMAIN = "serp-pos.local";
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

async function requireAdmin(req: { auth?: { uid: string; token: Record<string, unknown> } }) {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const snap = await db.doc(`users/${req.auth.uid}`).get();
  if (!snap.exists || snap.get("role") !== "admin" || snap.get("status") !== "active")
    throw new HttpsError("permission-denied", "Admin only");
  return { uid: req.auth.uid, name: snap.get("fullName") as string };
}

async function audit(actor: { uid: string; name: string }, action: string, target: string, details: object = {}) {
  await db.collection("auditLogs").add({ actor, action, target, details, at: FieldValue.serverTimestamp() });
}

async function activeAdminCount() {
  const q = await db.collection("users").where("role", "==", "admin").where("status", "==", "active").count().get();
  return q.data().count;
}

async function setClaims(uid: string, role: Role, active: boolean) {
  await auth.setCustomUserClaims(uid, { role, active });
}

export const createUser = onCall(async (req) => {
  const admin = await requireAdmin(req);
  const d = req.data ?? {};
  const username = String(d.username ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new HttpsError("invalid-argument", "Invalid username");
  if (!ROLES.includes(d.role)) throw new HttpsError("invalid-argument", "Invalid role");
  if (!d.fullName) throw new HttpsError("invalid-argument", "Full name required");
  if (!PASSWORD_RE.test(String(d.password ?? ""))) throw new HttpsError("invalid-argument", "Password must be 8+ chars with a letter and a number");
  let user;
  try {
    user = await auth.createUser({ email: `${username}@${EMAIL_DOMAIN}`, password: d.password, displayName: d.fullName });
  } catch (e: any) {
    if (e.code === "auth/email-already-exists") throw new HttpsError("already-exists", "Username already taken");
    throw e;
  }
  await setClaims(user.uid, d.role, true);
  await db.doc(`users/${user.uid}`).set({
    fullName: d.fullName, username, employeeId: d.employeeId ?? "", phone: d.phone ?? "", email: d.email ?? "",
    role: d.role, status: "active", mustChangePassword: true, lastLoginAt: null,
    createdBy: admin.uid, createdAt: FieldValue.serverTimestamp(),
  });
  await audit(admin, "user_created", user.uid, { username, role: d.role });
  return { uid: user.uid };
});

export const updateUser = onCall(async (req) => {
  const admin = await requireAdmin(req);
  const { uid, fullName, employeeId, phone, email } = req.data ?? {};
  if (!uid) throw new HttpsError("invalid-argument", "uid required");
  await db.doc(`users/${uid}`).update({ fullName, employeeId: employeeId ?? "", phone: phone ?? "", email: email ?? "" });
  await auth.updateUser(uid, { displayName: fullName });
  await audit(admin, "user_updated", uid);
  return { ok: true };
});

export const updateUserRole = onCall(async (req) => {
  const admin = await requireAdmin(req);
  const { uid, role } = req.data ?? {};
  if (!ROLES.includes(role)) throw new HttpsError("invalid-argument", "Invalid role");
  const ref = db.doc(`users/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "User not found");
  if (snap.get("role") === "admin" && role !== "admin" && snap.get("status") === "active" && (await activeAdminCount()) <= 1)
    throw new HttpsError("failed-precondition", "The last active Admin cannot be demoted");
  await ref.update({ role });
  await setClaims(uid, role, snap.get("status") === "active");
  await auth.revokeRefreshTokens(uid);
  await audit(admin, "role_changed", uid, { from: snap.get("role"), to: role });
  return { ok: true };
});

export const setUserStatus = onCall(async (req) => {
  const admin = await requireAdmin(req);
  const { uid, status } = req.data ?? {};
  if (!["active", "inactive"].includes(status)) throw new HttpsError("invalid-argument", "Invalid status");
  const ref = db.doc(`users/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "User not found");
  if (snap.get("role") === "admin" && status === "inactive" && snap.get("status") === "active" && (await activeAdminCount()) <= 1)
    throw new HttpsError("failed-precondition", "The last active Admin cannot be deactivated");
  await ref.update({ status });
  await auth.updateUser(uid, { disabled: status === "inactive" });
  await setClaims(uid, snap.get("role"), status === "active");
  if (status === "inactive") await auth.revokeRefreshTokens(uid);
  await audit(admin, status === "inactive" ? "user_deactivated" : "user_reactivated", uid);
  return { ok: true };
});

export const deleteUser = onCall(async (req) => {
  const admin = await requireAdmin(req);
  const { uid } = req.data ?? {};
  if (!uid) throw new HttpsError("invalid-argument", "uid required");
  if (uid === admin.uid) throw new HttpsError("failed-precondition", "You cannot delete your own account");
  const ref = db.doc(`users/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "User not found");
  if (snap.get("role") === "admin" && snap.get("status") === "active" && (await activeAdminCount()) <= 1)
    throw new HttpsError("failed-precondition", "The last active Admin cannot be deleted");
  try { await auth.deleteUser(uid); } catch (e: any) { if (e.code !== "auth/user-not-found") throw e; }
  await ref.delete();
  // Records keep technicianId/technicianName, so history stays intact.
  await audit(admin, "user_deleted", uid, { username: snap.get("username"), fullName: snap.get("fullName"), role: snap.get("role") });
  return { ok: true };
});

export const resetPassword = onCall(async (req) => {
  const admin = await requireAdmin(req);
  const { uid, password } = req.data ?? {};
  if (!PASSWORD_RE.test(String(password ?? ""))) throw new HttpsError("invalid-argument", "Password must be 8+ chars with a letter and a number");
  await auth.updateUser(uid, { password });
  await auth.revokeRefreshTokens(uid);
  await db.doc(`users/${uid}`).update({ mustChangePassword: true });
  await audit(admin, "password_reset", uid);
  return { ok: true };
});

/** Called by clients after a successful sign-in / password change. */
export const markLogin = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const patch: Record<string, unknown> = { lastLoginAt: FieldValue.serverTimestamp() };
  if (req.data?.passwordChanged) patch.mustChangePassword = false;
  await db.doc(`users/${req.auth.uid}`).update(patch);
  return { ok: true };
});

export const publishTemplate = onCall(async (req) => {
  const admin = await requireAdmin(req);
  const draftSnap = await db.doc("templateDraft/current").get();
  if (!draftSnap.exists) throw new HttpsError("failed-precondition", "No draft");
  const draft = draftSnap.data()!;
  const sections: any[] = draft.sections ?? [];
  if (!sections.length) throw new HttpsError("failed-precondition", "Template has no sections");
  const keys = new Set<string>();
  for (const s of sections) {
    if (!s.name) throw new HttpsError("invalid-argument", "Every section needs a name");
    for (const f of s.fields ?? []) {
      if (!f.label || !f.key) throw new HttpsError("invalid-argument", `Field in "${s.name}" needs a label`);
      if (keys.has(f.key)) throw new HttpsError("invalid-argument", `Duplicate field key ${f.key}`);
      keys.add(f.key);
      if (["dropdown", "multiselect"].includes(f.type) && !(f.options ?? []).length)
        throw new HttpsError("invalid-argument", `Field "${f.label}" needs options`);
    }
  }
  const cfgRef = db.doc("config/app");
  const versionNo = await db.runTransaction(async (tx) => {
    const cfg = await tx.get(cfgRef);
    const next = ((cfg.get("currentVersion") as number | undefined) ?? 0) + 1;
    tx.set(db.doc(`templateVersions/${next}`), {
      ...draft, versionNo: next, publishedBy: admin.uid, publishedByName: admin.name,
      publishedAt: FieldValue.serverTimestamp(), changeSummary: String(req.data?.changeSummary ?? ""),
    });
    tx.set(cfgRef, { currentVersion: next }, { merge: true });
    return next;
  });
  await audit(admin, "template_published", `v${versionNo}`, { changeSummary: req.data?.changeSummary ?? "" });
  return { versionNo };
});

// ---- record triggers ----

function visibleFields(tpl: any): any[] {
  return (tpl?.sections ?? []).filter((s: any) => !s.hidden).flatMap((s: any) => (s.fields ?? []).filter((f: any) => !f.hidden));
}
function isAnswered(a: any) {
  if (!a) return false;
  if (a.status) return true;
  const v = a.value;
  return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
}

export const onRecordWrite = onDocumentWritten("records/{id}", async (event) => {
  const before = event.data?.before.exists ? event.data.before.data()! : null;
  const after = event.data?.after.exists ? event.data.after.data()! : null;
  if (!after) return;
  const ref = event.data!.after.ref;
  const patch: Record<string, unknown> = {};

  // completion %
  const tplSnap = await db.doc(`templateVersions/${after.templateVersion}`).get();
  const fields = visibleFields(tplSnap.data());
  if (fields.length) {
    const done = fields.filter((f) => isAnswered(after.answers?.[f.key])).length;
    const pct = Math.round((done / fields.length) * 100);
    if (pct !== after.completionPct) patch.completionPct = pct;
  }

  // recordNo on first submit
  if (after.status === "submitted" && !after.recordNo) {
    const counter = db.doc("counters/records");
    patch.recordNo = await db.runTransaction(async (tx) => {
      const n = ((await tx.get(counter)).get("lastNo") as number | undefined ?? 0) + 1;
      tx.set(counter, { lastNo: n }, { merge: true });
      return `POS-${new Date().getFullYear()}-${String(n).padStart(6, "0")}`;
    });
  }
  if (Object.keys(patch).length) await ref.update(patch);

  // history
  const hist = ref.collection("history");
  const by = { byUid: after.updatedBy ?? "", byName: after.updatedByName ?? "" };
  const at = FieldValue.serverTimestamp();
  if (!before) {
    await hist.add({ action: "created", ...by, at });
    return;
  }
  if (before.status !== after.status) {
    const action = after.status === "submitted" ? "submitted" : after.status;
    await hist.add({ action, ...by, at, comment: after.reviewComment ?? "" });
    if (["approved", "returned"].includes(after.status)) {
      const u = await db.doc(`users/${after.technicianId}`).get();
      const tokens: string[] = u.get("fcmTokens") ?? [];
      if (tokens.length)
        await getMessaging().sendEachForMulticast({
          tokens,
          notification: { title: `Record ${after.status}`, body: `${after.company ?? ""} ${after.branch ?? ""} – ${after.terminalId ?? ""}` },
          data: { recordId: event.params.id },
        }).catch(() => undefined);
    }
  }
  if (before.deleted !== after.deleted) await hist.add({ action: after.deleted ? "deleted" : "restored", ...by, at });
  if (before.status === after.status && after.status !== "draft") {
    const changes: object[] = [];
    for (const k of new Set([...Object.keys(before.answers ?? {}), ...Object.keys(after.answers ?? {})])) {
      const o = JSON.stringify(before.answers?.[k] ?? null), n = JSON.stringify(after.answers?.[k] ?? null);
      if (o !== n) changes.push({ fieldKey: k, old: before.answers?.[k] ?? null, new: after.answers?.[k] ?? null });
    }
    if (changes.length) await hist.add({ action: "edited", ...by, at, changes });
  }
});

export const purgeDeletedRecords = onSchedule("every day 02:00", async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - 30 * 86400_000);
  const q = await db.collection("records").where("deleted", "==", true).where("deletedAt", "<", cutoff).get();
  for (const d of q.docs) await db.recursiveDelete(d.ref);
});
