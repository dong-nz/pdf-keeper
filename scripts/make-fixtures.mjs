#!/usr/bin/env node
// Generates the test fixture PDFs (RULES R6.2): deterministic, never
// committed as binaries. Rust tests and the UI smoke script consume the
// same tree, so fixture semantics are defined in exactly one place.
// Usage: node scripts/make-fixtures.mjs
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(root, "fixtures");

const DOC_COUNT = 10_000;

// Core fixture tier (SPEC-v0.0.5 §2, DR-135): the 100 documents the functional
// smoke flows run against. The composition carries exactly the properties those
// flows depend on: identical byte sizes (the sort-tie property), Info
// dictionaries with Title/Author (metadata display, search), one document with
// no Info (doc00900 — the filename fallback), one document the missing-file
// flow moves away (doc00500), and the title prefixes the search and tag
// flows count on (doc00100..102, doc00200..202, doc00300..301). The manifest
// records the composition so the harness derives its expected counts from it
// instead of hard-coding them.
const CORE_DOC_COUNT = 100;
const coreNames = [];
for (let index = 1; index <= 90; index += 1) coreNames.push(`doc${String(index).padStart(5, "0")}`);
for (const [from, to] of [[100, 102], [200, 202], [300, 301]]) {
  for (let index = from; index <= to; index += 1) coreNames.push(`doc${String(index).padStart(5, "0")}`);
}
coreNames.push("doc00500"); // the missing-file flow's document
coreNames.push("doc00900"); // the no-Info document (filename fallback)

// Minimal valid PDF assembled with real xref offsets. `info` adds an Info
// dictionary (Title/Author as literal strings); omitting it yields a valid
// PDF with no metadata (filename-fallback fixture).
function buildPdf({ title, author }) {
  const stream = "BT /F1 14 Tf 72 720 Td (fixture) Tj ET";
  const objects = [
    [1, "<< /Type /Catalog /Pages 2 0 R >>"],
    [2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"],
    [
      3,
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
        "/Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>",
    ],
    [4, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`],
  ];
  const trailerParts = [`/Size ${objects.length + 2}`, "/Root 1 0 R"];
  if (title !== undefined || author !== undefined) {
    const infoFields = [];
    if (title !== undefined) infoFields.push(`/Title ${literal(title)}`);
    if (author !== undefined) infoFields.push(`/Author ${literal(author)}`);
    objects.push([5, `<< ${infoFields.join(" ")} >>`]);
    trailerParts.push("/Info 5 0 R");
  }
  // Fixed ID keeps the file byte-deterministic (R6.2).
  trailerParts.push("/ID [<00000000000000000000000000000000> <00000000000000000000000000000000>]");
  return assemble(objects, `<< ${trailerParts.join(" ")} >>`);
}

// Multi-page fixture documents (SPEC-v0.0.6 §3.5): deterministic per-page
// content — the page number drawn in each page's own content stream — so a
// rendered page is distinguishable and reader flows can assert page identity
// (AC-61/AC-65). Same Letter MediaBox as every other fixture (612 × 792 pt).
// SPEC-v0.0.7 §3.5: an optional outline builder — catalog /Outlines +
// /PageMode /UseOutlines, item dictionaries with /Title, /Parent, /First,
// /Last, /Prev, /Next and /Dest [<page ref> /XYZ null null null]. `outline`
// is a flat [{ title, page, depth }] list; depth 1 is top level.
function buildMultiPagePdf({ pages, title, outline }) {
  const objects = [
    [1, "<< /Type /Catalog /Pages 2 0 R >>"],
    [
      2,
      `<< /Type /Pages /Kids [${Array.from(
        { length: pages },
        (_, index) => `${3 + 2 * index} 0 R`,
      ).join(" ")}] /Count ${pages} >>`,
    ],
  ];
  for (let page = 1; page <= pages; page += 1) {
    const pageObject = 3 + 2 * (page - 1);
    const contentObject = pageObject + 1;
    objects.push([
      pageObject,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObject} 0 R ` +
        "/Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>",
    ]);
    const stream = `BT /F1 24 Tf 72 700 Td (Page ${page} of ${pages}) Tj ET`;
    objects.push([contentObject, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]);
  }
  const pageObjectOf = (page) => 3 + 2 * (page - 1);
  let catalogExtras = "";
  if (outline !== undefined && outline.length > 0) {
    // Object numbering continues after the content objects; the Info
    // dictionary is reserved last so every document keeps the same trailer
    // shape.
    const outlinesRoot = objects.length + 1;
    const itemIds = new Map(); // index in the flat list -> object number
    for (let index = 0; index < outline.length; index += 1) {
      itemIds.set(index, outlinesRoot + 1 + index);
    }
    // Sibling runs share a parent; children are the maximal run of deeper
    // entries directly after their parent.
    const childrenOf = (index) => {
        const depth = outline[index].depth;
        const kids = [];
        for (let next = index + 1; next < outline.length && outline[next].depth > depth; next += 1) {
            if (outline[next].depth === depth + 1) kids.push(next);
        }
        return kids;
    };
    const siblingsOf = (index) => {
        const depth = outline[index].depth;
        const parent = parentOf(index);
        return outline
            .map((entry, entryIndex) => ({ entry, entryIndex }))
            .filter(({ entry, entryIndex }) =>
                entry.depth === depth && entryIndex !== index && parentOf(entryIndex) === parent)
            .map(({ entryIndex }) => entryIndex);
    };
    const parentOf = (index) => {
        const depth = outline[index].depth;
        if (depth === 1) return outlinesRoot;
        for (let earlier = index - 1; earlier >= 0; earlier -= 1) {
            if (outline[earlier].depth === depth - 1) return itemIds.get(earlier);
        }
        throw new Error("outline entry without a parent");
    };
    const topLevel = outline.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.depth === 1).map(({ index }) => index);
    for (let index = 0; index < outline.length; index += 1) {
      const { title: entryTitle, page } = outline[index];
      const id = itemIds.get(index);
      const kids = childrenOf(index);
      const prev = siblingsOf(index).filter((sibling) => sibling < index).pop();
      const next = siblingsOf(index).find((sibling) => sibling > index);
      const parts = [
        `/Title ${literal(entryTitle)}`,
        `/Parent ${parentOf(index)} 0 R`,
        `/Dest [${pageObjectOf(page)} 0 R /XYZ null null null]`,
      ];
      if (prev !== undefined) parts.push(`/Prev ${itemIds.get(prev)} 0 R`);
      if (next !== undefined) parts.push(`/Next ${itemIds.get(next)} 0 R`);
      if (kids.length > 0) {
        parts.push(`/First ${itemIds.get(kids[0])} 0 R`);
        parts.push(`/Last ${itemIds.get(kids[kids.length - 1])} 0 R`);
        parts.push(`/Count ${kids.length}`);
      }
      objects.push([id, `<< ${parts.join(" ")} >>`]);
    }
    const firstTop = topLevel[0];
    const lastTop = topLevel[topLevel.length - 1];
    objects.splice(objects.length, 0, [
      outlinesRoot,
      `<< /First ${itemIds.get(firstTop)} 0 R /Last ${itemIds.get(lastTop)} 0 R /Count ${topLevel.length} >>`,
    ]);
    // The outlines root must be referenced before Info is appended.
    catalogExtras = ` /Outlines ${outlinesRoot} 0 R /PageMode /UseOutlines`;
  }
  objects[0] = [1, `<< /Type /Catalog /Pages 2 0 R${catalogExtras} >>`];
  const infoObject = objects.length + 1;
  objects.push([infoObject, `<< /Title ${literal(title)} /Author ${literal("Fixture Author")} >>`]);
  const trailer =
    `<< /Size ${infoObject + 1} /Root 1 0 R /Info ${infoObject} 0 R ` +
    "/ID [<00000000000000000000000000000000> <00000000000000000000000000000000>] >>";
  return assemble(objects, trailer);
}

// A structurally valid PDF whose Info Title is non-UTF-8 ciphertext and
// whose trailer carries /Encrypt — the encrypted fallback fixture (FR-05):
// strict UTF-8 must reject it and the caller falls back to the filename.
function buildEncryptedPdf() {
  const objects = [
    [1, "<< /Type /Catalog /Pages 2 0 R >>"],
    [2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"],
    [3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>"],
    [4, "<< /Filter /Standard /V 1 /R 3 /Length 40 " +
      "/O <28bfa9f4b8e9c9f4b8e9c9f4b8e9c9f4> /U <00112233445566778899aabbccddeeff> >>"],
    [5, "<< /Title <c3a9c3b8fffe0080c3a9c3b8> /Author <fffe0100ffff> >>"],
  ];
  const trailer =
    "<< /Size 6 /Root 1 0 R /Info 5 0 R /Encrypt 4 0 R " +
    "/ID [<00000000000000000000000000000000> <00000000000000000000000000000000>] >>";
  return assemble(objects, trailer);
}

// A genuinely encrypted PDF (FR-20, AC-104…AC-106): Standard security
// handler, V1/R2 — 40-bit RC4, Revision 2 key derivation (no /ID salt, no
// MD5 iteration) — the oldest handler pdfium accepts. The user password is
// "sesame" (the owner password differs); without it pdfium refuses the file
// with a password error, with it every page renders. The Rust and UI tests
// name the same password; it is part of the fixture.
const PROTECTED_PASSWORD = "sesame";
const PROTECTED_OWNER_PASSWORD = "sesame-owner";

// pdfium's own pad string (`kDefaultPasscode` in cpdf_security_handler.cpp
// — it deviates from the spec's Table 21 padding and is what the app's
// renderer actually uses): the fixture's keys are computed with it so the
// app's own pdfium accepts the password.
const PDF_PASSWORD_PAD = Buffer.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01,
  0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53,
  0x69, 0x7a,
]);

function rc4(key, data) {
  const s = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i += 1) {
    j = (j + s[i] + key[i % key.length]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k += 1) {
    i = (i + 1) % 256;
    j = (j + s[i]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
    out[k] = data[k] ^ s[(s[i] + s[j]) % 256];
  }
  return out;
}

function padPassword(password) {
  const bytes = Buffer.from(password, "latin1");
  if (bytes.length >= 32) return bytes.subarray(0, 32);
  return Buffer.concat([bytes, PDF_PASSWORD_PAD.subarray(0, 32 - bytes.length)]);
}

const md5 = (...parts) => crypto.createHash("md5").update(Buffer.concat(parts)).digest();

function buildProtectedPdf() {
  const ownerPad = padPassword(PROTECTED_OWNER_PASSWORD);
  const userPad = padPassword(PROTECTED_PASSWORD);
  // Algorithm 3 (Rev 2): the /O entry.
  const o = rc4(md5(ownerPad).subarray(0, 5), userPad);
  // Permissions: all bits set (the fixture is a fixture).
  const perms = Buffer.from([0xff, 0xff, 0xff, 0xff]);
  // Algorithm 2 (Rev 2) as pdfium implements it: the file key hashes the
  // padded password, /O, the permissions and the /ID bytes (pdfium mixes
  // the ID for every revision — a documented deviation from the spec).
  const fileId = Buffer.from("00000000000000000000000000000000", "hex");
  const fileKey = md5(userPad, o, perms, fileId).subarray(0, 5);
  const u = rc4(fileKey, PDF_PASSWORD_PAD);
  // Algorithm 4 (Rev 2): the per-object key for object 4, generation 0 —
  // the hash is file key + object number (low 3) + generation (low 2), and
  // the key is file-key-length + 5 bytes (10 here; pdfium uses the same).
  const objectKey = md5(
    fileKey,
    Buffer.from([4 & 0xff, (4 >> 8) & 0xff, (4 >> 16) & 0xff, 0, 0]),
  ).subarray(0, 10);
  const plain = Buffer.from(
    "BT /F1 24 Tf 72 700 Td (Protected fixture page) Tj ET\n",
    "latin1",
  );
  const cipher = rc4(objectKey, plain);
  const objects = [
    [1, "<< /Type /Catalog /Pages 2 0 R >>"],
    [2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"],
    [
      3,
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    ],
    // The stream body is binary RC4 output; latin1 round-trips every byte.
    [
      4,
      `<< /Length ${cipher.length} >>\nstream\n${cipher.toString("latin1")}\nendstream`,
    ],
    [5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"],
    [
      6,
      `<< /Filter /Standard /V 1 /R 2 /Length 40 /P -1 ` +
        `/O <${o.toString("hex")}> /U <${u.toString("hex")}> >>`,
    ],
  ];
  const trailer =
    "<< /Size 7 /Root 1 0 R /Encrypt 6 0 R " +
    `/ID [<${fileId.toString("hex")}> <${fileId.toString("hex")}>] >>`;
  return assemble(objects, trailer);
}

function assemble(objects, trailerBody) {
  let bytes = Buffer.from("%PDF-1.4\n", "latin1");
  const offsets = new Map();
  for (const [num, body] of objects) {
    offsets.set(num, bytes.length);
    bytes = Buffer.concat([bytes, Buffer.from(`${num} 0 obj\n${body}\nendobj\n`, "latin1")]);
  }
  const highest = Math.max(...objects.map(([num]) => num));
  const xrefStart = bytes.length;
  let xref = `xref\n0 ${highest + 1}\n0000000000 65535 f \n`;
  for (let num = 1; num <= highest; num += 1) {
    xref += `${String(offsets.get(num)).padStart(10, "0")} 00000 n \n`;
  }
  return Buffer.concat([
    bytes,
    Buffer.from(`${xref}trailer\n${trailerBody}\nstartxref\n${xrefStart}\n%%EOF\n`, "latin1"),
  ]);
}

function literal(text) {
  const escaped = text.replace(/[\\()]/g, (c) => `\\${c}`);
  return `(${escaped})`;
}

// Pads a fixture to an exact byte size with a trailing comment line. The xref
// is located by startxref offset, so bytes after %%EOF are ignored by the
// reader; this exists so the no-Info core document carries the same byte size
// as the Info documents (the core tier's sort-tie property).
function padToSize(bytes, target) {
  const pad = target - bytes.length;
  if (pad <= 0) return bytes;
  return Buffer.concat([bytes, Buffer.from(`% ${"p".repeat(pad - 3)}\n`, "latin1")]);
}

rmSync(fixtures, { recursive: true, force: true });
mkdirSync(join(fixtures, "docs"), { recursive: true });
mkdirSync(join(fixtures, "special"), { recursive: true });
mkdirSync(join(fixtures, "core"), { recursive: true });

for (let index = 1; index <= DOC_COUNT; index += 1) {
  const name = `doc${String(index).padStart(5, "0")}`;
  const pdf = buildPdf({ title: `Fixture Doc ${name}`, author: `Fixture Author` });
  writeFileSync(join(fixtures, "docs", `${name}.pdf`), pdf);
}

// Core tier: every document the same byte size (the no-Info one is padded to
// the Info size), titles in the same "Fixture Doc <name>" shape the docs tier
// uses, and a manifest.json the harness reads to derive its expected counts.
const coreInfoSize = buildPdf({ title: "Fixture Doc doc00001", author: "Fixture Author" }).length;
const coreManifest = { docs: [] };
for (const name of coreNames) {
  const noInfo = name === "doc00900";
  const pdf = noInfo
    ? padToSize(buildPdf({}), coreInfoSize)
    : buildPdf({ title: `Fixture Doc ${name}`, author: "Fixture Author" });
  writeFileSync(join(fixtures, "core", `${name}.pdf`), pdf);
  // UI-36 (AC-85): the manifest records each document's byte size so the
  // row meta-column flow asserts the rendered size cell against it.
  coreManifest.docs.push(noInfo
    ? { name: `${name}.pdf`, noInfo: true, size: pdf.length }
    : { name: `${name}.pdf`, title: `Fixture Doc ${name}`, author: "Fixture Author", size: pdf.length });
}
writeFileSync(join(fixtures, "core", "manifest.json"), `${JSON.stringify(coreManifest, null, 2)}\n`);

// Multi-page tier (SPEC-v0.0.6 §3.5): five core-tier documents (12 / 24 / 48 /
// 96 / 192 pages) and one scale-tier 1 000-page document, generated into
// fixtures/multi/ — the existing single-page corpora stay byte- and
// count-identical ("covers keep their corpus"). The manifest carries the page
// counts so the harness and the Rust tests derive them instead of hard-coding.
// SPEC-v0.0.7 §3.5: multi-192 carries a fixed four-entry outline (nested
// third entry), recorded in the manifest as `outline: [{ title, page, depth }]`
// — the Rust test and the UI flow derive the expected tree from it. The other
// documents keep no outline (UI-33's negative case).
const multiTier = [
  { name: "multi-012", pages: 12, tier: "core" },
  { name: "multi-024", pages: 24, tier: "core" },
  { name: "multi-048", pages: 48, tier: "core" },
  { name: "multi-096", pages: 96, tier: "core" },
  {
    name: "multi-192",
    pages: 192,
    tier: "core",
    outline: [
      { title: "Section One", page: 1, depth: 1 },
      { title: "Section Two", page: 41, depth: 1 },
      { title: "Section Two A", page: 61, depth: 2 },
      { title: "Section Three", page: 121, depth: 1 },
    ],
  },
  { name: "multi-1000", pages: 1000, tier: "scale" },
];
mkdirSync(join(fixtures, "multi"), { recursive: true });
const multiManifest = { docs: [] };
for (const { name, pages, tier, outline } of multiTier) {
  const pdf = buildMultiPagePdf({ pages, title: `Fixture Doc ${name}`, outline });
  writeFileSync(join(fixtures, "multi", `${name}.pdf`), pdf);
  multiManifest.docs.push({
    name: `${name}.pdf`,
    pages,
    tier,
    title: `Fixture Doc ${name}`,
    author: "Fixture Author",
    ...(outline === undefined ? {} : { outline }),
  });
}
writeFileSync(join(fixtures, "multi", "manifest.json"), `${JSON.stringify(multiManifest, null, 2)}\n`);

const special = {
  // Info-dictionary hit (FR-05 primary path).
  "info-title.pdf": buildPdf({ title: "Real Info Title", author: "Real Info Author" }),
  // Valid PDF, no Info dictionary → filename fallback.
  "info-none.pdf": buildPdf({}),
  // Encrypted-looking Info strings → strict UTF-8 rejection → filename fallback.
  "encrypted.pdf": buildEncryptedPdf(),
  // Genuinely password-protected (FR-20): pdfium refuses it without the
  // password "sesame" and renders it with it. The reader's unlock flow and
  // the cover glyph fallback both key on this file.
  "protected.pdf": buildProtectedPdf(),
  // Not a PDF at all → extraction fails → filename fallback; pdfium cannot
  // render it either, so it doubles as the glyph-fallback fixture (FR-16).
  "malformed.pdf": Buffer.from("%PDF-1.7\nnot a pdf body at all\n%%EOF\n", "latin1"),
  // A non-PDF file the import pipeline must skip (FR-01).
  "notes.txt": Buffer.from("plain text, never imported\n", "latin1"),
  // The meta-column flow's distinctly-named fixture: no Info, so its title is
  // the filename fallback — a name no other fixture can produce. The spaces
  // keep it ordinary query tokens for the search flows.
  "meta column probe.pdf": buildPdf({}),
  // AC-93 (UI-30/DR-206): the long-name fixture — exactly 72 characters,
  // which at the strip's fonts is wider than the space the reader chrome has
  // for the name at the window's minimum size, while the default 1000 px
  // window still fits it in full. No Info (the name is the identity); no
  // query token collides with any flow's search terms.
  "ac93-reader-chrome-name-ellipsis-fixture-document-for-narrow-windows.pdf": buildPdf({}),
};
for (const [name, bytes] of Object.entries(special)) {
  writeFileSync(join(fixtures, "special", name), bytes);
}

console.log(
  `fixtures ready: ${DOC_COUNT} docs in fixtures/docs, ${coreNames.length} core in fixtures/core (+ manifest.json), ${Object.keys(special).length} special in fixtures/special, ${multiTier.length} multi-page in fixtures/multi (+ manifest.json)`
);
