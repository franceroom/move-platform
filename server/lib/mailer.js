// Emails transactionnels : Brevo (API) si BREVO_API_KEY, sinon journal console (dev).
async function send({ to, subject, text }) {
  if (!process.env.BREVO_API_KEY) {
    console.log(`[mail:dev] à=${to} | ${subject} | ${text.replace(/\n/g, " ⏎ ")}`);
    return { dev: true };
  }
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: { name: "Move", email: process.env.MAIL_FROM || "no-reply@move.immo" },
      to: [{ email: to }],
      subject, textContent: text
    }),
    signal: AbortSignal.timeout(15000)
  });
  if (!resp.ok) console.error("[mail] échec", resp.status, await resp.text());
  return { ok: resp.ok };
}
module.exports = { send };
