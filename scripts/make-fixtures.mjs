#!/usr/bin/env node
// Generates the test fixture PDFs (RULES R6.2): deterministic, never
// committed as binaries. Rust tests and the UI smoke script consume the
// same tree, so fixture semantics are defined in exactly one place.
// Usage: node scripts/make-fixtures.mjs
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(root, "fixtures");

const DOC_COUNT = 10_000;

// Core fixture tier (SPEC-v0.0.5 §2, DR-135): the 100 documents the functional
// smoke flows run against. The composition carries exactly the properties those
// flows depend on: identical byte sizes (the sort-tie property), Info
// dictionaries with Title/Author (metadata display, search), one document with
// no Info (doc00900 — the filename fallback), one document the missing-file
// flow moves away (doc00500), and the title prefixes the search and category
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
function buildMultiPagePdf({ pages, title }) {
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
  coreManifest.docs.push(noInfo
    ? { name: `${name}.pdf`, noInfo: true }
    : { name: `${name}.pdf`, title: `Fixture Doc ${name}`, author: "Fixture Author" });
}
writeFileSync(join(fixtures, "core", "manifest.json"), `${JSON.stringify(coreManifest, null, 2)}\n`);

// Multi-page tier (SPEC-v0.0.6 §3.5): five core-tier documents (12 / 24 / 48 /
// 96 / 192 pages) and one scale-tier 1 000-page document, generated into
// fixtures/multi/ — the existing single-page corpora stay byte- and
// count-identical ("covers keep their corpus"). The manifest carries the page
// counts so the harness and the Rust tests derive them instead of hard-coding.
const multiTier = [
  { name: "multi-012", pages: 12, tier: "core" },
  { name: "multi-024", pages: 24, tier: "core" },
  { name: "multi-048", pages: 48, tier: "core" },
  { name: "multi-096", pages: 96, tier: "core" },
  { name: "multi-192", pages: 192, tier: "core" },
  { name: "multi-1000", pages: 1000, tier: "scale" },
];
mkdirSync(join(fixtures, "multi"), { recursive: true });
const multiManifest = { docs: [] };
for (const { name, pages, tier } of multiTier) {
  const pdf = buildMultiPagePdf({ pages, title: `Fixture Doc ${name}` });
  writeFileSync(join(fixtures, "multi", `${name}.pdf`), pdf);
  multiManifest.docs.push({
    name: `${name}.pdf`,
    pages,
    tier,
    title: `Fixture Doc ${name}`,
    author: "Fixture Author",
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
  // Not a PDF at all → extraction fails → filename fallback; pdfium cannot
  // render it either, so it doubles as the glyph-fallback fixture (FR-16).
  "malformed.pdf": Buffer.from("%PDF-1.7\nnot a pdf body at all\n%%EOF\n", "latin1"),
  // A non-PDF file the import pipeline must skip (FR-01).
  "notes.txt": Buffer.from("plain text, never imported\n", "latin1"),
  // The meta-column flow's distinctly-named fixture: no Info, so its title is
  // the filename fallback — a name no other fixture can produce. The spaces
  // keep it ordinary query tokens for the search flows.
  "meta column probe.pdf": buildPdf({}),
};
for (const [name, bytes] of Object.entries(special)) {
  writeFileSync(join(fixtures, "special", name), bytes);
}

console.log(
  `fixtures ready: ${DOC_COUNT} docs in fixtures/docs, ${coreNames.length} core in fixtures/core (+ manifest.json), ${Object.keys(special).length} special in fixtures/special, ${multiTier.length} multi-page in fixtures/multi (+ manifest.json)`
);
