//! PDF Info-dictionary extraction via `lopdf` (FR-05). Extraction NEVER
//! errors: unreadable files (encrypted, malformed) simply yield nothing and
//! the caller applies the filename fallback.

use lopdf::{Dictionary, Document, Object};

use crate::error::AppError;

pub struct Extracted {
    pub title: Option<String>,
    pub author: Option<String>,
}

pub fn extract(path: &str) -> Extracted {
    match Document::load(path) {
        Ok(document) => from_document(&document),
        Err(_) => Extracted {
            title: None,
            author: None,
        },
    }
}

fn from_document(document: &Document) -> Extracted {
    let info_id = match document.trailer.get(b"Info") {
        Ok(&Object::Reference(id)) => id,
        _ => {
            return Extracted {
                title: None,
                author: None,
            };
        }
    };
    let dictionary = match document.get_object(info_id) {
        Ok(Object::Dictionary(dictionary)) => dictionary,
        _ => {
            return Extracted {
                title: None,
                author: None,
            };
        }
    };
    Extracted {
        title: string_field(dictionary, b"Title"),
        author: string_field(dictionary, b"Author"),
    }
}

fn string_field(dictionary: &Dictionary, key: &[u8]) -> Option<String> {
    let bytes = match dictionary.get(key) {
        Ok(Object::String(bytes, _)) => bytes.as_slice(),
        _ => return None,
    };
    // Strict UTF-8: ciphertext from an encrypted PDF fails here and the
    // caller falls back to the filename (FR-05 failure modes).
    let text = std::str::from_utf8(bytes).ok()?;
    let cleaned: String = text
        .chars()
        .filter(|c| !c.is_control())
        .collect::<String>()
        .trim()
        .to_string();
    (!cleaned.is_empty()).then_some(cleaned)
}

// ------------------------------------------------------------------ outline

/// One entry of the outline tree (FR-18, SPEC-v0.0.7 §3.5): `page` is
/// 1-based, `depth` 1 is the top level — the `app_pdf_outline` payload.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct OutlineEntry {
    pub title: String,
    pub page: u32,
    pub depth: u32,
}

/// Outline reading via lopdf's `get_toc` (FR-18; the helper choice is
/// recorded as DR-197): the walk follows First/Next/children with
/// named-destination resolution, page numbers resolve 1-based through the
/// page tree, titles decode through lopdf's text-string decoding
/// (PDFDocEncoding / UTF-16BE). A file that cannot be parsed yields the
/// typed `PdfUnopenable`; a document without an outline — or an outline
/// whose walk fails on partial data — yields the empty list: structure
/// reading never errors on partial data, the same discipline as Info
/// extraction. Entries whose destination does not resolve are skipped while
/// resolvable siblings remain.
pub fn outline(path: &str) -> Result<Vec<OutlineEntry>, AppError> {
    let document = match Document::load(path) {
        Ok(document) => document,
        Err(_) => return Err(AppError::PdfUnopenable { path: path.to_string() }),
    };
    let toc = match document.get_toc() {
        Ok(toc) => toc,
        Err(_) => return Ok(Vec::new()),
    };
    Ok(toc
        .toc
        .into_iter()
        .filter_map(|entry| {
            Some(OutlineEntry {
                title: entry.title,
                page: u32::try_from(entry.page).ok()?,
                depth: u32::try_from(entry.level).ok()?,
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::{fixture, fixture_multi};

    #[test]
    fn info_dictionary_hit() {
        let extracted = extract(&fixture("info-title.pdf").to_string_lossy());
        assert_eq!(extracted.title.as_deref(), Some("Real Info Title"));
        assert_eq!(extracted.author.as_deref(), Some("Real Info Author"));
    }

    #[test]
    fn encrypted_malformed_and_info_less_files_yield_nothing() {
        // FR-05 failure modes: extraction never errors, it yields nothing and
        // the caller applies the filename fallback (covered end-to-end in
        // the service tests).
        for name in ["encrypted.pdf", "malformed.pdf", "info-none.pdf"] {
            let extracted = extract(&fixture(name).to_string_lossy());
            assert_eq!(extracted.title, None, "{name} must yield no title");
            assert_eq!(extracted.author, None, "{name} must yield no author");
        }
    }

    // ------------------------------------------------------------------ outline

    #[test]
    fn outline_returns_the_manifest_tree_for_multi_192() {
        // AC-77: the command's source yields exactly the manifest's four
        // entries — titles, 1-based page numbers, depth — derived from
        // `fixtures/multi/manifest.json`, not hard-coded (SPEC-v0.0.7 §3.5).
        let path = fixture_multi("multi-192.pdf").to_string_lossy().into_owned();
        let entries = outline(&path).expect("the fixture outline reads");
        let expected: Vec<OutlineEntry> = crate::testutil::manifest_outline("multi-192")
            .into_iter()
            .map(|(title, page, depth)| OutlineEntry { title, page, depth })
            .collect();
        assert_eq!(expected.len(), 4, "the manifest records four entries");
        assert_eq!(entries, expected);
    }

    #[test]
    fn documents_without_an_outline_yield_the_empty_list() {
        // AC-77 / UI-33's negative case: no outline is an empty list, never
        // an error — the multi tier without a recorded outline and the
        // Info-less single-page fixture.
        for name in ["multi-1000.pdf", "multi-012.pdf"] {
            let entries = outline(&fixture_multi(name).to_string_lossy()).expect("reads");
            assert!(entries.is_empty(), "{name} has no outline");
        }
        let entries = outline(&fixture("info-none.pdf").to_string_lossy()).expect("reads");
        assert!(entries.is_empty(), "a document without /Outlines is empty");
    }

    #[test]
    fn an_unparseable_file_yields_the_typed_error() {
        // AC-77: a file that cannot be parsed at all is `PdfUnopenable` —
        // the same classification the reader paths give the same failure.
        let error = outline(&fixture("malformed.pdf").to_string_lossy()).expect_err("typed");
        assert!(
            matches!(error, AppError::PdfUnopenable { .. }),
            "unparseable yields the typed classification: {error}"
        );
    }

    #[test]
    fn unresolvable_destinations_are_skipped_while_siblings_remain() {
        // AC-77's skip rule on a synthesized outline: a dangling page
        // reference and a named destination absent from the names tree cost
        // their own entries only.
        let temp = crate::testutil::TempDir::new("outline-skip");
        let path = temp.path().join("broken-outline.pdf");
        std::fs::write(&path, broken_outline_pdf()).expect("write fixture");
        let entries = outline(&path.to_string_lossy()).expect("partial data never errors");
        let titles: Vec<&str> = entries.iter().map(|entry| entry.title.as_str()).collect();
        assert_eq!(titles, ["Good One", "Good Two"]);
        assert_eq!(
            entries.iter().map(|entry| entry.page).collect::<Vec<_>>(),
            [1, 2],
            "the resolvable siblings keep their 1-based pages"
        );
    }

    /// A minimal two-page PDF whose outline carries four entries: two good,
    /// one with a dangling page reference, one with an unresolved named
    /// destination (the skip test's fixture, assembled like the generated
    /// fixtures are — with real xref offsets).
    fn broken_outline_pdf() -> Vec<u8> {
        let objects: Vec<(u32, &str)> = vec![
            (1, "<< /Type /Catalog /Pages 2 0 R /Outlines 7 0 R >>"),
            (2, "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>"),
            (3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>"),
            (5, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>"),
            (7, "<< /First 8 0 R /Last 11 0 R /Count 4 >>"),
            (
                8,
                "<< /Title (Good One) /Parent 7 0 R /Dest [3 0 R /XYZ null null null] /Next 9 0 R >>",
            ),
            (
                9,
                "<< /Title (Broken ref) /Parent 7 0 R /Dest [99 0 R /XYZ null null null] /Prev 8 0 R /Next 10 0 R >>",
            ),
            (
                10,
                "<< /Title (Broken name) /Parent 7 0 R /Dest (absent-destination) /Prev 9 0 R /Next 11 0 R >>",
            ),
            (
                11,
                "<< /Title (Good Two) /Parent 7 0 R /Dest [5 0 R /XYZ null null null] /Prev 10 0 R >>",
            ),
        ];
        let mut bytes: Vec<u8> = b"%PDF-1.4\n".to_vec();
        let mut offsets = std::collections::BTreeMap::new();
        for (num, body) in &objects {
            offsets.insert(num, bytes.len());
            bytes.extend(format!("{num} 0 obj\n{body}\nendobj\n").into_bytes());
        }
        let highest = objects.iter().map(|(num, _)| *num).max().unwrap_or(0);
        let xref_start = bytes.len();
        bytes.extend(format!("xref\n0 {}\n0000000000 65535 f \n", highest + 1).into_bytes());
        for num in 1..=highest {
            match offsets.get(&num) {
                Some(offset) => bytes.extend(format!("{offset:010} 00000 n \n").into_bytes()),
                None => bytes.extend(b"0000000000 65535 f \n".to_vec()),
            }
        }
        bytes.extend(
            format!(
                "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF\n",
                highest + 1
            )
            .into_bytes(),
        );
        bytes
    }
}
