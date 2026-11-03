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

rmSync(fixtures, { recursive: true, force: true });
mkdirSync(join(fixtures, "docs"), { recursive: true });
mkdirSync(join(fixtures, "special"), { recursive: true });

for (let index = 1; index <= DOC_COUNT; index += 1) {
  const name = `doc${String(index).padStart(5, "0")}`;
  const pdf = buildPdf({ title: `Fixture Doc ${name}`, author: `Fixture Author` });
  writeFileSync(join(fixtures, "docs", `${name}.pdf`), pdf);
}

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
};
for (const [name, bytes] of Object.entries(special)) {
  writeFileSync(join(fixtures, "special", name), bytes);
}

console.log(
  `fixtures ready: ${DOC_COUNT} docs in fixtures/docs, ${Object.keys(special).length} special in fixtures/special`
);
