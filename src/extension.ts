import * as vscode from 'vscode';
import * as cp from 'child_process';

let diagnosticCollection: vscode.DiagnosticCollection;
let timeout: NodeJS.Timeout | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('ren');
    context.subscriptions.push(diagnosticCollection);

    // Run diagnostics on the active document when the extension is first activated
    if (vscode.window.activeTextEditor) {
        updateDiagnostics(vscode.window.activeTextEditor.document);
    }
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(document => {
            updateDiagnostics(document);
        })
    );


    // Run diagnostics on text change (with debouncing)
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(document => {
            updateDiagnostics(document);
        })
    );

    // Clear diagnostics when a file is closed
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(document => {
            diagnosticCollection.delete(document.uri);
        })
    );
}

function updateDiagnostics(document: vscode.TextDocument): void {
    const config = vscode.workspace.getConfiguration('ren.compiler');
    // Read the setting for the compiler path. If it's not set, default to 'renc'.
    const command = config.get<string>('path', 'renc');

    // Use spawn instead of exec for better argument handling and safety
    const args = [document.fileName, '--diagnostics'];

    try {
        const child = cp.spawn(command, args, { shell: true });

        let stderr = '';
        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            // Clear old diagnostics for this file
            diagnosticCollection.set(document.uri, []);

            if (stderr) {
                const diagnostics = parseCompilerOutput(stderr);
                diagnosticCollection.set(document.uri, diagnostics);
            }
        });

        child.on('error', (err) => {
            // This catches errors like "command not found"
            diagnosticCollection.clear();
            vscode.window.showErrorMessage(
                `Failed to run 'renc'. Please ensure it's in your system PATH or set the 'ren.compiler.path' setting. Error: ${err.message}`
            );
        });

    } catch (error) {
        vscode.window.showErrorMessage(`An unexpected error occurred while running the Ren compiler: ${error}`);
    }
}

function parseCompilerOutput(stderr: string): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const regex = /^(.+?):(\d+):(\d+):(\d+):\s*(error|warning):\s*(.*)$/gm;

    let match;
    while ((match = regex.exec(stderr)) !== null) {
        const line = parseInt(match[2], 10) - 1;
        const column = parseInt(match[3], 10) - 2;
        const length = parseInt(match[4], 10);
        const level = match[5];
        const message = match[6].trim(); // Trim trailing whitespace

        console.log(length);

        const range = new vscode.Range(line, column, line, column + length);

        const severity = level === 'error'
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning;

        const diagnostic = new vscode.Diagnostic(range, message, severity);
        diagnostic.source = 'renc'; // Source is now 'renc'
        diagnostics.push(diagnostic);
    }
    return diagnostics;
}

export function deactivate() {
    if (diagnosticCollection) {
        diagnosticCollection.dispose();
    }
    if (timeout) {
        clearTimeout(timeout);
    }
}