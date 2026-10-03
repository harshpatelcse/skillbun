/**
 * SkillBun Email Design System — technical-document layout.
 *
 * FRAME (no floating card, no page backdrop, no colour panel, no pills):
 *   1. Masthead   — logo lockup left, monospace document tag right, hairline rule.
 *   2. Title block— eyebrow / headline / lede / meta line, left-aligned.
 *   3. Content    — composed from motifs: node rail, segmented track, spec
 *                   sheet, stat band, data block, tags, note, points.
 *   4. Footer     — hairline rule, small lockup, links, legal line.
 *
 * The page and the sheet are the SAME flat surface. The email must never look
 * like a card floating on a textured or tinted backdrop — no page-level grid,
 * pattern, gradient or contrasting background behind the content, and no border
 * or shadow around it. Ornament belongs inside the content, not underneath it.
 *
 * The palette is monochrome: ink on white, hairline rules, one muted grey.
 * SkillBun's logo is a circuit-trace sapling, so the motifs borrow from
 * schematics and code — gutter rails, monospace metadata, segmented tracks —
 * rather than from marketing decoration. The brand green appears only as a
 * small active-state marker, echoing the logo without flooding the page.
 * Red is reserved for genuine security signal.
 *
 * GRAPHICS: every ornament is drawn with table cells or CSS gradients, never
 * with an image file, for two reasons. Images are blocked by default in most
 * inboxes, and a hosted PNG cannot follow the reader's theme. Cells and
 * gradients can — each one carries a class hook that the dark block repaints.
 * Gradients always sit on top of a solid background-color, so the clients that
 * drop them (Outlook's Word engine) still get the flat surface underneath. They
 * are used only on contained elements, never on the page itself.
 *
 * Nothing here is laid out with `display`. Outlook for Windows renders through
 * Word, which supports only `display:none`, so inline-block boxes lose their
 * padding and their vertical margins there. Anything that needs a box — a
 * button, a tag — is a table cell floated with `align`, with `mso-padding-alt`
 * on the cell so Word restores the padding it dropped.
 *
 * THEME SYNC: the email follows the reader's device automatically. That needs
 * four things working together, because no single one covers every inbox:
 *   1. <meta name="color-scheme"> + <meta name="supported-color-schemes">, so
 *      Apple Mail and iOS know the design handles dark and skip auto-inversion.
 *   2. :root { color-scheme: light dark } for the same reason in webmail.
 *   3. @media (prefers-color-scheme: dark) — Apple Mail, iOS, Outlook for Mac.
 *   4. [data-ogsc] / [data-ogsb] copies of every dark rule, because Outlook.com
 *      and the Windows Outlook app rewrite inline colours and stamp those
 *      attributes instead of honouring the media query.
 * Light stays inline (what a client renders when it strips <style> entirely),
 * so the fallback is always the readable one.
 *
 * NOTE ON THE LOGO: inline SVG is stripped by Gmail, Outlook and Yahoo, so the
 * mark must ship as a raster. We use /logo-tight.png — the cropped 53x78 art —
 * because /logo.png is a 128x128 canvas whose glyph occupies only the middle
 * 53x78, which renders the mark far too small at masthead sizes. Both files are
 * transparent PNGs, so no background is painted behind them in either theme.
 */

export const SITE_URL = 'https://skillbun.tech';
export const LOGO_URL = `${SITE_URL}/logo-tight.png`;
export const LOGO_WIDTH = 18;
export const LOGO_HEIGHT = 26;
export const WORDMARK = 'ꌗꀘꀤ꒒꒒ꌃꀎꈤ';

export const TOKENS = {
  light: {
    // Page and sheet are one surface — nothing sits behind the content.
    pageBg: '#FFFFFF',
    card: '#FFFFFF',
    ink: '#1A1A1A',
    text: '#1A1A1A',
    muted: '#6E6D68',
    faint: '#706F69',
    hairline: '#E7E7E3',
    border: '#DCDCD7',
    surfaceRaised: '#FAFAF8',
    surfaceSunken: '#F5F5F2',
    danger: '#B42318',
    dangerText: '#7A271A',
    dangerSubtle: '#FEF3F2',
    // Sampled from the logo's circuit traces. Used only for active-state marks.
    brand: '#27B652',
    // Back-compat aliases — the accent is ink now, not a hue.
    accent: '#1A1A1A',
    green: '#1A1A1A',
    darkGreen: '#1A1A1A',
    deepGreen: '#1A1A1A',
    lime: '#1A1A1A',
    greenSubtle: '#F5F5F2',
  },
  dark: {
    pageBg: '#0D0D0D',
    card: '#0D0D0D',
    ink: '#EDEDEA',
    text: '#EDEDEA',
    muted: '#A3A29C',
    faint: '#A3A29C',
    hairline: '#2C2C29',
    border: '#333330',
    surfaceRaised: '#1D1D1B',
    surfaceSunken: '#212120',
    danger: '#F87171',
    dangerText: '#FCA5A5',
    dangerSubtle: '#2A1A1A',
    brand: '#3ED971',
    accent: '#EDEDEA',
  },
};

const L = TOKENS.light;
const D = TOKENS.dark;

/*
 * Background texture for raised panels (credentials, records): a dot matrix laid
 * over a solid colour, so a client that drops background-image still renders the
 * flat surface. Textures are only ever applied to a contained element — never to
 * the page, which stays flat so the sheet cannot read as a floating card.
 */
function perfboardBg(t, important = false) {
  const i = important ? ' !important' : '';
  return `background-color:${t.surfaceRaised}${i}; background-image:radial-gradient(${t.hairline} 1px, transparent 1px)${i}; background-size:13px 13px${i}; background-position:0 0${i};`;
}

const BODY_FONT = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const DISPLAY_FONT = "'Fredoka', 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const MONO_FONT = "'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/* =====================================================================
 * CONTENT MOTIFS
 * Text/label/html args are TRUSTED markup — callers escape dynamic data.
 * Only href values are escaped defensively here.
 * ===================================================================== */

/** Body copy. */
export function emailText(html) {
  return `<p class="sb-text" style="font-family:${BODY_FONT}; margin:0 0 18px 0; font-size:15.5px; line-height:1.72; color:${L.text};">${html}</p>`;
}

/** Full-width hairline rule. */
export function emailDivider() {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; margin:28px 0;"><tr>
    <td class="sb-hr" height="1" style="height:1px; background-color:${L.hairline}; font-size:0; line-height:0;">&nbsp;</td>
  </tr></table>`;
}

/**
 * Scale rule — a hairline with measurement ticks above it, like the axis of a
 * technical drawing. Every sixth tick is taller. Tick cells are a fixed 1px and
 * the gaps between them are auto-width, so the whole rule stays responsive
 * without media queries. Drawn in cells, so it survives Outlook intact.
 */
export function emailScaleRule({ ticks = 31 } = {}) {
  const cells = [];
  for (let i = 0; i < ticks; i += 1) {
    const height = i % 6 === 0 ? 8 : 3;
    cells.push(
      `<td width="1" style="width:1px; vertical-align:bottom; font-size:0; line-height:0;"><div class="sb-tick" style="width:1px; height:${height}px; background-color:${L.border}; font-size:0; line-height:0;">&nbsp;</div></td>`
    );
    if (i < ticks - 1) cells.push('<td style="font-size:0; line-height:0;">&nbsp;</td>');
  }
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
    <tr>${cells.join('')}</tr>
    <tr><td colspan="${ticks * 2 - 1}" class="sb-hr" height="1" style="height:1px; background-color:${L.hairline}; font-size:0; line-height:0; padding-top:3px;">&nbsp;</td></tr>
  </table>`;
}

/**
 * Corner-bracket frame — crop marks around a block, the way a drawing sheet
 * frames a detail view. Only the four corners are drawn, so it reads as a
 * technical annotation rather than as a box. An optional monospace label sits
 * on the top edge like a drawing title.
 */
export function emailFrame(innerHtml, { label = '' } = {}) {
  const corner = (vertical, horizontal) =>
    `<td width="18" height="14" class="sb-frame" style="width:18px; height:14px; border-${vertical}:1px solid ${L.border}; border-${horizontal}:1px solid ${L.border}; font-size:0; line-height:0;">&nbsp;</td>`;

  const labelCell = label
    ? `<td class="sb-faint sb-frame-top" align="center" style="text-align:center; padding:0 10px; font-family:${MONO_FONT}; font-size:10px; font-weight:700; letter-spacing:1.4px; text-transform:uppercase; color:${L.faint}; overflow-wrap:anywhere;">${escapeHtml(label)}</td>`
    : '<td style="font-size:0; line-height:0;">&nbsp;</td>';

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; margin:0 0 26px 0;">
    <tr>${corner('top', 'left')}${labelCell}${corner('top', 'right')}</tr>
    <tr>
      <td style="font-size:0; line-height:0;">&nbsp;</td>
      <td style="font-family:${BODY_FONT}; padding:16px 8px;">${innerHtml}</td>
      <td style="font-size:0; line-height:0;">&nbsp;</td>
    </tr>
    <tr>${corner('bottom', 'left')}<td style="font-size:0; line-height:0;">&nbsp;</td>${corner('bottom', 'right')}</tr>
  </table>`;
}

/**
 * Circuit rule — a hairline broken by square pads, the way a PCB trace runs
 * between vias. This is the logo's circuit-trace motif reduced to a divider.
 *
 * Built from solid-colour cells with a div inside each one, because a td with a
 * background fills its whole cell height regardless of the height attribute.
 * Solid backgrounds are the only graphics primitive with universal client
 * support (gradients sit around 60% and are buggy in Gmail Android), so the
 * ornaments that must always render are drawn this way rather than with CSS.
 */
export function emailCircuitRule({ pads = 3 } = {}) {
  const line = `<td style="vertical-align:middle; font-size:0; line-height:0;"><div class="sb-hr" style="height:1px; background-color:${L.hairline}; font-size:0; line-height:0;">&nbsp;</div></td>`;
  const pad = `<td width="7" style="width:7px; vertical-align:middle; font-size:0; line-height:0;"><div class="sb-tick" style="width:7px; height:7px; background-color:${L.border}; border-radius:1px; font-size:0; line-height:0;">&nbsp;</div></td>`;

  const cells = [line];
  for (let i = 0; i < pads; i += 1) {
    cells.push(pad, line);
  }
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;"><tr>${cells.join('')}</tr></table>`;
}

/**
 * Component block — a headline fact packaged like a part on a board: pin rows
 * down both edges, dot-matrix substrate, monospace part label. Used where a
 * single artefact is the point of the email (a credential, a role), so it reads
 * as the object itself rather than as another row of copy.
 */
export function emailChipBlock({ eyebrow = '', title, meta = '', pins = 4 }) {
  const pinRows = [];
  for (let i = 0; i < pins; i += 1) {
    pinRows.push(
      `<tr><td style="font-size:0; line-height:0;"><div class="sb-tick" style="width:9px; height:2px; background-color:${L.border}; font-size:0; line-height:0;">&nbsp;</div></td></tr>`
    );
    if (i < pins - 1) pinRows.push('<tr><td height="9" style="height:9px; font-size:0; line-height:0;">&nbsp;</td></tr>');
  }
  const pinStack = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">${pinRows.join('')}</table>`;

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; margin:0 0 26px 0;"><tr>
    <td class="sb-strip" style="font-family:${BODY_FONT}; ${perfboardBg(L)} border:1px solid ${L.hairline}; border-radius:10px; padding:22px 18px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;"><tr>
        <td width="9" style="font-family:${BODY_FONT}; width:9px; vertical-align:middle;">${pinStack}</td>
        <td align="center" style="font-family:${BODY_FONT}; padding:0 16px; text-align:center;">
          ${eyebrow ? `<div class="sb-faint" style="font-family:${MONO_FONT}; font-size:10px; font-weight:700; letter-spacing:1.6px; text-transform:uppercase; color:${L.faint};">${escapeHtml(eyebrow)}</div>` : ''}
          <div class="sb-text" style="font-family:${DISPLAY_FONT}; font-size:19px; font-weight:700; color:${L.ink}; line-height:1.35; letter-spacing:-0.2px; margin-top:${eyebrow ? '9px' : '0'};">${title}</div>
          ${meta ? `<div class="sb-muted" style="font-family:${MONO_FONT}; font-size:11.5px; color:${L.muted}; margin-top:10px; letter-spacing:0.4px;">${meta}</div>` : ''}
        </td>
        <td width="9" align="right" style="font-family:${BODY_FONT}; width:9px; vertical-align:middle;">${pinStack}</td>
      </tr></table>
    </td>
  </tr></table>`;
}

/**
 * Learning schematic for every AI draft. Solid-cell nodes and connected traces
 * communicate a suggested process, never a student's completion or progress.
 * The motif is contained in the content; it works without images or gradients.
 * title/detail are trusted HTML, while labels are escaped here.
 */
export function emailLearningGraphic({ label, title, detail, nodes }) {
  const stages = nodes.slice(0, 3);
  const route = stages.map((node, index) => `<td width="33%" align="center" style="width:33.33%; text-align:center; vertical-align:top; padding:0 3px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;"><tr>
      <td width="50%" style="width:50%; vertical-align:middle;">${index ? `<div class="sb-tick" style="height:2px; background-color:${L.border}; font-size:0; line-height:0;">&nbsp;</div>` : ''}</td>
      <td width="32" class="sb-frame sb-text" align="center" style="width:32px; min-width:32px; height:32px; border:1px solid ${L.border}; font-family:${MONO_FONT}; color:${L.text}; font-size:12px; font-weight:700; line-height:32px; text-align:center;">${String(index + 1).padStart(2, '0')}</td>
      <td width="50%" style="width:50%; vertical-align:middle;">${index < stages.length - 1 ? `<div class="sb-tick" style="height:2px; background-color:${L.border}; font-size:0; line-height:0;">&nbsp;</div>` : ''}</td>
    </tr></table>
    <div class="sb-muted" style="font-family:${MONO_FONT}; margin-top:10px; font-size:10px; letter-spacing:0.5px; color:${L.muted}; line-height:1.5; overflow-wrap:anywhere;">${escapeHtml(node)}</div>
  </td>`).join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="sb-learning-graphic" style="border-collapse:collapse; table-layout:fixed; margin:0 0 24px 0;">
    <tr><td class="sb-strip" style="${perfboardBg(L)} border:1px solid ${L.hairline}; border-radius:10px; padding:22px 18px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;"><tr>
        <td width="8" style="width:8px; vertical-align:middle;"><div class="sb-node-live" style="width:6px; height:6px; background-color:${L.brand}; font-size:0; line-height:0;">&nbsp;</div></td>
        <td class="sb-faint" style="font-family:${MONO_FONT}; padding-left:8px; font-size:10px; font-weight:700; letter-spacing:1.1px; line-height:1.6; text-transform:uppercase; color:${L.faint};">${escapeHtml(label)}</td>
      </tr></table>
      <h2 class="sb-text" style="font-family:${DISPLAY_FONT}; margin:16px 0 10px; font-size:25px; font-weight:700; line-height:1.25; letter-spacing:-0.4px; color:${L.ink}; overflow-wrap:anywhere;">${title}</h2>
      <p class="sb-muted" style="font-family:${BODY_FONT}; margin:0; font-size:14px; line-height:1.6; color:${L.muted}; overflow-wrap:anywhere;">${detail}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; table-layout:fixed; margin-top:24px;"><tr>${route}</tr></table>
    </td></tr>
  </table>`;
}

/** Section heading: a hairline rule with a small uppercase label under it. */
export function emailSectionLabel(text) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; margin:30px 0 16px 0;">
    <tr><td class="sb-hr" height="1" style="height:1px; background-color:${L.hairline}; font-size:0; line-height:0;">&nbsp;</td></tr>
    <tr><td class="sb-muted" style="padding-top:14px; font-family:${MONO_FONT}; font-size:11px; font-weight:700; letter-spacing:1.4px; text-transform:uppercase; color:${L.muted};">${text}</td></tr>
  </table>`;
}

/**
 * Node rail — a schematic gutter, mirroring the roadmap graph in the product.
 * A monospace index sits in the gutter; a continuous 2px wire runs down the
 * left edge of the content column (adjacent cell borders stack into one line,
 * so it survives Outlook without any positioning tricks).
 *
 * nodes: [{ title, body, state }] where state is 'done' | 'current' | 'todo'.
 * Plain strings are accepted and treated as titles.
 * Pass { flush: true } when nesting inside emailFrame, so the frame's own
 * padding sets the bottom gap instead of doubling up with this margin.
 */
export function emailNodeRail(nodes, { flush = false } = {}) {
  const rows = nodes
    .map((node, i) => {
      const item = typeof node === 'string' ? { title: node } : node;
      const state = item.state || 'todo';
      const isLast = i === nodes.length - 1;
      const idx = item.index || String(i + 1).padStart(2, '0');

      const wireColor = state === 'todo' ? L.hairline : L.ink;
      const wireClass = state === 'todo' ? 'sb-wire' : 'sb-wire-on';
      const idxColor = state === 'todo' ? L.faint : L.text;
      const idxClass = state === 'todo' ? 'sb-faint' : 'sb-text';
      const marker =
        state === 'current'
          ? `<span class="sb-node-live" style="font-family:${BODY_FONT}; display:inline-block; width:7px; height:7px; border-radius:50%; background-color:${L.brand}; margin-left:7px; vertical-align:middle;">&nbsp;</span>`
          : '';

      return `<tr>
        <td width="42" class="${idxClass}" align="right" style="width:42px; padding:0 14px ${isLast ? '0' : '26px'} 0; vertical-align:top; font-family:${MONO_FONT}; font-size:12px; font-weight:700; letter-spacing:0.5px; color:${idxColor}; line-height:1.5;">${idx}</td>
        <td class="${wireClass}" style="font-family:${BODY_FONT}; padding:0 0 ${isLast ? '0' : '26px'} 20px; vertical-align:top; border-left:2px solid ${wireColor};">
          <div class="sb-text" style="font-family:${BODY_FONT}; font-size:15px; font-weight:700; color:${L.text}; line-height:1.45;">${item.title}${marker}</div>
          ${item.body ? `<div class="sb-muted" style="font-family:${BODY_FONT}; font-size:14px; color:${L.muted}; line-height:1.62; margin-top:5px;">${item.body}</div>` : ''}
        </td>
      </tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; margin:2px 0 ${flush ? 0 : 28}px 0;">${rows}</table>`;
}

/**
 * Numbered step rail — outlined circles, for procedural instructions where the
 * roadmap metaphor of emailNodeRail would be misleading.
 */
export function emailStepRail(steps) {
  const rows = steps
    .map((step, i) => {
      const title = typeof step === 'string' ? step : step.title;
      const body = typeof step === 'string' ? '' : step.body;
      const isLast = i === steps.length - 1;
      return `<tr>
        <td width="38" style="font-family:${BODY_FONT}; width:38px; padding:0 14px ${isLast ? '0' : '20px'} 0; vertical-align:top;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;"><tr>
            <td class="sb-step-num" align="center" width="24" height="24" style="width:24px; height:24px; border:1px solid ${L.border}; border-radius:50%; color:${L.text}; font-family:${MONO_FONT}; font-size:11px; font-weight:700; line-height:22px; text-align:center;">${i + 1}</td>
          </tr></table>
        </td>
        <td class="sb-step-cell" style="font-family:${BODY_FONT}; padding:0 0 ${isLast ? '0' : '20px'} 0; vertical-align:top;">
          <div class="sb-text" style="font-family:${BODY_FONT}; font-size:15px; font-weight:700; color:${L.text}; line-height:1.45; padding-top:2px;">${title}</div>
          ${body ? `<div class="sb-muted" style="font-family:${BODY_FONT}; font-size:14px; color:${L.muted}; line-height:1.62; margin-top:4px;">${body}</div>` : ''}
        </td>
      </tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; margin:0 0 26px 0;">${rows}</table>`;
}

/**
 * Spec sheet — hairline-separated label/value rows, values right-aligned in
 * monospace so identifiers, dates and amounts line up like a datasheet.
 * rows: [[label, valueHtml], ...]. Labels escaped; values are trusted markup.
 */
export function emailSpecSheet(rows, { title, flush = false } = {}) {
  const body = rows
    .map(
      ([label, value], i) => `<tr>
        <td width="34%" class="sb-muted sb-cell" style="font-family:${BODY_FONT}; width:34%; padding:12px 14px 12px 0; font-size:13px; color:${L.muted}; vertical-align:top; ${i === 0 ? '' : `border-top:1px solid ${L.hairline};`}">${escapeHtml(label)}</td>
        <td width="66%" class="sb-text sb-cell" align="right" style="width:66%; padding:12px 0; font-family:${MONO_FONT}; font-size:12.5px; color:${L.text}; font-weight:700; text-align:right; vertical-align:top; overflow-wrap:anywhere; word-break:break-word; ${i === 0 ? '' : `border-top:1px solid ${L.hairline};`}">${value}</td>
      </tr>`
    )
    .join('');
  // Fixed layout keeps the label column from being squeezed by a wide mono
  // value, which is what makes short labels wrap onto two lines.
  return `${title ? emailSectionLabel(title) : ''}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="sb-spec" style="border-collapse:collapse; table-layout:fixed; margin:0 0 ${flush ? 0 : 26}px 0;">${body}</table>`;
}

/**
 * Stat band — two or three figures between hairline rules, the way a dashboard
 * summarises a run. stats: [{ value, label }].
 */
export function emailStatBand(stats) {
  const colWidth = (100 / stats.length).toFixed(3);
  const cells = stats
    .map(
      (stat, i) => `<td width="${colWidth}%" align="left" style="font-family:${BODY_FONT}; width:${colWidth}%; padding:18px 0 18px ${i === 0 ? '0' : '20px'}; vertical-align:top; ${i === 0 ? '' : `border-left:1px solid ${L.hairline};`}" class="sb-cell-l">
        <div class="sb-text" style="font-family:${BODY_FONT}; font-size:23px; font-weight:800; color:${L.ink}; line-height:1.1; letter-spacing:-0.4px;">${stat.value}</div>
        <div class="sb-muted" style="font-family:${MONO_FONT}; font-size:10.5px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; color:${L.muted}; margin-top:7px;">${stat.label}</div>
      </td>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; table-layout:fixed; margin:0 0 28px 0;">
    <tr><td colspan="${stats.length}" class="sb-hr" height="1" style="height:1px; background-color:${L.hairline}; font-size:0; line-height:0;">&nbsp;</td></tr>
    <tr>${cells}</tr>
    <tr><td colspan="${stats.length}" class="sb-hr" height="1" style="height:1px; background-color:${L.hairline}; font-size:0; line-height:0;">&nbsp;</td></tr>
  </table>`;
}

/**
 * Segmented progress track — discrete nodes rather than a continuous bar,
 * because progress on SkillBun is counted in roadmap topics, not percentages.
 * percent: 0–100. segments: how many nodes to draw.
 */
export function emailProgressTrack({ percent, label, caption, segments = 16, flush = false }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.max(0, Math.min(segments, Math.round((pct / 100) * segments)));
  // Segments and gaps are both sized in percent so they total exactly 100% and
  // the last segment never ends up wider than the rest.
  const gapWidth = 0.7;
  const segWidth = ((100 - gapWidth * (segments - 1)) / segments).toFixed(3);

  const cells = [];
  for (let i = 0; i < segments; i += 1) {
    const on = i < filled;
    cells.push(
      `<td width="${segWidth}%" class="${on ? 'sb-seg-on' : 'sb-seg-off'}" height="9" style="width:${segWidth}%; height:9px; background-color:${on ? L.ink : L.border}; border-radius:2px; font-size:0; line-height:0;">&nbsp;</td>`
    );
    if (i < segments - 1) {
      cells.push(`<td width="${gapWidth}%" style="width:${gapWidth}%; font-size:0; line-height:0;">&nbsp;</td>`);
    }
  }

  return `<div style="font-family:${BODY_FONT}; margin:0 0 ${flush ? 0 : 28}px 0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; margin-bottom:11px;"><tr>
      <td class="sb-text" style="font-family:${BODY_FONT}; font-size:14px; font-weight:700; color:${L.text};">${label}</td>
      <td class="sb-text" align="right" style="font-family:${MONO_FONT}; font-size:13px; font-weight:700; color:${L.text}; text-align:right;">${pct}%</td>
    </tr></table>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; table-layout:fixed;"><tr>${cells.join('')}</tr></table>
    ${caption ? `<div class="sb-muted" style="font-family:${BODY_FONT}; font-size:12.5px; color:${L.muted}; margin-top:11px; line-height:1.55;">${caption}</div>` : ''}
  </div>`;
}

/**
 * Topic matrix — one square per topic on the track, filled for the ones the
 * student has completed. This is the roadmap drawn to scale rather than
 * abstracted into a percentage, so the remaining work is legible at a glance.
 * Squares beyond `total` are left blank to keep the grid rectangular.
 */
export function emailWaffle({ total, filled, label, caption, cols = 12, flush = false }) {
  const count = Math.max(1, Math.round(total));
  const done = Math.max(0, Math.min(count, Math.round(filled)));
  const rowCount = Math.ceil(count / cols);
  // Gaps are sized in percent too, so the columns and the gutters together add
  // up to exactly 100% and no cell is left wider than its neighbours.
  const gapWidth = 0.7;
  const cellWidth = ((100 - gapWidth * (cols - 1)) / cols).toFixed(3);
  const gap = `<td width="${gapWidth}%" style="width:${gapWidth}%; font-size:0; line-height:0;">&nbsp;</td>`;

  const rows = [];
  for (let r = 0; r < rowCount; r += 1) {
    const cells = [];
    for (let c = 0; c < cols; c += 1) {
      const index = r * cols + c;
      if (index >= count) {
        cells.push(`<td width="${cellWidth}%" style="width:${cellWidth}%; font-size:0; line-height:0;">&nbsp;</td>`);
      } else {
        const on = index < done;
        cells.push(
          `<td width="${cellWidth}%" class="${on ? 'sb-seg-on' : 'sb-seg-off'}" height="15" style="width:${cellWidth}%; height:15px; background-color:${on ? L.ink : L.border}; border-radius:2px; font-size:0; line-height:0;">&nbsp;</td>`
        );
      }
      if (c < cols - 1) cells.push(gap);
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
    if (r < rowCount - 1) {
      rows.push(`<tr><td colspan="${cols * 2 - 1}" height="5" style="height:5px; font-size:0; line-height:0;">&nbsp;</td></tr>`);
    }
  }

  return `<div style="font-family:${BODY_FONT}; margin:0 0 ${flush ? 0 : 28}px 0;">
    ${label
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; margin-bottom:11px;"><tr>
      <td class="sb-text" style="font-family:${BODY_FONT}; font-size:14px; font-weight:700; color:${L.text};">${label}</td>
      <td class="sb-text" align="right" style="font-family:${MONO_FONT}; font-size:13px; font-weight:700; color:${L.text}; text-align:right;">${done}/${count}</td>
    </tr></table>`
      : ''}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; table-layout:fixed;">${rows.join('')}</table>
    ${caption ? `<div class="sb-muted" style="font-family:${BODY_FONT}; font-size:12.5px; color:${L.muted}; margin-top:12px; line-height:1.55;">${caption}</div>` : ''}
  </div>`;
}

/**
 * Note box. tone: 'neutral' (default) | 'danger'. Colour only carries signal.
 */
export function emailNote(html, tone = 'neutral') {
  const isDanger = tone === 'danger';
  const cls = isDanger ? 'sb-note sb-note-danger' : 'sb-note sb-note-neutral';
  const bg = isDanger ? L.dangerSubtle : L.surfaceSunken;
  const color = isDanger ? L.dangerText : L.text;
  const bar = isDanger ? `border-left:2px solid ${L.danger};` : '';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate; margin:0 0 26px 0;"><tr>
    <td class="${cls}" style="font-family:${BODY_FONT}; background-color:${bg}; ${bar} border-radius:8px; padding:15px 18px; font-size:14px; line-height:1.65; color:${color};">${html}</td>
  </tr></table>`;
}

/**
 * Data block — a bordered panel with a monospace header strip, for credentials,
 * identifiers and links. Reads like a config block rather than a marketing box.
 * items: [[label, value, { mono?: boolean, href?: string }], ...]
 */
export function emailCredentialStrip(items, { title } = {}) {
  const rows = items
    .map(([label, value, opts = {}]) => {
      const mono = opts.mono !== false;
      const inner = opts.href
        ? `<a href="${escapeHtml(opts.href)}" target="_blank" class="sb-text" style="color:${L.text}; font-family:${MONO_FONT}; font-size:12.5px; font-weight:700; text-decoration:underline; text-underline-offset:2px;">${escapeHtml(value)}</a>`
        : `<span class="sb-text" style="color:${L.text}; font-weight:700; ${mono ? `font-family:${MONO_FONT}; font-size:12.5px; letter-spacing:0.2px;` : ''}">${escapeHtml(value)}</span>`;
      return `<tr>
        <td class="sb-muted" style="font-family:${BODY_FONT}; padding:8px 16px 8px 0; font-size:12.5px; color:${L.muted}; white-space:nowrap; vertical-align:top;">${escapeHtml(label)}</td>
        <td style="font-family:${BODY_FONT}; padding:8px 0; font-size:13px; word-break:break-word; overflow-wrap:anywhere; vertical-align:top;">${inner}</td>
      </tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate; margin:0 0 26px 0;"><tr>
    <td class="sb-strip" style="font-family:${BODY_FONT}; ${perfboardBg(L)} border:1px solid ${L.hairline}; border-radius:10px; padding:0;">
      ${title ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;"><tr>
        <td class="sb-term-head" style="padding:12px 20px; border-bottom:1px solid ${L.hairline}; font-family:${MONO_FONT}; font-size:10.5px; font-weight:700; letter-spacing:1.3px; text-transform:uppercase; color:${L.muted};">${title}</td>
      </tr></table>` : ''}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;"><tr>
        <td style="font-family:${BODY_FONT}; padding:14px 20px 16px 20px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">${rows}</table>
        </td>
      </tr></table>
    </td>
  </tr></table>`;
}

/**
 * Monospace tags — technology or topic labels as small hairline rectangles.
 * Values are escaped; keep them short.
 *
 * Each tag is its own floated single-cell table rather than an inline-block
 * span, for the same reason as emailButton: Outlook's Word engine ignores
 * `display`, so an inline span loses its vertical padding and its bottom margin
 * and the rows close up. `align="left"` is the float Word does honour, and the
 * border and padding then sit on a real table cell where they always apply.
 */
export function emailTags(items) {
  const tags = items
    .map(
      (item) => `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="left" style="border-collapse:separate; float:left; margin:0 6px 7px 0;"><tr>
        <td class="sb-tag" style="border:1px solid ${L.border}; border-radius:4px; padding:5px 9px; mso-padding-alt:5px 9px; font-family:${MONO_FONT}; font-size:11.5px; font-weight:700; letter-spacing:0.3px; color:${L.muted}; line-height:1.2; white-space:nowrap;">${escapeHtml(item)}</td>
      </tr></table>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; margin:0 0 22px 0;"><tr>
    <td style="font-size:0; line-height:0;">${tags}<div style="clear:both; font-size:0; line-height:0;">&nbsp;</div></td>
  </tr></table>`;
}

/**
 * Bulleted lines.
 */
export function emailPoints(items) {
  const rows = items
    .map(
      (item) => `<tr>
        <td width="16" style="font-family:${BODY_FONT}; width:16px; padding:5px 12px 5px 0; vertical-align:top;">
          <div class="sb-dot" style="width:4px; height:4px; border-radius:50%; background-color:${L.ink}; margin-top:9px; font-size:0; line-height:0;">&nbsp;</div>
        </td>
        <td class="sb-text" style="font-family:${BODY_FONT}; padding:5px 0; font-size:15px; line-height:1.68; color:${L.text};">${item}</td>
      </tr>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; margin:0 0 26px 0;">${rows}</table>`;
}

/**
 * Solid ink CTA, small radius. Left-aligned by default.
 *
 * The padding is declared twice on purpose. Outlook for Windows renders through
 * Word, which supports only `display:none` — `display:inline-block` never
 * applies, so the anchor stays inline and its padding is dropped, collapsing the
 * button to a text-height slab. `mso-padding-alt` on the cell is the Word-only
 * property that restores it; `mso-padding-alt:0` on the anchor stops Word adding
 * the padding a second time. Every other client ignores both and uses the
 * anchor's own padding, which keeps the whole button clickable.
 *
 * The fixed-width VML roundrect (buttons.cm) would also round the corners in
 * Outlook, but it needs a hard pixel width and these labels are variable, so the
 * corners are left to degrade to square there.
 */
export function emailButton({ href, label, align = 'left' }) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="${align}" style="border-collapse:separate; margin:6px 0 22px 0; ${align === 'center' ? 'margin-left:auto; margin-right:auto;' : ''}"><tr>
    <td class="sb-btn" bgcolor="${L.ink}" style="font-family:${BODY_FONT}; background-color:${L.ink}; border-radius:8px; mso-padding-alt:13px 26px;">
      <a href="${escapeHtml(href)}" target="_blank" class="sb-btn-a" style="display:inline-block; padding:13px 26px; mso-padding-alt:0; font-family:${BODY_FONT}; font-size:15px; font-weight:700; color:#FFFFFF; text-decoration:none; border-radius:8px;">${label}</a>
    </td>
  </tr></table>
  <div style="clear:both; font-size:0; line-height:0;">&nbsp;</div>`;
}

/** Secondary inline link — ink, underlined. */
export function emailLink({ href, label }) {
  return `<p style="font-family:${BODY_FONT}; margin:0 0 22px 0; font-size:14.5px; line-height:1.6;">
    <a href="${escapeHtml(href)}" target="_blank" class="sb-text" style="color:${L.text}; font-weight:700; text-decoration:underline; text-underline-offset:2px;">${label}</a>
  </p>`;
}

/** Sign-off block for formal letters. */
export function emailSignoff({ name, role }) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; margin:30px 0 0 0;"><tr>
    <td class="sb-hairline-top" style="font-family:${BODY_FONT}; border-top:1px solid ${L.hairline}; padding-top:20px; font-size:14px; line-height:1.6; color:${L.muted};">
      Warm regards,<br>
      <strong class="sb-text" style="color:${L.text}; font-size:15px;">${escapeHtml(name)}</strong>
      ${role ? `<br><span class="sb-muted" style="font-family:${BODY_FONT}; color:${L.muted}; font-size:13.5px;">${escapeHtml(role)}</span>` : ''}
    </td>
  </tr></table>`;
}

/* =====================================================================
 * FRAME
 * ===================================================================== */

// Chips become a quiet monospace meta line — no pills.
function renderMeta(chips = []) {
  if (!chips.length) return '';
  const line = chips.map((c) => escapeHtml(c)).join('&nbsp;&nbsp;/&nbsp;&nbsp;');
  return `<div class="sb-muted" style="margin-top:20px; font-family:${MONO_FONT}; font-size:11.5px; letter-spacing:0.4px; color:${L.muted}; line-height:1.6;">${line}</div>`;
}

/**
 * Every dark-mode override, emitted once per selector prefix.
 *
 * Prefix '' is used inside @media (prefers-color-scheme: dark) — Apple Mail,
 * iOS Mail, Outlook for Mac. Prefixes '[data-ogsc] ' and '[data-ogsb] ' cover
 * Outlook.com and the Windows Outlook app, which ignore the media query and
 * instead stamp those attributes onto elements whose inline colour (ogsc) or
 * background (ogsb) they rewrote. Same declarations, three routes in.
 */
function darkRules(prefix = '') {
  const p = prefix;
  const pageSelector = prefix ? `${p}.sb-page` : 'body, .sb-page';
  return `
      ${pageSelector} { background-color:${D.pageBg} !important; }
      ${p}.sb-sheet { background-color:${D.card} !important; }
      ${p}.sb-text { color:${D.text} !important; }
      ${p}.sb-muted { color:${D.muted} !important; }
      ${p}.sb-faint { color:${D.faint} !important; }
      ${p}.sb-display { color:${D.text} !important; }
      ${p}.sb-hr { background-color:${D.hairline} !important; }
      ${p}.sb-dot { background-color:${D.ink} !important; }
      ${p}.sb-tick { background-color:${D.border} !important; }
      ${p}.sb-frame { border-color:${D.border} !important; }
      ${p}.sb-step-num { border-color:${D.border} !important; color:${D.text} !important; }
      ${p}.sb-wire { border-left-color:${D.hairline} !important; }
      ${p}.sb-wire-on { border-left-color:${D.ink} !important; }
      ${p}.sb-node-live { background-color:${D.brand} !important; }
      ${p}.sb-tag { border-color:${D.border} !important; color:${D.muted} !important; }
      ${p}.sb-strip { ${perfboardBg(D, true)} border-color:${D.hairline} !important; }
      ${p}.sb-term-head { border-bottom-color:${D.hairline} !important; color:${D.muted} !important; }
      ${p}.sb-note-neutral { background-color:${D.surfaceSunken} !important; color:${D.text} !important; }
      ${p}.sb-note-danger { background-color:${D.dangerSubtle} !important; border-left-color:${D.danger} !important; color:${D.dangerText} !important; }
      ${p}.sb-seg-on { background-color:${D.ink} !important; }
      ${p}.sb-seg-off { background-color:${D.border} !important; }
      ${p}.sb-hairline-top { border-top-color:${D.hairline} !important; }
      ${p}.sb-cell { border-top-color:${D.hairline} !important; }
      ${p}.sb-cell-l { border-left-color:${D.hairline} !important; }
      ${p}.sb-btn { background-color:${D.ink} !important; }
      ${p}.sb-btn-a { color:${D.pageBg} !important; }
      ${p}.sb-wordmark { color:${D.text} !important; }`;
}

function styleBlock() {
  return `<style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; background-color:${L.pageBg}; font-family:${BODY_FONT}; }
    a { text-decoration:none; }
    @media only screen and (min-width:621px) {
      .sb-pad { padding-left:40px !important; padding-right:40px !important; }
      .sb-outer { padding-left:18px !important; padding-right:18px !important; }
      .sb-doctag { display:table-cell !important; mso-hide:none !important; }
    }
    @media only screen and (max-width:620px) {
      .sb-pad { padding-left:22px !important; padding-right:22px !important; }
      .sb-top { padding-top:34px !important; }
      .sb-bottom { padding-bottom:40px !important; }
      .sb-outer { padding-left:0 !important; padding-right:0 !important; }
      .sb-display { font-size:24px !important; }
      .sb-doctag { display:none !important; }
    }
    /*
     * The sheet grows with the viewport instead of sitting as a 600px column in
     * the middle of a 2500px window. It grows in steps rather than fluidly,
     * because a line of body text stops being readable somewhere past ~90
     * characters: the side padding widens faster than the sheet, and the body
     * size steps up with it, so the measure lands near 80-88 characters at every
     * width. Outlook for Windows reads the width="600" table attribute and
     * ignores all of this, which is the intended fallback, not a bug.
     */
    @media only screen and (min-width:768px) {
      .sb-sheet { max-width:680px !important; }
      .sb-pad { padding-left:46px !important; padding-right:46px !important; }
      .sb-lede { max-width:520px !important; }
    }
    @media only screen and (min-width:1100px) {
      .sb-sheet { max-width:740px !important; }
      .sb-pad { padding-left:56px !important; padding-right:56px !important; }
      .sb-lede { max-width:560px !important; }
      .sb-display { font-size:29px !important; }
      .sb-body { font-size:16px !important; }
    }
    @media only screen and (min-width:1500px) {
      .sb-sheet { max-width:860px !important; }
      .sb-pad { padding-left:72px !important; padding-right:72px !important; }
      .sb-lede { max-width:620px !important; }
      .sb-display { font-size:32px !important; }
      .sb-body { font-size:17px !important; }
    }
    @media (prefers-color-scheme: dark) {${darkRules('')}
    }
    ${darkRules('[data-ogsc] ')}
    ${darkRules('[data-ogsb] ')}
  </style>`;
}

/**
 * The frame. Masthead → title block → content → footer, all on one flat sheet.
 *
 * @param {Object} opts
 * @param {string} opts.title      Document title / preheader
 * @param {string} opts.headline   Display headline
 * @param {string} [opts.lede]     Supporting line under the headline
 * @param {string} [opts.eyebrow]  Small uppercase label above the headline
 * @param {string} [opts.docTag]   Monospace slug in the masthead (ref, doc type)
 * @param {string[]} [opts.chips]  Short facts rendered as a quiet meta line
 * @param {string} opts.contentHtml
 * @param {boolean} [opts.isMarketing]  Adds the unsubscribe line
 * @param {string} [opts.preferenceUrl] Server-signed preference URL; previews use Settings
 */
export function buildEmail({
  title,
  headline,
  lede = '',
  eyebrow = '',
  docTag = '',
  chips = [],
  contentHtml,
  isMarketing = true,
  preferenceUrl = '',
}) {
  // This renderer is also used for browser previews. Signing and secret access
  // belong to the server dispatch route, never the shared rendering graph.
  const unsubscribeUrl = escapeHtml(preferenceUrl || `${SITE_URL}/settings`);

  // Inbox preview text. `lede` is trusted markup that already carries its own
  // entities, so it only needs its tags removed — escaping it again would show
  // the reader "&amp;amp;". `title` is plain text, so it does need escaping.
  const preheader = lede ? lede.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : escapeHtml(title);

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=JetBrains+Mono:wght@400;700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
  ${styleBlock()}
</head>
<body class="sb-page" style="font-family:${BODY_FONT}; margin:0; padding:0; background-color:${L.pageBg};">
  <div style="font-family:${BODY_FONT}; display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">${preheader}</div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="sb-page" style="background-color:${L.pageBg};">
    <tr>
      <td align="center" class="sb-outer" style="font-family:${BODY_FONT}; padding:0;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" class="sb-sheet" style="width:100%; max-width:600px; background-color:${L.card}; text-align:left;">

          <!-- 1. MASTHEAD -->
          <tr>
            <td class="sb-pad sb-top" style="font-family:${BODY_FONT}; padding:44px 22px 0 22px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                <tr>
                  <td style="font-family:${BODY_FONT}; vertical-align:middle;">
                    <a href="${SITE_URL}" target="_blank" style="text-decoration:none;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;"><tr>
                        <td style="font-family:${BODY_FONT}; padding-right:10px; vertical-align:middle;">
                          <img src="${LOGO_URL}" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" alt="SkillBun" class="sb-logo" style="display:block; border:0; width:${LOGO_WIDTH}px; height:${LOGO_HEIGHT}px;" />
                        </td>
                        <td style="font-family:${BODY_FONT}; vertical-align:middle;">
                          <span class="sb-wordmark" style="font-family:${DISPLAY_FONT}; font-size:16px; font-weight:700; color:${L.ink}; letter-spacing:1.5px; line-height:1; white-space:nowrap;">${WORDMARK}</span>
                        </td>
                      </tr></table>
                    </a>
                  </td>
                  ${docTag ? `<td class="sb-faint sb-doctag" align="right" style="display:none; mso-hide:all; text-align:right; vertical-align:middle; font-family:${MONO_FONT}; font-size:11px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; color:${L.faint};">${escapeHtml(docTag)}</td>` : ''}
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="sb-pad" style="font-family:${BODY_FONT}; padding:18px 22px 0 22px;">
              ${emailScaleRule()}
            </td>
          </tr>

          <!-- 2. TITLE BLOCK -->
          <tr>
            <td class="sb-pad" style="font-family:${BODY_FONT}; padding:38px 22px 0 22px;">
              ${eyebrow ? `<div class="sb-muted" style="margin-bottom:13px; font-family:${MONO_FONT}; font-size:11px; font-weight:700; letter-spacing:1.4px; text-transform:uppercase; color:${L.muted};">${eyebrow}</div>` : ''}
              <h1 class="sb-display" style="margin:0; font-family:${BODY_FONT}; font-size:27px; font-weight:800; line-height:1.28; color:${L.ink}; letter-spacing:-0.3px;">${headline}</h1>
              ${lede ? `<p class="sb-muted sb-lede" style="font-family:${BODY_FONT}; margin:14px 0 0 0; font-size:16px; line-height:1.62; color:${L.muted}; max-width:460px;">${lede}</p>` : ''}
              ${renderMeta(chips)}
            </td>
          </tr>

          <!-- 3. CONTENT -->
          <tr>
            <td class="sb-pad sb-text sb-body" style="font-family:${BODY_FONT}; padding:32px 22px 0 22px; color:${L.text}; font-size:15.5px; line-height:1.72;">
              ${contentHtml}
            </td>
          </tr>

          <!-- 4. FOOTER -->
          <tr>
            <td class="sb-pad sb-bottom" style="font-family:${BODY_FONT}; padding:20px 22px 56px 22px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                <tr><td colspan="2" style="font-size:0; line-height:0;">${emailCircuitRule()}</td></tr>
                <tr>
                  <td style="font-family:${BODY_FONT}; padding-top:20px; vertical-align:middle;">
                    <span class="sb-wordmark" style="font-family:${DISPLAY_FONT}; font-size:13px; font-weight:700; color:${L.ink}; letter-spacing:1.3px;">${WORDMARK}</span>
                    <div class="sb-muted" style="font-family:${BODY_FONT}; font-size:12px; color:${L.muted}; margin-top:6px; line-height:1.5;">Hop into the Right Career &nbsp;·&nbsp; 100% free, always</div>
                  </td>
                  <td align="right" style="font-family:${BODY_FONT}; padding-top:20px; text-align:right; vertical-align:middle;">
                    <a href="${SITE_URL}/roadmap" target="_blank" class="sb-muted" style="font-family:${MONO_FONT}; font-size:11.5px; color:${L.muted}; text-decoration:underline;">roadmaps</a>
                    <span class="sb-muted" style="font-family:${BODY_FONT}; color:${L.muted}; font-size:12px;">&nbsp;&nbsp;</span>
                    <a href="${SITE_URL}" target="_blank" class="sb-muted" style="font-family:${MONO_FONT}; font-size:11.5px; color:${L.muted}; text-decoration:underline;">skillbun.tech</a>
                  </td>
                </tr>
              </table>
              ${isMarketing ? `<div class="sb-muted" style="font-family:${BODY_FONT}; margin-top:18px; font-size:11.5px; color:${L.muted}; line-height:1.6;">You're receiving this because you opted in to SkillBun marketing emails. <a href="${unsubscribeUrl}" target="_blank" class="sb-muted" style="color:${L.muted}; text-decoration:underline;">Unsubscribe or manage preferences</a>.</div>` : ''}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Back-compat shell for callers that only have a blob of body HTML (the admin
 * console's custom-HTML path).
 */
export function buildBaseEmailWrapper(contentHtml, titleText, isMarketing = true, email = '', preferenceUrl = '') {
  return buildEmail({
    title: titleText,
    headline: escapeHtml(titleText || 'SkillBun'),
    contentHtml,
    isMarketing,
    email,
    preferenceUrl,
  });
}
