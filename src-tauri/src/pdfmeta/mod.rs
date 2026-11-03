//! PDF Info-dictionary extraction via `lopdf` (FR-05). Extraction NEVER
//! errors: unreadable files (encrypted, malformed) simply yield nothing and
//! the caller applies the filename fallback.

use lopdf::{Dictionary, Document, Object};

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::fixture;

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
}
