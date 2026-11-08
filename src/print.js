import { BRAND, logoUrl } from './config';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const shortName = () => BRAND.short;

/** Cropped logo for printed documents (same crop as the app's <Logo />). */
const logoHtml = (width = 170) =>
  `<span class="logo-crop" style="width:${width}px"><img src="${esc(logoUrl())}" alt="${esc(BRAND.legal)}"></span>`;

/** Opens a plain A4 document in a new window with the demo watermark, then shows the print dialog. */
export function printHtml(title, bodyHtml) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 28px 40px; font-size: 13px; line-height: 1.45; }
  .doc-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 18px; }
  .doc-brand { display: flex; align-items: center; gap: 14px; }
  .logo-crop { display: block; position: relative; overflow: hidden; aspect-ratio: 1420 / 680; flex-shrink: 0; }
  .logo-crop img { position: absolute; width: 135.21%; max-width: none; left: -18.31%; top: -29.41%; }
  .center { text-align: center; }
  .center .logo-crop { margin: 0 auto 8px; }
  .box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 14px; margin: 12px 0; }
  .box .row { display: flex; justify-content: space-between; padding: 3px 0; }
  .box .row.total { border-top: 1px solid #cbd5e1; margin-top: 6px; padding-top: 8px; font-weight: 800; font-size: 14px; }
  .muted { color: #64748b; }
  .doc-head h1 { font-size: 21px; font-weight: 800; margin: 0; letter-spacing: 0.01em; }
  .doc-head p { margin: 2px 0 0; font-size: 12px; color: #334155; }
  .doc-meta { text-align: right; font-size: 12px; line-height: 1.6; }
  .facts { margin: 0 0 18px; }
  .facts div { margin: 1px 0; }
  .facts b { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; vertical-align: top; }
  th { font-weight: 700; background: #f8fafc; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tfoot td { font-weight: 700; background: #f8fafc; }
  h2 { font-size: 15px; margin: 18px 0 6px; }
  p { margin: 6px 0; }
  .sign { display: flex; gap: 40px; margin-top: 40px; }
  .sign div { flex: 1; border-top: 1px solid #0f172a; padding-top: 6px; font-size: 12px; }
  .wm { position: fixed; top: 45%; left: 50%; transform: translate(-50%, -50%) rotate(-35deg); font-size: 70px; font-weight: 800;
        color: #0f172a; opacity: 0.06; text-align: center; line-height: 1.1; white-space: nowrap; pointer-events: none; z-index: -1; }
</style></head><body>
<div class="wm">${esc(shortName().toUpperCase())}<br>PROTOTYPE</div>
${bodyHtml}
<script>window.onload = function () { setTimeout(function () { window.focus(); window.print(); }, 150); };<\/script>
</body></html>`;
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) {
    alert('Please allow pop-ups for this site to print documents.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/** Standard document header: company name + subtitle on the left, meta lines on the right. */
export const docHead = (subtitle, metaLines = []) => `
  <div class="doc-head">
    <div class="doc-brand">${logoHtml(150)}<div><h1>${esc(BRAND.legal.toUpperCase())}</h1><p>${esc(subtitle)}</p></div></div>
    <div class="doc-meta">${metaLines.map(esc).join('<br>')}</div>
  </div>`;

/** Centred receipt-style header: logo, company name, subtitle and a reference number. */
export const receiptHead = (subtitle, refNo) => `
  <div class="center" style="border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:16px">
    ${logoHtml(200)}
    <h1 style="font-size:19px;font-weight:800;margin:0">${esc(BRAND.legal.toUpperCase())}</h1>
    <p style="margin:3px 0 8px;color:#334155">${esc(subtitle)}</p>
    <b style="font-family:Consolas,monospace;border:1px solid #cbd5e1;border-radius:6px;padding:3px 10px">${esc(refNo)}</b>
  </div>`;

export const facts = (pairs) => `<div class="facts">${pairs.map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`).join('')}</div>`;

export const table = (headers, rows, foot) => `
  <table>
    <thead><tr>${headers.map((h) => `<th class="${h.num ? 'num' : ''}">${esc(h.label ?? h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${headers[i]?.num ? 'num' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    ${foot ? `<tfoot><tr>${foot.map((c, i) => `<td class="${headers[i]?.num ? 'num' : ''}">${esc(c)}</td>`).join('')}</tr></tfoot>` : ''}
  </table>`;

export const docTitle = () => `${shortName()} LMS Document`;
