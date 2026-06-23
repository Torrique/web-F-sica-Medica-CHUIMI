const CODE_PATTERN = /^TPE-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function randomBlock(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = "";
  for (const byte of bytes) result += ALPHABET[byte % ALPHABET.length];
  return result;
}

function newCode() {
  return `TPE-${randomBlock(4)}-${randomBlock(4)}`;
}

function canaryDate(date = new Date()) {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Atlantic/Canary",
    dateStyle: "full",
    timeStyle: "medium",
  }).format(date);
}

async function readJson(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("CONTENT_TYPE");
  }
  return request.json();
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

async function createCode(env) {
  const validDays = Math.max(1, Math.min(90, Number(env.CODE_VALID_DAYS || 30)));
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + validDays * 86400000);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = newCode();
    try {
      await env.DB.prepare(
        `INSERT INTO access_codes
          (code, created_at, expires_at, status, email_status)
         VALUES (?, ?, ?, 'generated', 'not_sent')`,
      )
        .bind(code, createdAt.toISOString(), expiresAt.toISOString())
        .run();

      return json({
        ok: true,
        code,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      if (!String(error?.message || error).toLowerCase().includes("unique")) throw error;
    }
  }

  return json({ ok: false, error: "No se pudo generar un código único." }, 500);
}

async function validateAccess(request, env) {
  const body = await readJson(request);
  const code = normalizeCode(body.code);
  if (!CODE_PATTERN.test(code)) return json({ ok: false, error: "Código no válido." }, 400);

  const row = await env.DB.prepare(
    `SELECT code, expires_at, status, completed_at, email_status
       FROM access_codes
      WHERE code = ?`,
  )
    .bind(code)
    .first();

  if (!row) return json({ ok: false, error: "El código no existe." }, 404);
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare("UPDATE access_codes SET status = 'expired' WHERE code = ?").bind(code).run();
    return json({ ok: false, error: "El código ha caducado." }, 410);
  }

  await env.DB.prepare(
    `UPDATE access_codes
        SET status = CASE WHEN status = 'generated' THEN 'started' ELSE status END,
            started_at = COALESCE(started_at, ?)
      WHERE code = ?`,
  )
    .bind(new Date().toISOString(), code)
    .run();

  return json({
    ok: true,
    code,
    alreadyCompleted: Boolean(row.completed_at),
    emailStatus: row.email_status,
  });
}

async function completeViewing(request, env) {
  const body = await readJson(request);
  const code = normalizeCode(body.code);
  const watchedSeconds = Number(body.watchedSeconds);
  const durationSeconds = Number(body.durationSeconds);

  if (!CODE_PATTERN.test(code)) return json({ ok: false, error: "Código no válido." }, 400);
  if (!Number.isFinite(watchedSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return json({ ok: false, error: "Datos de reproducción no válidos." }, 400);
  }

  const percentage = Math.min(100, Math.round((watchedSeconds / durationSeconds) * 100));
  if (percentage < 90) {
    return json({ ok: false, error: "No se ha completado la visualización requerida." }, 400);
  }

  const row = await env.DB.prepare(
    `SELECT code, expires_at, completed_at, email_status, email_sent_at
       FROM access_codes
      WHERE code = ?`,
  )
    .bind(code)
    .first();

  if (!row) return json({ ok: false, error: "El código no existe." }, 404);
  if (new Date(row.expires_at).getTime() < Date.now()) return json({ ok: false, error: "El código ha caducado." }, 410);
  if (row.email_sent_at) {
    return json({ ok: true, alreadySent: true, code, percentage, sentAt: row.email_sent_at });
  }

  const claimedAt = new Date().toISOString();
  const claim = await env.DB.prepare(
    `UPDATE access_codes
        SET status = 'sending',
            watched_seconds = ?,
            duration_seconds = ?,
            percentage = ?,
            completed_at = COALESCE(completed_at, ?),
            email_status = 'sending',
            email_error = NULL
      WHERE code = ?
        AND email_sent_at IS NULL
        AND email_status IN ('not_sent', 'error')`,
  )
    .bind(Math.round(watchedSeconds), Math.round(durationSeconds), percentage, claimedAt, code)
    .run();

  if (!claim.meta?.changes) {
    return json({ ok: false, error: "La confirmación ya se está procesando. Espere unos segundos." }, 409);
  }

  const from = String(env.EMAIL_FROM || "").trim();
  const to = String(env.EMAIL_TO || "rfchuimi.scs@gobiernodecanarias.org").trim();
  if (!from) {
    await env.DB.prepare(
      "UPDATE access_codes SET status = 'email_error', email_status = 'error', email_error = ? WHERE code = ?",
    )
      .bind("EMAIL_FROM no configurado", code)
      .run();
    return json({ ok: false, error: "El remitente automático todavía no está configurado." }, 503);
  }

  const finishedAt = new Date();
  const subject = `Visualización del vídeo completada - ${code}`;
  const text = [
    "Se ha registrado automáticamente la finalización del vídeo informativo de formación en protección radiológica.",
    "",
    `Código de seguimiento: ${code}`,
    `Fecha y hora de finalización: ${canaryDate(finishedAt)}`,
    `Tiempo reproducido validado: ${Math.round(watchedSeconds)} segundos`,
    `Duración del vídeo: ${Math.round(durationSeconds)} segundos`,
    `Porcentaje validado: ${percentage}%`,
    "",
    "El formulario PDF remitido al Servicio debe contener este mismo código.",
    "Este mensaje ha sido generado automáticamente por el portal del Servicio.",
  ].join("\n");

  try {
    const result = await env.EMAIL.send({
      to: {
        email: to,
        name: "SERVICIO DE RADIOFÍSICA Y PROTECCIÓN RADIOLÓGICA CHUIMI",
      },
      from: {
        email: from,
        name: "Portal de Formación de Radiofísica CHUIMI",
      },
      replyTo: {
        email: to,
        name: "Servicio de Radiofísica y Protección Radiológica CHUIMI",
      },
      subject,
      text,
    });

    const sentAt = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE access_codes
          SET status = 'completed',
              email_status = 'sent',
              email_sent_at = ?,
              email_message_id = ?,
              email_error = NULL
        WHERE code = ?`,
    )
      .bind(sentAt, result.messageId || null, code)
      .run();

    return json({ ok: true, code, percentage, sentAt });
  } catch (error) {
    const message = String(error?.message || error).slice(0, 500);
    await env.DB.prepare(
      `UPDATE access_codes
          SET status = 'email_error',
              email_status = 'error',
              email_error = ?
        WHERE code = ?`,
    )
      .bind(message, code)
      .run();

    console.error("Automatic email failed", error);
    return json({ ok: false, error: "No se pudo enviar la confirmación automática. Inténtelo de nuevo." }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      if (!sameOrigin(request)) return json({ ok: false, error: "Origen no permitido." }, 403);

      try {
        if (url.pathname === "/api/codes" && request.method === "POST") return createCode(env);
        if (url.pathname === "/api/access" && request.method === "POST") return validateAccess(request, env);
        if (url.pathname === "/api/complete" && request.method === "POST") return completeViewing(request, env);
        return json({ ok: false, error: "Ruta no encontrada." }, 404);
      } catch (error) {
        if (String(error?.message || error) === "CONTENT_TYPE") {
          return json({ ok: false, error: "Se requiere application/json." }, 415);
        }
        console.error("API error", error);
        return json({ ok: false, error: "Error interno del servidor." }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
