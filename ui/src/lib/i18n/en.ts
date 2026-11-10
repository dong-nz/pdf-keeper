// The shipped message catalog (NFR-05). All user-facing strings live here;
// components call `t(key)` only. Count-dependent strings carry `one`/`other`
// variants selected with Intl.PluralRules (see index.ts).

const en = {
  // App chrome

  // Navigation (Browse menu, UI-09)
  "browse.menu": "Browse",
  "browse.allDocuments": "All documents",
  "browse.favorites": "Favorites",
  "browse.reading": "Reading",
  "browse.missing": "Missing documents",
  "browse.tags": "Tags",
  "browse.manage": "Manage tags",
  "browse.rescan": "Rescan documents",

  // Tags manager (UI-10)
  "tagsDialog.title": "Tags",
  "tagsDialog.newPlaceholder": "New tag",
  "tagsDialog.addTitle": "Add tag",
  "tagsDialog.rename": "Rename tag",
  "tagsDialog.delete": "Delete tag",
  "tagsDialog.empty": "No tags yet.",

  // Toolbar
  "toolbar.clearSearch": "Clear search",
  // UI-44 (AC-114): every import entry point names the thing that is imported
  // — PDFs — and the folder picker names its container.
  "toolbar.import": "Import PDFs",
  "toolbar.importFiles": "Import PDFs",
  "toolbar.importFolder": "Import folder",
  // UI-29 (AC-115): the import menu shows the shortcut each item opens.
  "toolbar.importFiles.keys": "Ctrl+I",
  "toolbar.importFolder.keys": "Ctrl+O",
  "toolbar.select": "Select mode · Shift-click to select a range",
  "toolbar.sort.title": "Title",
  "toolbar.sort.date_added": "Date added",
  "toolbar.sort.size": "Size",
  "toolbar.sortDir.asc": "Ascending",
  "toolbar.sortDir.desc": "Descending",
  "toolbar.sort.secondary": "Then by",
  "toolbar.sort.secondary.none": "None",
  "view.sortBy": "Sort by",
  "toolbar.view.list": "List view",
  "toolbar.view.grid": "Grid view",
  "toolbar.view": "View",
  "toolbar.view.columns": "Columns",
  "toolbar.view.columns.auto": "Auto",
  "toolbar.view.columns.decrease": "Fewer columns",
  "toolbar.view.columns.increase": "More columns",
  "toolbar.view.columns.count": "{count} columns",

  // Search field (UI-16): the placeholder names the scope; `search.label` is
  // the input's fixed accessible name, independent of the placeholder.
  "search.label": "Search",
  "search.placeholder.all.one": "Search in {count} document",
  "search.placeholder.all.other": "Search in {count} documents",
  "search.placeholder.tag": "Search in {name}",
  "search.placeholder.tags.one": "Search in {count} tag",
  "search.placeholder.tags.other": "Search in {count} tags",
  "search.placeholder.favorites": "Search in Favorites",
  "search.placeholder.reading": "Search in Reading",
  "search.placeholder.missing": "Search in Missing",
  "search.placeholder.favoritesTags.one": "Search in Favorites · {count} tag",
  "search.placeholder.favoritesTags.other": "Search in Favorites · {count} tags",
  "search.placeholder.readingTags.one": "Search in Reading · {count} tag",
  "search.placeholder.readingTags.other": "Search in Reading · {count} tags",

  // Settings menu (UI-17) and the Settings dialog. `menu.about` is the About
  // item's text, now reached from here (UI-12 as modified); the app-menu control
  // and its key left with `AppMenu.svelte`.
  "settings.menu": "Settings",
  "settings.open": "Settings",
  "settings.title": "Settings",
  "settings.appearance": "Appearance",
  "settings.theme": "Theme",
  "settings.viewMode": "View",
  // v0.0.7 (UI-21, DR-191): the Library section is gone (its facts live in
  // the status bar and the About dialog); the data location is its own
  // section with an open action.
  "settings.dataLocation": "Data location",
  "settings.openLocation": "Open location",
  "theme.auto": "Auto",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "menu.about": "About PDF Keeper",
  "about.title": "About PDF Keeper",
  "about.name": "Application",
  "about.version": "Version",

  // Window controls (UI-07)
  "window.minimize": "Minimize",
  "window.maximize": "Maximize",
  "window.restore": "Restore",
  "window.close": "Close",

  // Drag-and-drop overlay (importing-pdfs spec, UI section)
  "drop.title": "Drop PDFs to add them",
  "drop.toTag": "Adds to {tags}",

  // Selection and bulk bar
  "bulk.selected": "{count} selected",
  "bulk.selectAllMatching": "Select all {total} matching",
  "bulk.clear": "Clear selection",
  "bulk.favorite": "Add to favorites",
  "bulk.unfavorite": "Remove from favorites",
  "bulk.tags": "Tags",
  "bulk.delete": "Delete",

  // Status bar (UI-15 as modified by DR-210): the document count carries its
  // unit label through the plural catalog ("1 document" / "1,234 documents");
  // the warning is the only status text that names itself, and it appears only
  // when the missing count is above zero.
  "status.documents.one": "{count} document",
  "status.documents.other": "{count} documents",
  "status.results": "{count} shown",
  "status.missingFiles.one": "{count} document missing",
  "status.missingFiles.other": "{count} documents missing",

  // Job progress
  "job.import": "Importing…",
  "job.rescan": "Checking files…",
  "job.cover": "Generating covers…",

  // Empty states
  "empty.library.title": "Your library is empty",
  "empty.library.body": "Import PDFs to get started — files stay where they are.",
  "empty.library.action": "Import PDFs",
  // UI-29 (DR-118): the key combinations are catalog values, not markup (R4.1).
  "empty.library.keys": "Ctrl+I",
  // UI-29 as modified (AC-115, DR-272/DR-275): the folder path is an action
  // button; its label joins the catalog and its combination is Ctrl+O —
  // Ctrl+Shift+I was WebView2's own DevTools accelerator in dev builds.
  "empty.library.action.folder": "Import folder",
  "empty.library.keys.folder": "Ctrl+O",
  "empty.search.title": "No documents match “{q}”",
  "empty.search.body": "Try a different term, or clear the filters.",
  "empty.search.action": "Clear search",
  "empty.favorites.title": "No favorites yet",
  "empty.favorites.body": "Star a document to pin it here.",
  "empty.reading.title": "Nothing marked as reading",
  "empty.reading.body": "Use the Reading action on a document to gather it here.",
  "empty.tag.title": "This tag is empty",
  "empty.tag.body": "Import into this tag or assign documents to it.",
  "empty.tag.action": "Import PDFs",
  "empty.missing.title": "No missing documents",
  "empty.missing.body": "Every document's file was found.",

  // Document rows and cards
  "row.missingBadge": "Missing",
  "row.open": "Open",
  "row.openExternal": "Open in external viewer",
  // UI-40 (AC-111): the reveal action — context menu and Details only.
  "row.openFolder": "Open containing folder",
  "row.details": "Details",
  "row.favorite": "Add to favorites",
  "row.unfavorite": "Remove from favorites",
  "row.reading": "Add to Reading",
  "row.unreading": "Remove from Reading",
  "row.relink": "Relink",
  "row.rename": "Rename",
  "row.delete": "Delete",
  "card.coverAlt": "Cover of {title}",

  // Details modal
  "details.title": "Document details",
  "details.fieldTitle": "Title",
  "details.titleFromFilename": "from filename",
  "details.fieldAuthor": "Author",
  "details.fieldNotes": "Notes",
  "details.fieldFavorite": "Favorite",
  "details.fieldTags": "Tags",
  "details.save": "Save",
  "details.discard": "Discard",
  "details.discardConfirm": "Discard changes?",
  "details.discardKeep": "Keep editing",
  "details.discardDiscard": "Discard",
  "details.errorTitleEmpty": "Title cannot be empty",
  "details.relink": "Relink",
  "details.rename": "Rename",
  "details.openFolder": "Open containing folder",
  "details.delete": "Delete",
  "details.pathLabel": "File",

  // Tag picker (bulk)
  "picker.title": "Tags for {count} documents",
  "picker.add": "Add",
  "picker.remove": "Remove",
  "picker.confirm": "Apply",
  "picker.noTags": "No tags yet — create one with Manage tags",

  // Tag dialogs
  "tag.nameLabel": "Name",
  "tag.renameAction": "Rename",
  "tag.deleteTitle": "Delete tag “{name}”?",
  "tag.deleteBody": "Documents are not deleted or changed; only the tag and its assignments are removed.",
  "tag.deleteAction": "Delete tag",
  "tag.errorDuplicate": "A tag with this name already exists",

  // Rename file dialog (FR-21)
  "renameDialog.title": "Rename file",
  "renameDialog.nameLabel": "File name",
  "renameDialog.action": "Rename",
  "renameDialog.errorInvalid": "This name can't be used as a file name",
  "renameDialog.errorConflict": "A file with this name already exists in that folder",

  // Delete dialog
  "delete.title.one": "Delete {count} document?",
  "delete.title.other": "Delete {count} documents?",
  "delete.body": "The PDF files stay on disk unless you choose to delete them too.",
  "delete.fromLibrary": "Delete from library",
  "delete.withFiles": "Delete with files",
  "delete.fileNote": "This also deletes the PDF files themselves.",

  // Relink dialog
  "relink.title": "Relink missing document",
  "relink.body": "The document is in the library, but its file was not found.",
  "relink.storedPath": "Last known location",
  "relink.chooseNew": "Choose new file",
  "relink.errorMissing": "The file you chose is not a readable PDF.",

  // Toasts and confirmations
  "toast.imported.one": "Imported {count} PDF",
  "toast.imported.other": "Imported {count} PDFs",
  "toast.importSkipped.one": "{count} document skipped (already in library)",
  "toast.importSkipped.other": "{count} documents skipped (already in library)",
  "toast.deleted.one": "Deleted {count} document",
  "toast.deleted.other": "Deleted {count} documents",
  "toast.deletedFiles.one": "Deleted {count} document and its file",
  "toast.deletedFiles.other": "Deleted {count} documents and their files",
  "toast.fileDeleteFailedAction": "Retry",
  "toast.rescanFound.one": "{count} missing document found",
  "toast.rescanFound.other": "{count} missing documents found",
  "toast.rescanRestored.one": "{count} document found again",
  "toast.rescanRestored.other": "{count} documents found again",
  "toast.relinked": "Document relinked",
  "toast.tagCreated": "Tag created",

  // Command errors (toasts)
  "error.missingFile": "The document's file is missing: {path}",
  "error.missingFileAction": "Relink",
  "error.documentGone": "That document no longer exists.",
  "error.tagGone": "That tag no longer exists.",
  "error.tagDuplicate": "A tag with this name already exists.",
  "error.openFailed": "The operating system could not open the file.",
  "error.io": "A file operation failed: {path}",
  "error.internal": "Something went wrong.",

  // Reader window (UI-30/UI-31, SPEC-v0.0.6)
  "reader.previous": "Previous page",
  "reader.next": "Next page",
  "reader.pageField": "Page {page} of {count}",
  "reader.fitWidth": "Fit width",
  "reader.zoomOut": "Zoom out",
  "reader.zoomIn": "Zoom in",
  "reader.zoom.fitPage": "Fit page",
  "reader.zoom.actual": "Actual size",
  "reader.pageAlt": "Page {page}",
  "reader.error": "This PDF cannot be opened in the reader.",
  // v0.0.7: table of contents (UI-33) and view modes (UI-34).
  "reader.toc": "Table of contents",
  "reader.toc.expandAll": "Expand all",
  "reader.toc.collapseAll": "Collapse all",
  "reader.toc.expandEntry": "Expand section",
  "reader.toc.collapseEntry": "Collapse section",
  "reader.view.single": "Single page",
  "reader.view.continuous": "Continuous",
  "reader.view.facing": "Facing pages",
  // v0.0.8: the unlock form of a protected document (FR-20, AC-104/AC-105).
  "reader.password.title": "This document has a password",
  "reader.password.field": "Password",
  "reader.password.remember": "Remember this password",
  "reader.password.unlock": "Unlock",
  "reader.password.remove": "Remove password",
  "reader.password.wrong": "That password does not open this document",

  // Accessibility
  "a11y.documentList": "Document list",
  "a11y.documentGrid": "Document grid",
  "a11y.progress": "{label}: {processed} of {total}",
  "a11y.dismiss": "Dismiss",
} as const;

export default en;
