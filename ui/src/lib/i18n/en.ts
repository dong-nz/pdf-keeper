// The shipped message catalog (NFR-05). All user-facing strings live here;
// components call `t(key)` only. Count-dependent strings carry `one`/`other`
// variants selected with Intl.PluralRules (see index.ts).

const en = {
  // App chrome

  // Navigation (Browse menu, UI-09)
  "browse.menu": "Browse",
  "browse.allDocuments": "All documents",
  "browse.favorites": "Favorites",
  "browse.missing": "Missing files",
  "browse.categories": "Categories",
  "browse.manage": "Manage categories…",

  // Categories manager (UI-10)
  "categoriesDialog.title": "Categories",
  "categoriesDialog.newPlaceholder": "New category",
  "categoriesDialog.addTitle": "Add category",
  "categoriesDialog.rename": "Rename category",
  "categoriesDialog.delete": "Delete category",
  "categoriesDialog.empty": "No categories yet.",

  // Toolbar
  "toolbar.searchPlaceholder": "Search title, author, notes, filename",
  "toolbar.clearSearch": "Clear search",
  "toolbar.import": "Import",
  "toolbar.importing": "Importing…",
  "toolbar.importFiles": "Import PDFs…",
  "toolbar.importFolder": "Import folder…",
  "toolbar.sort": "Sort",
  "toolbar.sort.title": "Title",
  "toolbar.sort.date_added": "Date added",
  "toolbar.sort.size": "File size",
  "toolbar.sortDir.asc": "Ascending",
  "toolbar.sortDir.desc": "Descending",
  "toolbar.sort.secondary": "Then by…",
  "toolbar.sort.secondary.none": "None",
  "toolbar.view.list": "List view",
  "toolbar.view.grid": "Grid view",
  "toolbar.view": "View",
  "toolbar.view.columns": "Columns",
  "toolbar.view.columns.auto": "Auto",
  "toolbar.view.columns.decrease": "Fewer columns",
  "toolbar.view.columns.increase": "More columns",
  "toolbar.view.columns.count": "{count} columns",
  "filter.active": "Active filters",

  // App menu and About dialog (UI-12)
  "menu.app": "Application menu",
  "menu.about": "About PDF Keeper…",
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
  "drop.toCategory": "Adds to {categories}",

  // Selection and bulk bar
  "bulk.selected": "{count} selected",
  "bulk.selectAllMatching": "Select all {total} matching",
  "bulk.clear": "Clear selection",
  "bulk.favorite": "Add to favorites",
  "bulk.unfavorite": "Remove from favorites",
  "bulk.categories": "Categories…",
  "bulk.delete": "Delete",

  // Status bar
  "status.results": "{count} shown",
  "status.rescan": "Rescan",

  // Job progress
  "job.import": "Importing…",
  "job.rescan": "Checking files…",
  "job.cover": "Generating covers…",

  // Empty states
  "empty.library.title": "Your library is empty",
  "empty.library.body": "Import PDFs to get started — files stay where they are.",
  "empty.library.action": "Import PDFs",
  "empty.library.hint": "or press Ctrl+I",
  "empty.search.title": "No documents match “{q}”",
  "empty.search.body": "Try a different term, or clear the filters.",
  "empty.search.action": "Clear search",
  "empty.favorites.title": "No favorites yet",
  "empty.favorites.body": "Star a document to pin it here.",
  "empty.category.title": "This category is empty",
  "empty.category.body": "Import into this category or assign documents to it.",
  "empty.category.action": "Import PDFs",
  "empty.missing.title": "No missing files",
  "empty.missing.body": "Every file in the library was found.",

  // Document rows and cards
  "row.missingBadge": "Missing",
  "row.open": "Open",
  "row.details": "Details",
  "row.favorite": "Add to favorites",
  "row.unfavorite": "Remove from favorites",
  "row.relink": "Relink…",
  "row.delete": "Delete",
  "row.select": "Select document",
  "row.selectRangeHint": "Shift-click to select a range",
  "card.coverAlt": "Cover of {title}",
  "row.categoryMore": "+{count} more",

  // Details modal
  "details.title": "Document details",
  "details.fieldTitle": "Title",
  "details.titleFromFilename": "from filename",
  "details.fieldAuthor": "Author",
  "details.fieldNotes": "Notes",
  "details.fieldFavorite": "Favorite",
  "details.fieldCategories": "Categories",
  "details.save": "Save",
  "details.discard": "Discard",
  "details.discardConfirm": "Discard changes?",
  "details.discardKeep": "Keep editing",
  "details.discardDiscard": "Discard",
  "details.errorTitleEmpty": "Title cannot be empty",
  "details.relink": "Relink…",
  "details.delete": "Delete…",
  "details.pathLabel": "File",

  // Category picker (bulk)
  "picker.title": "Categories for {count} documents",
  "picker.add": "Add",
  "picker.remove": "Remove",
  "picker.confirm": "Apply",
  "picker.noCategories": "No categories yet — create one with Manage categories…",

  // Category dialogs
  "category.nameLabel": "Name",
  "category.renameAction": "Rename",
  "category.deleteTitle": "Delete category “{name}”?",
  "category.deleteBody": "Documents are not deleted or changed; only the category and its assignments are removed.",
  "category.deleteAction": "Delete category",
  "category.errorDuplicate": "A category with this name already exists",

  // Delete dialog
  "delete.title.one": "Delete {count} document?",
  "delete.title.other": "Delete {count} documents?",
  "delete.body": "The PDF files stay on disk unless you choose to delete them too.",
  "delete.fromLibrary": "Delete from library",
  "delete.withFiles": "Delete with files",
  "delete.fileNote": "This also deletes the PDF files themselves.",

  // Relink dialog
  "relink.title": "Relink missing file",
  "relink.body": "The document is in the library, but its file was not found.",
  "relink.storedPath": "Last known location",
  "relink.chooseNew": "Choose new file…",
  "relink.errorMissing": "The file you chose is not a readable PDF.",

  // Toasts and confirmations
  "toast.imported.one": "Imported {count} PDF",
  "toast.imported.other": "Imported {count} PDFs",
  "toast.importSkipped.one": "{count} file skipped (already in library)",
  "toast.importSkipped.other": "{count} files skipped (already in library)",
  "toast.deleted.one": "Deleted {count} document",
  "toast.deleted.other": "Deleted {count} documents",
  "toast.deletedFiles.one": "Deleted {count} document and its file",
  "toast.deletedFiles.other": "Deleted {count} documents and their files",
  "toast.fileDeleteFailedAction": "Retry",
  "toast.rescanFound.one": "{count} missing file found",
  "toast.rescanFound.other": "{count} missing files found",
  "toast.rescanRestored.one": "{count} file found again",
  "toast.rescanRestored.other": "{count} files found again",
  "toast.relinked": "File relinked",
  "toast.categoryCreated": "Category created",

  // Command errors (toasts)
  "error.missingFile": "The file is missing: {path}",
  "error.missingFileAction": "Relink…",
  "error.documentGone": "That document no longer exists.",
  "error.categoryGone": "That category no longer exists.",
  "error.categoryDuplicate": "A category with this name already exists.",
  "error.openFailed": "The operating system could not open the file.",
  "error.io": "A file operation failed: {path}",
  "error.internal": "Something went wrong.",

  // Accessibility
  "a11y.documentList": "Document list",
  "a11y.documentGrid": "Document grid",
  "a11y.counts": "Library counts",
  "a11y.progress": "{label}: {processed} of {total}",
  "a11y.dismiss": "Dismiss",
} as const;

export default en;
