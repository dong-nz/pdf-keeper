# Finding a document's file on disk

> **Status: ✅ Shipped in v0.0.8** — verified by running the app (the item in the context menu and in Details, the file manager opening with the file selected, the item absent for a missing document).

Your files stay where they are — the app only keeps track of them. When you need to see the actual file, **Open containing folder** in a document's context menu or in its Details dialog: your system's file manager opens that document's folder with the file selected.

The action appears only for documents whose file is present. A missing document offers **Relink** instead ([missing-files-relinking.md](missing-files-relinking.md)).
