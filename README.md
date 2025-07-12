
---

# Ren Language Support for VS Code

This extension provides comprehensive language support for the [Ren programming language](https://github.com/bartix259/ren) in Visual Studio Code.

## Features

*   **Syntax Highlighting:** Full syntax highlighting for `.re` files.
*   **Real-time Diagnostics:** Get instant feedback with error and warning squiggles directly from the `renc` compiler. Diagnostics are updated whenever a file is opened or saved.
*   **Bracket Autocompletion:** Automatic closing for `()`, `[]`, `{}`, and `<>`.
*   **Comment Toggling:** Easily comment and uncomment lines of code with `Ctrl+/` (or `Cmd+/`).

## Requirements

This extension relies on the official Ren compiler, **`renc`**, to provide diagnostics and error checking.

1. Follow the installation steps at the [official Ren repository](https://github.com/bartix259/ren).

2. Verify it's installed correctly by opening a new terminal or command prompt and typing:
```sh
renc
```

## Known Issues

*   Diagnostics are currently updated only when a file is opened or saved.
*   No support for stuff like `go to definition`, `code actions` etc.

---
**Enjoy coding in Ren!**
