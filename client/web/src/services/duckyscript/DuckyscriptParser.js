/**
 * DuckyscriptParser.js
 * 
 * Parses and validates Duckyscript syntax
 * Supports: DELAY, STRING, comments, basic commands
 */

/**
 * Token types for duckyscript
 */
export const TokenType = {
    COMMAND: 'COMMAND',
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    COMMENT: 'COMMENT',
    NEWLINE: 'NEWLINE',
    EOF: 'EOF',
    UNKNOWN: 'UNKNOWN',
};

/**
 * Valid duckyscript commands
 */
export const ValidCommands = {
    // Delay commands
    DELAY: 'DELAY',
    DEFAULT_DELAY: 'DEFAULT_DELAY',
    
    // String/text commands
    STRING: 'STRING',
    
    // Key commands
    PRESS: 'PRESS',
    RELEASE: 'RELEASE',
    TAP: 'TAP',
    HOLD: 'HOLD',
    
    // Special commands
    REM: 'REM',
    EXTENSION: 'EXTENSION',
    REPEAT: 'REPEAT',
    WINDOWS: 'WINDOWS',
    LINUX: 'LINUX',
    MAC: 'MAC',
};

/**
 * Parse duckyscript content into tokens and AST
 * @param {string} content - Raw duckyscript content
 * @returns {Object} - { tokens, ast, errors }
 */
export function parseDuckyscript(content) {
    const tokens = tokenize(content);
    const { ast, parseErrors } = parseTokens(tokens);
    
    return {
        tokens,
        ast,
        errors: parseErrors,
        isValid: parseErrors.length === 0,
    };
}

/**
 * Tokenize duckyscript content
 * @param {string} content
 * @returns {Array} - Array of tokens
 */
function tokenize(content) {
    const tokens = [];
    const lines = content.split('\n');
    
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        const trimmed = line.trim();
        
        // Skip empty lines
        if (!trimmed) {
            tokens.push({
                type: TokenType.NEWLINE,
                value: '',
                line: lineNum + 1,
                column: 0,
            });
            continue;
        }
        
        // Handle comments
        if (trimmed.startsWith('//') || trimmed.startsWith('REM ')) {
            tokens.push({
                type: TokenType.COMMENT,
                value: trimmed,
                line: lineNum + 1,
                column: 0,
            });
            tokens.push({
                type: TokenType.NEWLINE,
                value: '',
                line: lineNum + 1,
                column: trimmed.length,
            });
            continue;
        }
        
        // Tokenize line
        let column = 0;
        let i = 0;
        
        while (i < line.length) {
            const char = line[i];
            
            // Skip whitespace
            if (/\s/.test(char)) {
                i++;
                column++;
                continue;
            }
            
            // Number (must check before word, since word regex includes digits)
            if (/\d/.test(char)) {
                let numValue = '';
                const numStart = i;
                
                while (i < line.length && /[\d.]/.test(line[i])) {
                    numValue += line[i];
                    i++;
                }
                
                tokens.push({
                    type: TokenType.NUMBER,
                    value: parseFloat(numValue),
                    rawValue: numValue,
                    line: lineNum + 1,
                    column: numStart,
                });
                column = i;
                continue;
            }
            
            // String (quoted)
            if (char === '"' || char === "'") {
                const quote = char;
                let stringValue = '';
                i++;
                let escaped = false;
                
                while (i < line.length) {
                    const c = line[i];
                    
                    if (escaped) {
                        // Handle escape sequences
                        switch (c) {
                            case 'n': stringValue += '\n'; break;
                            case 't': stringValue += '\t'; break;
                            case 'r': stringValue += '\r'; break;
                            case '\\': stringValue += '\\'; break;
                            case quote: stringValue += quote; break;
                            default: stringValue += c;
                        }
                        escaped = false;
                    } else if (c === '\\') {
                        escaped = true;
                    } else if (c === quote) {
                        i++;
                        break;
                    } else {
                        stringValue += c;
                    }
                    i++;
                }
                
                tokens.push({
                    type: TokenType.STRING,
                    value: stringValue,
                    rawValue: '"' + stringValue + '"',
                    line: lineNum + 1,
                    column,
                });
                column = i;
                continue;
            }
            
            // Word (command or identifier) - must start with letter or underscore
            let word = '';
            const wordStart = i;
            
            if (/[a-zA-Z_]/.test(char)) {
                while (i < line.length && /[a-zA-Z0-9_]/.test(line[i])) {
                    word += line[i];
                    i++;
                }
            }
            
            if (word) {
                const upperWord = word.toUpperCase();
                
                // Check if it's a command
                if (ValidCommands[upperWord]) {
                    tokens.push({
                        type: TokenType.COMMAND,
                        value: upperWord,
                        line: lineNum + 1,
                        column: wordStart,
                    });
                } else {
                    // Could be a parameter or unknown
                    tokens.push({
                        type: TokenType.UNKNOWN,
                        value: word,
                        line: lineNum + 1,
                        column: wordStart,
                    });
                }
                column = i;
                continue;
            }
            
            // Unknown character
            i++;
            column++;
        }
        
        tokens.push({
            type: TokenType.NEWLINE,
            value: '',
            line: lineNum + 1,
            column,
        });
    }
    
    tokens.push({
        type: TokenType.EOF,
        value: '',
        line: lines.length + 1,
        column: 0,
    });
    
    return tokens;
}

/**
 * Parse tokens into AST
 * @param {Array} tokens
 * @returns {Object} - { ast, parseErrors }
 */
function parseTokens(tokens) {
    const ast = [];
    const parseErrors = [];
    let i = 0;
    
    while (i < tokens.length) {
        const token = tokens[i];
        
        if (token.type === TokenType.COMMENT || token.type === TokenType.NEWLINE) {
            i++;
            continue;
        }
        
        if (token.type === TokenType.EOF) {
            break;
        }
        
        if (token.type === TokenType.COMMAND) {
            const command = token.value;
            const node = { type: 'Command', command, args: [], line: token.line };
            i++;
            
            // Collect arguments until newline
            while (i < tokens.length && tokens[i].type !== TokenType.NEWLINE && tokens[i].type !== TokenType.EOF) {
                const argToken = tokens[i];
                
                if (argToken.type === TokenType.COMMENT) {
                    break;
                }
                
                if (argToken.type === TokenType.STRING) {
                    node.args.push({ type: 'String', value: argToken.value });
                } else if (argToken.type === TokenType.NUMBER) {
                    node.args.push({ type: 'Number', value: argToken.value });
                } else if (argToken.type === TokenType.UNKNOWN) {
                    node.args.push({ type: 'Identifier', value: argToken.value });
                }
                
                i++;
            }
            
            // Validate command arguments
            const validation = validateCommand(command, node.args);
            if (validation.error) {
                parseErrors.push({
                    line: token.line,
                    message: validation.error,
                    command,
                });
            }
            
            ast.push(node);
        } else {
            parseErrors.push({
                line: token.line,
                message: `Unexpected token: ${token.value}`,
            });
            i++;
        }
    }
    
    return { ast, parseErrors };
}

/**
 * Validate a command and its arguments
 * @param {string} command
 * @param {Array} args
 * @returns {Object} - { error: string|null }
 */
function validateCommand(command, args) {
    switch (command) {
        case ValidCommands.DELAY:
        case ValidCommands.DEFAULT_DELAY:
            if (args.length === 0) {
                return { error: `${command} requires a number argument` };
            }
            if (args[0].type !== 'Number') {
                return { error: `${command} argument must be a number` };
            }
            if (args[0].value < 0) {
                return { error: `${command} value cannot be negative` };
            }
            break;
            
        case ValidCommands.STRING:
            if (args.length === 0) {
                return { error: 'STRING requires an argument' };
            }
            break;
            
        case ValidCommands.REPEAT:
            if (args.length === 0) {
                return { error: 'REPEAT requires a count argument' };
            }
            if (args[0].type !== 'Number') {
                return { error: 'REPEAT argument must be a number' };
            }
            break;
    }
    
    return { error: null };
}

/**
 * Get human-readable description of parsed duckyscript
 * @param {Array} ast
 * @returns {string}
 */
export function getScriptDescription(ast) {
    const descriptions = ast.map(node => {
        if (node.type === 'Command') {
            const argStr = node.args.map(arg => 
                arg.type === 'String' ? `"${arg.value}"` : arg.value
            ).join(' ');
            
            return `${node.command}${argStr ? ' ' + argStr : ''}`;
        }
        return '';
    }).filter(desc => desc);
    
    return descriptions.join('\n');
}

/**
 * Estimate execution time of duckyscript
 * @param {Array} ast
 * @returns {number} - Time in milliseconds
 */
export function estimateExecutionTime(ast) {
    let totalTime = 0;
    let defaultDelay = 50; // Default delay in ms
    
    for (const node of ast) {
        if (node.type === 'Command') {
            switch (node.command) {
                case ValidCommands.DELAY:
                    totalTime += node.args[0]?.value || 0;
                    break;
                case ValidCommands.DEFAULT_DELAY:
                    defaultDelay = node.args[0]?.value || 50;
                    break;
                case ValidCommands.STRING:
                    // Each character has default delay
                    const stringLength = node.args[0]?.value?.length || 0;
                    totalTime += stringLength * defaultDelay;
                    break;
                default:
                    // Most other commands have default delay
                    totalTime += defaultDelay;
            }
        }
    }
    
    return totalTime;
}

/**
 * Execute duckyscript AST with a callback for sending keystrokes
 * @param {Array} ast - Parsed AST
 * @param {Function} sendString - Callback to send string text
 * @param {Function} delay - Callback to delay execution
 * @returns {Promise<void>}
 */
export async function executeDuckyscript(ast, sendString, delay) {
    let defaultDelay = 50; // Default delay in ms between keystrokes
    
    for (const node of ast) {
        if (node.type !== 'Command') continue;
        
        switch (node.command) {
            case ValidCommands.STRING:
                // Send string character by character
                const text = node.args[0]?.value || '';
                await sendString(text);
                break;
                
            case ValidCommands.DELAY:
                // Explicit delay
                const delayMs = node.args[0]?.value || 0;
                if (delayMs > 0) {
                    await delay(delayMs);
                }
                break;
                
            case ValidCommands.DEFAULT_DELAY:
                // Set default inter-keystroke delay
                defaultDelay = node.args[0]?.value || 50;
                break;
                
            case ValidCommands.PRESS:
            case ValidCommands.RELEASE:
            case ValidCommands.TAP:
            case ValidCommands.HOLD:
                // These would require key mapping on the device
                // For now, just add default delay
                await delay(defaultDelay);
                break;
                
            case ValidCommands.REPEAT:
                // Repeat is a structural command, handle in higher-level code if needed
                break;
                
            default:
                // Skip unknown commands
                break;
        }
    }
}
