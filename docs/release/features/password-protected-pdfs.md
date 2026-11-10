# Password-protected PDFs

> **Status: 📝 Draft — planned for v0.0.8; not in the app yet.** This page describes planned behavior from the approved release plan; it is verified and marked Shipped only when the release ships.

Some PDFs open only with a password. The built-in reader handles them:

- Opening a protected document shows a **password prompt** in the reader — not an error. Type the password and the document behaves exactly like any other: navigation, zoom, contents, view modes.
- A wrong password keeps the prompt open with a clear message; the window stays usable (close it, or open the file with your own application).
- The prompt carries a **Remember this password** checkbox, unchecked by default. Checked, the app stores the password with that document in your own library data, the prompt arrives pre-filled next time, and a **Remove password** action clears it. Unchecked, nothing is stored and the prompt asks again on every open.
- A protected document shows the neutral placeholder cover in lists until you unlock it once with a remembered password — after that its real cover appears like any other document's.

Known limitation: a protected document's title and author are not read from inside the file — the name shown is its filename, unless you edit the title yourself.
