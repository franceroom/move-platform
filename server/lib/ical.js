// iCal minimal : génération + parsing (portage du module move-web, sans dépendance).

function foldLine(line) {
  // RFC 5545 : plier à 75 octets
  const out = [];
  let s = line;
  while (Buffer.byteLength(s, "utf8") > 73) {
    let cut = 73;
    while (Buffer.byteLength(s.slice(0, cut), "utf8") > 73) cut--;
    out.push(s.slice(0, cut));
    s = " " + s.slice(cut);
  }
  out.push(s);
  return out.join("\r\n");
}

function dateBasic(iso) { return iso.replaceAll("-", ""); }

// blocks: [{start_date, end_date, source, source_ref, id}] — end exclusif, déjà au bon format
function generate(listingSlug, blocks) {
  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MOVE France Room//move-platform//FR",
    "CALSCALE:GREGORIAN"
  ];
  for (const b of blocks) {
    const s = typeof b.start_date === "string" ? b.start_date.slice(0, 10) : b.start_date.toISOString().slice(0, 10);
    const e = typeof b.end_date === "string" ? b.end_date.slice(0, 10) : b.end_date.toISOString().slice(0, 10);
    lines.push("BEGIN:VEVENT");
    lines.push(foldLine(`UID:move-${listingSlug}-${b.id}@move.immo`));
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;VALUE=DATE:${dateBasic(s)}`);
    lines.push(`DTEND;VALUE=DATE:${dateBasic(e)}`);
    lines.push(foldLine(`SUMMARY:Indisponible (${b.source})`));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

// Parse : renvoie [{uid, start, end}] (dates ISO, end exclusif ; datetimes tronqués au jour, marge conservatrice)
function parse(icsText) {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") { if (cur && cur.start && cur.end) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const left = line.slice(0, idx).toUpperCase();
    const val = line.slice(idx + 1).trim();
    const prop = left.split(";")[0];
    if (prop === "UID") cur.uid = val;
    if (prop === "DTSTART") cur.start = icsDateToISO(val, false);
    if (prop === "DTEND") cur.end = icsDateToISO(val, true);
  }
  return events.filter(e => e.end > e.start);
}

function icsDateToISO(v, isEnd) {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2}))?/);
  if (!m) return null;
  let d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // datetime : arrondi conservateur — début au jour même, fin au jour SUIVANT si heure > 00:00
  if (m[4] && isEnd && (+m[5] > 0 || +m[6] > 0)) d = new Date(d.getTime() + 86400000);
  return d.toISOString().slice(0, 10);
}

module.exports = { generate, parse };
