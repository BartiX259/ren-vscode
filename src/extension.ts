import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

let diagnosticCollection: vscode.DiagnosticCollection;
type SymbolKind = 'type' | 'function';
interface SymbolCacheEntry {
    name: string;
    definition: string;
    kind: SymbolKind;
}
let symbolCache: SymbolCacheEntry[] = [];
interface VariableCacheEntry {
    name: string;
    type: string;
    scopeStartLine: number;
    scopeStartCol: number;
    scopeEndLine: number;
    scopeEndCol: number;
}
let variableCache: VariableCacheEntry[] = [];
let runningCompiler: cp.ChildProcess | undefined = undefined;
let timeout: NodeJS.Timeout | undefined = undefined;
let isCacheDirty = false;

export function activate(context: vscode.ExtensionContext) {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('ren');
    context.subscriptions.push(diagnosticCollection);

    const completionProvider = vscode.languages.registerCompletionItemProvider(
        'ren',
        {
            provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                const completionItems: vscode.CompletionItem[] = [];

                const cursorLine = position.line + 1;
                const cursorCol = position.character + 1;

                let variablesInScope: VariableCacheEntry[];
                if (isCacheDirty) {
                    variablesInScope = variableCache.filter(v => 
                        cursorLine >= v.scopeStartLine && cursorLine <= v.scopeEndLine
                    );
                } else {
                    variablesInScope = variableCache.filter(v => {
                        if (cursorLine < v.scopeStartLine || cursorLine > v.scopeEndLine) return false;
                        if (cursorLine === v.scopeStartLine && cursorCol < v.scopeStartCol) return false;
                        if (cursorLine === v.scopeEndLine && cursorCol > v.scopeEndCol) return false;
                        return true;
                    });
                }

                for (const variable of variablesInScope) {
                    const item = new vscode.CompletionItem(variable.name, vscode.CompletionItemKind.Variable);
                    item.detail = variable.type;
                    item.documentation = new vscode.MarkdownString(`(variable) \`${variable.name}: ${variable.type}\``);
                    completionItems.push(item);
                }

                // --- Static Keyword Snippets ---
                const staticSnippets = [
                    {
                        label: 'let',
                        kind: vscode.CompletionItemKind.Keyword,
                        documentation: 'Declares a new variable.',
                        body: 'let ${1:name} = ${2:value};$0'
                    },
                    {
                        label: 'fn',
                        kind: vscode.CompletionItemKind.Keyword,
                        documentation: 'Declares a new function.',
                        body: 'fn ${1:name}(${2:params}) {\n\t$0\n}'
                    },
                    {
                        label: 'if',
                        kind: vscode.CompletionItemKind.Keyword,
                        documentation: 'If statement.',
                        body: 'if ${1:condition} {\n\t$0\n}'
                    },
                    {
                        label: 'for',
                        kind: vscode.CompletionItemKind.Keyword,
                        documentation: 'For loop.',
                        body: 'for ${1:item} in ${2:iterable} {\n\t$0\n}'
                    },
                    {
                        label: 'while',
                        kind: vscode.CompletionItemKind.Keyword,
                        documentation: 'While loop.',
                        body: 'while ${1:condition} {\n\t$0\n}'
                    },
                    {
                        label: 'import',
                        kind: vscode.CompletionItemKind.Keyword,
                        documentation: 'Imports a Ren module.',
                        body: 'import ${1:path/to/module}$0'
                    },
                    {
                        label: 'decl',
                        kind: vscode.CompletionItemKind.Keyword,
                        documentation: 'Declares a variable without initializing it.',
                        body: 'decl ${1:name}: ${2:type};$0'
                    },
                    {
                        label: 'type',
                        kind: vscode.CompletionItemKind.Keyword,
                        documentation: 'Creates a new type alias.',
                        body: 'type ${1:alias} = ${2:type};$0'
                    },
                    {
                        label: 'pub fn',
                        kind: vscode.CompletionItemKind.Keyword,
                        documentation: 'Declares a new public function.',
                        body: 'pub fn ${1:name}(${2:params}) {\n\t$0\n}'
                    },
                    {
                        label: 'loop',
                        kind: vscode.CompletionItemKind.Keyword,
                        documentation: 'Creates an infinite loop.',
                        body: 'loop {\n\t$0\n}'
                    },
                    {
                        label: 'if let',
                        kind: vscode.CompletionItemKind.Snippet,
                        documentation: 'Unwraps a result or optional, handling success and error cases.',
                        body: 'if let ${1:ok_value} = ${2:expression} {\n\t$0\n} else ${3:err} {\n\t\n}'
                    },
                    {
                        label: 'enum',
                        kind: vscode.CompletionItemKind.Keyword,
                        documentation: 'Defines a new enumeration.',
                        body: 'enum ${1:Name} {\n\t${2:Variant1},\n\t${3:Variant2}$0\n}'
                    },
                    {
                        label: "len",
                        kind: vscode.CompletionItemKind.Snippet,
                        description: "Returns the length of a collection (array, slice, or list).",
                        body: "len(${1:collection})$0"
                    },
                    {
                        label: "copy",
                        kind: vscode.CompletionItemKind.Snippet,
                        description: "Copies a number of elements from a source to a destination.",
                        body: "copy(&${1:destination}, &${2:source}, ${3:count});$0"
                    },
                    {
                        label: "sizeof",
                        kind: vscode.CompletionItemKind.Snippet,
                        description: "Returns the size in bytes of a given type.",
                        body: "sizeof(${1:type})$0"
                    }
                ];

                for (const s of staticSnippets) {
                    const item = new vscode.CompletionItem(s.label, s.kind);
                    item.insertText = new vscode.SnippetString(s.body);
                    item.documentation = new vscode.MarkdownString(s.documentation);
                    completionItems.push(item);
                }

                // --- Dynamic Type Snippets ---
                for (const entry of symbolCache) {
                    const kind = entry.kind === 'type' ? vscode.CompletionItemKind.Struct : vscode.CompletionItemKind.Function;
                    const item = new vscode.CompletionItem(entry.name, kind);
                    
                    item.detail = `(${entry.kind}) ${entry.definition}`;
                    item.documentation = new vscode.MarkdownString(`Inserts a snippet for the ${entry.kind} \`${entry.name}\`.`);
                    
                    const snippet = new vscode.SnippetString();

                    // Jump to one of these chars
                    const priorityChars = [':', '[', '(', '{'];
                    let splitIndex = -1;

                    for (const char of priorityChars) {
                        const index = entry.definition.indexOf(char);
                        if (index !== -1) {
                            splitIndex = index + 1;
                            // Skip a space or closing bracket
                            if (splitIndex < entry.definition.length && [' ', ')', ']', '}'].includes(entry.definition[splitIndex])) {
                                splitIndex++;
                            }
                            break;
                        }
                    }

                    if (splitIndex !== -1) {
                        const part1 = entry.definition.substring(0, splitIndex);
                        const part2 = entry.definition.substring(splitIndex);
                        snippet.appendText(part1).appendTabstop(1).appendText(part2).appendTabstop(0);
                    } else {
                        snippet.appendTabstop(1).appendText(entry.definition).appendTabstop(0);
                    }

                    item.insertText = snippet;
                    completionItems.push(item);
                }
                
                return completionItems;
            }
        }
    );
    context.subscriptions.push(completionProvider);

    if (vscode.window.activeTextEditor) {
        updateDiagnostics(vscode.window.activeTextEditor.document);
    }
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(document => {
            if (document.languageId === 'ren') updateDiagnostics(document);
        })
    );
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(document => {
            if (document.languageId === 'ren') updateDiagnostics(document);
        })
    );
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(document => {
            diagnosticCollection.delete(document.uri);
        })
    );
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.languageId === 'ren' && event.contentChanges.length > 0) {
                updateCacheOnTextChange(event.contentChanges);
            }
        })
    );
}

function updateCacheOnTextChange(changes: readonly vscode.TextDocumentContentChangeEvent[]) {
    for (const change of changes) {
        // Calculate the net change in the number of lines
        const linesAdded = (change.text.match(/\n/g) || []).length;
        const linesRemoved = change.range.end.line - change.range.start.line;
        const lineDelta = linesAdded - linesRemoved;

        if (lineDelta === 0) {
            // If no lines were added or removed, no need to shift scopes.
            continue;
        }

        console.log("dirty");
        isCacheDirty = true;
        const changeStartLine = change.range.start.line + 1; // Convert to 1-based

        // Now, update every variable in our cache
        for (const variable of variableCache) {
            // Shift the start line if the change happened before it
            if (variable.scopeStartLine >= changeStartLine) {
                variable.scopeStartLine += lineDelta;
            }
            // Shift the end line if the change happened on or before it
            if (variable.scopeEndLine >= changeStartLine) {
                variable.scopeEndLine += lineDelta;
            }
        }
    }
}

function updateDiagnostics(document: vscode.TextDocument): void {
    if (runningCompiler) {
        runningCompiler.kill();
    }

    const config = vscode.workspace.getConfiguration('ren.compiler');
    const command = config.get<string>('path', 'renc'); 

    const args = [document.fileName, '--diagnostics'];
    
    try {
        runningCompiler = cp.spawn(command, args, { shell: true });
        if (!runningCompiler || !runningCompiler.stderr || !runningCompiler.stdout) {
            return;
        }

        let stdout = '';
        let stderr = '';
        
        runningCompiler.stdout.on('data', (data) => (stdout += data.toString()));
        runningCompiler.stderr.on('data', (data) => (stderr += data.toString()));

        runningCompiler.on('close', (code) => {
            runningCompiler = undefined;

            symbolCache = [];
            variableCache = [];
            if (stdout) {
                const lines = stdout.split(/[\r\n]+/).filter(line => line.trim() !== '');
                for (const line of lines) {
                    const kindParts = line.split('::');
                    if (kindParts.length < 2) continue;

                    const kind = kindParts[0];
                    const rest = kindParts[1];

                    if (kind === 'VAR') {
                        const varParts = rest.split(':');
                        if (varParts.length === 6) { // name:startLine:startCol:endLine:endCol:type
                            const [name, startLineStr, startColStr, endLineStr, endColStr, type] = varParts;
                            const scopeStartLine = parseInt(startLineStr, 10);
                            const scopeStartCol = parseInt(startColStr, 10);
                            const scopeEndLine = parseInt(endLineStr, 10);
                            const scopeEndCol = parseInt(endColStr, 10);

                            if (!isNaN(scopeStartLine) && !isNaN(scopeEndLine)) {
                                variableCache.push({ name, type, scopeStartLine, scopeStartCol, scopeEndLine, scopeEndCol });
                            }
                        }
                    } else if (kind === 'TYPE' || kind === 'FUNC') {
                        const separatorIndex = rest.indexOf(': ');
                        if (separatorIndex > 0) {
                            const name = rest.substring(0, separatorIndex).trim();
                            const definition = rest.substring(separatorIndex + 2).trim();
                            if (name && definition) {
                                symbolCache.push({ name, definition, kind: kind.toLowerCase() as SymbolKind });
                            }
                        }
                    }
                }
            }

            diagnosticCollection.set(document.uri, []);
            if (stderr) {
                console.log(stderr);
                const diagnostics = parseCompilerOutput(stderr, document);
                diagnosticCollection.set(document.uri, diagnostics);
            }
            isCacheDirty = false;
            console.log("clean");
        });

        runningCompiler.on('error', (err) => {
            runningCompiler = undefined;
            diagnosticCollection.clear();
            vscode.window.showErrorMessage(
                `Failed to run 'renc'. Ensure it's in your PATH or set 'ren.compiler.path'. Error: ${err.message}`
            );
        });

    } catch (error) {
        runningCompiler = undefined;
        vscode.window.showErrorMessage(`An unexpected error occurred while running 'renc': ${error instanceof Error ? error.message : String(error)}`);
    }
}

function parseCompilerOutput(stderr: string, document: vscode.TextDocument): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const regex = /^(.+?):(\d+):(\d+):(\d+):\s*(error|warning):\s*(.*)$/gm;
    
    let match;
    while ((match = regex.exec(stderr)) !== null) {
        const errorFilePath = path.normalize(match[1]);
        console.log(errorFilePath);
        console.log(document.fileName);

        // If the file path from the error doesn't match the currently open document, skip it.
        if (errorFilePath !== document.fileName) {
            console.log("skip");
            continue; 
        }
        const line = parseInt(match[2], 10) - 1;
        const column = parseInt(match[3], 10) - 2;
        const length = parseInt(match[4], 10);
        const level = match[5];
        const message = match[6].trim();

        if (line < 0 || column < 0) continue;
        
        const range = new vscode.Range(line, column, line, column + length);
        const severity = level === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
        const diagnostic = new vscode.Diagnostic(range, message, severity);
        diagnostic.source = 'renc';
        diagnostics.push(diagnostic);
    }
    return diagnostics;
}

export function deactivate() {
    if (timeout) clearTimeout(timeout);
    if (runningCompiler) runningCompiler.kill();
    if (diagnosticCollection) diagnosticCollection.dispose();
}
