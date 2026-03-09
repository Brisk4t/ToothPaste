/**
 * duckyscript/DuckyscriptService.js
 * 
 * Service for managing duckyscript files with encrypted storage
 * Handles loading, saving, parsing, and validation
 */

import * as EncryptedStorage from '../localSecurity/EncryptedStorage';
import { parseDuckyscript, estimateExecutionTime } from './DuckyscriptParser';

const DUCKYSCRIPT_CLIENT_ID = 'duckyscript-scripts';
const SCRIPTS_INDEX_KEY = 'scripts-index';

/**
 * Script metadata stored in encrypted storage
 * @typedef {Object} ScriptMetadata
 * @property {string} id - Unique script identifier
 * @property {string} name - Human-readable script name
 * @property {string} content - Raw duckyscript content
 * @property {number} createdAt - Timestamp
 * @property {number} updatedAt - Timestamp
 * @property {Array} ast - Parsed AST
 * @property {Array} errors - Parse errors
 * @property {number} estimatedTime - Execution time estimate in ms
 */

/**
 * List all saved duckyscripts
 * @returns {Promise<Array>} - Array of script metadata
 */
export async function listScripts() {
    try {
        if (!EncryptedStorage.isUnlocked()) {
            return [];
        }
        
        const index = await EncryptedStorage.loadBase64(DUCKYSCRIPT_CLIENT_ID, SCRIPTS_INDEX_KEY);
        return index || [];
    } catch (error) {
        console.error('[DuckyscriptService] Error listing scripts:', error);
        return [];
    }
}

/**
 * Load a specific script by ID
 * @param {string} scriptId - Script identifier
 * @returns {Promise<ScriptMetadata|null>}
 */
export async function loadScript(scriptId) {
    try {
        if (!EncryptedStorage.isUnlocked()) {
            throw new Error('Storage not unlocked');
        }
        
        const script = await EncryptedStorage.loadBase64(DUCKYSCRIPT_CLIENT_ID, scriptId);
        return script || null;
    } catch (error) {
        console.error('[DuckyscriptService] Error loading script:', error);
        throw error;
    }
}

/**
 * Save or update a duckyscript
 * @param {string} name - Script name
 * @param {string} content - Raw duckyscript content
 * @param {string|null} scriptId - Existing script ID (null for new)
 * @returns {Promise<ScriptMetadata>}
 */
export async function saveScript(name, content, scriptId = null) {
    try {
        if (!EncryptedStorage.isUnlocked()) {
            throw new Error('Storage not unlocked');
        }
        
        // Parse and validate
        const parseResult = parseDuckyscript(content);
        
        const now = Date.now();
        const id = scriptId || `script-${now}-${Math.random().toString(36).substr(2, 9)}`;
        
        const scriptData = {
            id,
            name,
            content,
            createdAt: scriptId ? (await loadScript(scriptId))?.createdAt : now,
            updatedAt: now,
            ast: parseResult.ast,
            errors: parseResult.errors,
            estimatedTime: estimateExecutionTime(parseResult.ast),
        };
        
        // Save script
        await EncryptedStorage.saveBase64(DUCKYSCRIPT_CLIENT_ID, id, scriptData);
        
        // Update index
        await updateScriptsIndex(id, scriptData);
        
        console.log('[DuckyscriptService] Script saved:', id);
        return scriptData;
    } catch (error) {
        console.error('[DuckyscriptService] Error saving script:', error);
        throw error;
    }
}

/**
 * Delete a script (removes both data and index)
 * @param {string} scriptId - Script identifier
 * @returns {Promise<void>}
 */
export async function deleteScript(scriptId) {
    try {
        if (!EncryptedStorage.isUnlocked()) {
            throw new Error('Storage not unlocked');
        }
        
        // Delete the actual script data
        await EncryptedStorage.deleteBase64(DUCKYSCRIPT_CLIENT_ID, scriptId);
        
        // Remove from index
        const index = await listScripts();
        const updatedIndex = index.filter(script => script.id !== scriptId);
        await EncryptedStorage.saveBase64(DUCKYSCRIPT_CLIENT_ID, SCRIPTS_INDEX_KEY, updatedIndex);
        
        console.log('[DuckyscriptService] Script deleted:', scriptId);
    } catch (error) {
        console.error('[DuckyscriptService] Error deleting script:', error);
        throw error;
    }
}

/**
 * Update the scripts index with new metadata
 * @private
 * @param {string} scriptId
 * @param {ScriptMetadata} scriptData
 */
async function updateScriptsIndex(scriptId, scriptData) {
    try {
        const index = await listScripts();
        
        // Remove old entry if exists
        const filteredIndex = index.filter(script => script.id !== scriptId);
        
        // Add new entry with summary
        const summary = {
            id: scriptData.id,
            name: scriptData.name,
            createdAt: scriptData.createdAt,
            updatedAt: scriptData.updatedAt,
            estimatedTime: scriptData.estimatedTime,
            lineCount: scriptData.content.split('\n').length,
            hasErrors: scriptData.errors.length > 0,
        };
        
        filteredIndex.push(summary);
        
        // Save updated index
        await EncryptedStorage.saveBase64(DUCKYSCRIPT_CLIENT_ID, SCRIPTS_INDEX_KEY, filteredIndex);
    } catch (error) {
        console.error('[DuckyscriptService] Error updating script index:', error);
    }
}

/**
 * Import a duckyscript file (from file upload)
 * @param {File} file - File object from file input
 * @returns {Promise<ScriptMetadata>}
 */
export async function importScriptFile(file) {
    return new Promise((resolve, reject) => {
        if (!file.type || !file.type.includes('text')) {
            reject(new Error('File must be a text file'));
            return;
        }
        
        if (file.size > 1024 * 1024) { // 1MB limit
            reject(new Error('File size exceeds 1MB limit'));
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = async (event) => {
            try {
                const content = event.target.result;
                const fileName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
                const script = await saveScript(fileName, content);
                resolve(script);
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = () => {
            reject(new Error('Failed to read file'));
        };
        
        reader.readAsText(file);
    });
}

/**
 * Export a script as a downloadable file
 * @param {string} scriptId - Script identifier
 * @returns {Promise<void>}
 */
export async function exportScriptFile(scriptId) {
    try {
        const script = await loadScript(scriptId);
        if (!script) {
            throw new Error('Script not found');
        }
        
        // Create blob and trigger download
        const blob = new Blob([script.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${script.name}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('[DuckyscriptService] Script exported:', scriptId);
    } catch (error) {
        console.error('[DuckyscriptService] Error exporting script:', error);
        throw error;
    }
}

/**
 * Clear all scripts (dangerous operation - deletes all script data and index)
 * @returns {Promise<void>}
 */
export async function clearAllScripts() {
    try {
        if (!EncryptedStorage.isUnlocked()) {
            throw new Error('Storage not unlocked');
        }
        
        const scripts = await listScripts();
        
        // Delete each script's data individually
        for (const script of scripts) {
            await EncryptedStorage.deleteBase64(DUCKYSCRIPT_CLIENT_ID, script.id);
        }
        
        // Delete the index itself
        await EncryptedStorage.deleteBase64(DUCKYSCRIPT_CLIENT_ID, SCRIPTS_INDEX_KEY);
        
        console.log('[DuckyscriptService] All scripts cleared');
    } catch (error) {
        console.error('[DuckyscriptService] Error clearing scripts:', error);
        throw error;
    }
}
