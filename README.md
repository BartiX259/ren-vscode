---

# Ren Language Support for VS Code

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/your-publisher-name.ren-language?style=flat-square&label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=your-publisher-name.ren-language)
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](https://github.com/your-github-repo/ren-vscode/blob/main/LICENSE)

This extension provides comprehensive language support for the [Ren programming language](https://github.com/your-github-repo/ren) in Visual Studio Code.

*(You should replace this with an actual screenshot showing off the syntax highlighting and an error squiggle!)*
![Ren language features](images/screenshot.png)

## Features

*   **Syntax Highlighting:** Full syntax highlighting for `.re` files.
*   **Real-time Diagnostics:** Get instant feedback with error and warning squiggles directly from the `renc` compiler. Diagnostics are updated whenever a file is opened or saved.
*   **Bracket Autocompletion:** Automatic closing for `()`, `[]`, `{}`, and `<>`.
*   **Comment Toggling:** Easily comment and uncomment lines of code with `Ctrl+/` (or `Cmd+/`).

## Requirements

This extension relies on the official Ren compiler, **`renc`**, to provide diagnostics and error checking. You must have `renc` installed on your system for the full functionality.

1.  **Install the Ren Compiler (`renc`)**
    Download the latest release from the [official Ren repository](https://github.com/your-github-repo/ren/releases) and place it somewhere on your computer.

2.  **Add `renc` to your System PATH**
    For the extension to find the compiler automatically, the folder containing `renc` must be included in your system's `PATH` environment variable.

    You can verify it's installed correctly by opening a new terminal or command prompt and typing:
    ```sh
    renc --version
    ```
    If this command works, the extension should work automatically.

## Extension Settings

If you are unable to add `renc` to your system's PATH, you can specify the absolute path to the executable in your VS Code settings.

*   `ren.compiler.path`: The full path to the `renc` compiler executable.

**Example (`settings.json`):**

```json
{
  // For Windows
  "ren.compiler.path": "C:\\Users\\YourUser\\path\\to\\renc.exe",

  // For macOS / Linux
  "ren.compiler.path": "/home/youruser/path/to/renc"
}
```

## Known Issues

*   Diagnostics are currently updated only when a file is opened or saved. Live-as-you-type feedback using a temporary file is a planned future improvement.

## Release Notes

### 1.0.0

- Initial release of the Ren language extension.
- Syntax highlighting for `.re` files.
- Diagnostics on save and on open powered by the `renc` compiler.

---
**Enjoy coding in Ren!**