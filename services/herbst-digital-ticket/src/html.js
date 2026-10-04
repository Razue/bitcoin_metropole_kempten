export function verificationUrl(port, token) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("port");
  }
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) {
    throw new Error("token");
  }
  return `http://127.0.0.1:${port}/verify/${token}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

const CSS = `
:root {
  --bg: #070705;
  --ink: #f7f1df;
  --gold: #e2bf62;
  --gold-2: #f8e7b0;
  --line: rgba(226, 191, 98, 0.55);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; max-width: 100%; }
body {
  min-height: 100vh;
  overflow-x: hidden;
  background:
    radial-gradient(880px 380px at 50% -8%, rgba(226, 191, 98, 0.16), transparent 58%),
    var(--bg);
  color: var(--ink);
  font-family: Palatino, "Palatino Linotype", "Iowan Old Style", Georgia, serif;
  padding: 16px 14px 36px;
}
.banner, .kicker, .word, .of, .paid, .admit, .hint, dt, .verdict, .home a {
  font-family: "Segoe UI", Helvetica, Arial, sans-serif;
}
.banner {
  max-width: 920px;
  margin: 0 auto 12px;
  text-align: center;
  font-size: 12px;
  letter-spacing: 0.08em;
  line-height: 1.45;
  text-transform: uppercase;
  color: var(--gold);
}
.ticket, .card {
  position: relative;
  width: 100%;
  max-width: 920px;
  margin: 0 auto;
  background: linear-gradient(180deg, #16140e 0%, #090907 42%, #0e0c08 100%);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45), inset 0 0 0 6px rgba(226, 191, 98, 0.07);
  overflow: hidden;
}
.ticket { display: flex; flex-direction: column; }
.face, .stub, .card { position: relative; z-index: 1; }
.face { padding: 22px 18px 20px; min-width: 0; }
.ticket::after, .card::after {
  content: "";
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(226, 191, 98, 0.32);
  border-radius: 12px;
  pointer-events: none;
}
.watermark {
  position: absolute;
  width: min(280px, 78%);
  right: -24px;
  bottom: -36px;
  opacity: 0.2;
  pointer-events: none;
  user-select: none;
}
header { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; min-width: 0; width: 100%; }
.logo { width: 84px; max-width: 28vw; height: auto; display: block; flex: 0 0 auto; }
.titles { min-width: 0; flex: 1 1 160px; }
.kicker {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.08em;
  line-height: 1.35;
  text-transform: uppercase;
  color: var(--gold);
  overflow-wrap: anywhere;
}
h1 {
  margin: 4px 0 0;
  max-width: 100%;
  font-size: clamp(22px, 6.2vw, 36px);
  font-weight: 500;
  line-height: 1.15;
  letter-spacing: 0.02em;
  color: var(--gold-2);
  overflow-wrap: anywhere;
}
.word {
  margin: 18px 0 0;
  font-size: 13px;
  letter-spacing: 0.38em;
  color: var(--gold);
}
.number-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}
.num {
  margin: 0;
  font-size: clamp(64px, 18vw, 108px);
  line-height: 0.9;
  font-weight: 600;
  color: #f0d48a;
}
.of {
  margin: 0 0 8px;
  letter-spacing: 0.18em;
  font-size: 14px;
  color: var(--gold-2);
  white-space: nowrap;
}
.paid {
  display: inline-block;
  margin: 10px 0 16px;
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid #f0d48a;
  letter-spacing: 0.14em;
  font-size: 13px;
  color: #1a1406;
  background: linear-gradient(180deg, #f8e7b0, #e0b84e 55%, #b8882e);
}
dl { margin: 0; display: grid; gap: 8px; }
dt {
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(226, 191, 98, 0.8);
}
dd { margin: 2px 0 0; font-size: 17px; line-height: 1.35; }
.stub {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 18px 16px 22px;
  background: #100e09;
  border-top: 2px dashed rgba(226, 191, 98, 0.6);
}
.key { width: 36px; height: auto; }
.admit {
  margin: 0;
  letter-spacing: 0.2em;
  font-size: 12px;
  color: var(--gold);
}
.qr {
  width: min(210px, 58vw);
  max-width: 100%;
  height: auto;
  background: #ffffff;
  padding: 8px;
  border-radius: 8px;
}
.hint {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(247, 241, 223, 0.74);
  text-align: center;
}
.card { padding: 28px 18px 32px; text-align: center; }
.card .logo { margin: 0 auto 8px; }
.verdict {
  margin: 8px 0 4px;
  font-size: clamp(34px, 9vw, 60px);
  letter-spacing: 0.08em;
  line-height: 1.05;
}
.verdict.valid { color: #f0d48a; }
.verdict.invalid { color: #d1614f; }
.card .meta { margin-top: 18px; }
.card dd { font-size: 18px; }
.home {
  max-width: 920px;
  margin: 18px auto 0;
  text-align: center;
}
.home a { color: var(--gold-2); }
@media (max-width: 799px) {
  .ticket { flex-direction: column; }
  .stub { width: 100%; border-left: 0; }
  .of { margin-bottom: 0; }
}
@media (min-width: 800px) {
  body { padding: 32px 20px 48px; }
  .ticket { flex-direction: row; align-items: stretch; }
  .face { flex: 1; padding: 32px 28px 28px; }
  .stub {
    width: 250px;
    border-top: 0;
    border-left: 2px dashed rgba(226, 191, 98, 0.6);
  }
  .watermark { width: 340px; }
  .card { padding: 40px 32px 44px; }
}
`;

function shell(title, inner) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
<p class="banner">Lokale Vorschau<br>Kein Produktionsticket Â· kein Check-in</p>
${inner}
</body>
</html>`;
}

export function renderTicketPage({ number, qrDataUrl }) {
  const n = Number(number);
  return shell("Bitcoin Herbst 2026 Ticket", `
<article class="ticket">
  <div class="face">
    <img class="watermark" src="/images/bitcoin-herbst-leaf-transparent.png" alt="">
    <header>
      <img class="logo" src="/images/goldenLogoHerbst.png" alt="Goldenes Ahornblatt mit Bitcoin-Zeichen">
      <div class="titles">
        <p class="kicker">Bitcoin Metropole Kempten</p>
        <h1>BITCOIN HERBST 2026</h1>
      </div>
    </header>
    <p class="word">TICKET</p>
    <div class="number-row">
      <p class="num" data-ticket-number="${n}">${n}</p>
      <p class="of">VON 50</p>
    </div>
    <p class="paid">PAID / VALID</p>
    <dl>
      <div><dt>Datum</dt><dd>20.â€“21. November 2026</dd></div>
      <div><dt>Ort</dt><dd>Bitcoin Metropole Kempten</dd></div>
      <div><dt>Eintritt</dt><dd>100000 sats</dd></div>
    </dl>
  </div>
  <aside class="stub">
    <img class="key" src="/images/gold_transparent.png" alt="">
    <p class="admit">ADMIT ONE</p>
    <img class="qr" alt="QR-Code zur PrÃ¼fung" src="${qrDataUrl}">
    <p class="hint">PrÃ¼fung vor Ort</p>
  </aside>
</article>`);
}

export function renderVerifyPage({ valid, number }) {
  const verdict = valid
    ? `<p class="verdict valid">GÃœLTIG</p>
       <div class="number-row">
         <p class="num" data-ticket-number="${Number(number)}">${Number(number)}</p>
         <p class="of">VON 50</p>
       </div>`
    : `<p class="verdict invalid">UNGÃœLTIG</p>`;
  return shell("Bitcoin Herbst 2026 PrÃ¼fung", `
<article class="card">
  <img class="watermark" src="/images/bitcoin-herbst-leaf-transparent.png" alt="">
  <img class="logo" src="/images/goldenLogoHerbst.png" alt="Goldenes Ahornblatt mit Bitcoin-Zeichen">
  <h1>BITCOIN HERBST 2026</h1>
  ${verdict}
  <dl class="meta">
    <div><dt>Datum</dt><dd>20.â€“21. November 2026</dd></div>
    <div><dt>Ort</dt><dd>Bitcoin Metropole Kempten</dd></div>
  </dl>
</article>`);
}

export function renderHome(links) {
  const list = links.length
    ? `<p><a href="${escapeHtml(links[0])}">Lokales Fixture-Ticket Ã¶ffnen</a></p>`
    : `<p>Keine Fixture-Tickets in dieser Datenbank.</p>`;
  return shell("Bitcoin Herbst 2026 Vorschau", `
<article class="card">
  <img class="logo" src="/images/goldenLogoHerbst.png" alt="Goldenes Ahornblatt mit Bitcoin-Zeichen">
  <h1>BITCOIN HERBST 2026</h1>
  <p>20.â€“21. November 2026<br>Bitcoin Metropole Kempten</p>
  ${list}
</article>`);
}
