/**
 * context/DuckyscriptContext.tsx
 *
 * Context for managing duckyscript state and operations
 * Similar to BLEContext and ECDHContext
 */

import { createContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import * as DuckyscriptService from '../services/duckyscript/DuckyscriptService';
import type { ScriptMetadata, ScriptSummary } from '../services/duckyscript/DuckyscriptService';
import * as EncryptedStorage from '../services/localSecurity/EncryptedStorage';
import { parseDuckyscript, estimateExecutionTime } from '../services/duckyscript/DuckyscriptParser';
import type { ParseResult } from '../services/duckyscript/DuckyscriptParser';

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export interface DuckyscriptContextValue {
    // State
    scripts: ScriptSummary[];
    currentScript: ScriptMetadata | null;
    isLoading: boolean;
    error: string | null;
    editingContent: string;
    parseResult: ParseResult | null;
    isUnlocked: boolean;
    isEditing: boolean;

    // Methods
    loadScripts: () => Promise<void>;
    openScript: (scriptId: string) => Promise<ScriptMetadata | null>;
    createNewScript: () => void;
    updateContent: (content: string) => void;
    saveCurrentScript: (name: string) => Promise<ScriptMetadata>;
    deleteCurrentScript: () => Promise<void>;
    importScript: (file: File) => Promise<ScriptMetadata>;
    exportScript: (scriptId: string) => Promise<void>;
    closeScript: () => void;
    getEstimatedTime: () => number;
}

export const DuckyscriptContext = createContext<DuckyscriptContextValue | null>(null);

export const DuckyscriptProvider = ({ children }: { children: ReactNode }) => {
    // State
    const [scripts, setScripts] = useState<ScriptSummary[]>([]);
    const [currentScript, setCurrentScript] = useState<ScriptMetadata | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingContent, setEditingContent] = useState('');
    const [parseResult, setParseResult] = useState<ParseResult | null>(null);
    const [isUnlocked, setIsUnlocked] = useState(EncryptedStorage.isUnlocked());
    const [isEditing, setIsEditing] = useState(false);

    // Load scripts on mount and when auth state changes
    useEffect(() => {
        loadScripts();
        setIsUnlocked(EncryptedStorage.isUnlocked());
    }, []);

    // Subscribe to auth state changes (simplified - check periodically)
    useEffect(() => {
        const checkAuthInterval = setInterval(() => {
            const nowUnlocked = EncryptedStorage.isUnlocked();
            if (nowUnlocked !== isUnlocked) {
                setIsUnlocked(nowUnlocked);
                if (nowUnlocked) {
                    // Just unlocked - reload scripts
                    loadScripts();
                }
            }
        }, 500); // Check every 500ms

        return () => clearInterval(checkAuthInterval);
    }, [isUnlocked]);

    /**
     * Load all scripts from storage
     */
    const loadScripts = useCallback(async () => {
        try {
            setIsLoading(true);
            const scriptsList = await DuckyscriptService.listScripts();
            setScripts(scriptsList);
            setError(null);
        } catch (err) {
            console.error('[DuckyscriptContext] Error loading scripts:', err);
            setError(getErrorMessage(err));
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Open a script for editing
     */
    const openScript = useCallback(async (scriptId: string) => {
        try {
            setIsLoading(true);
            const script = await DuckyscriptService.loadScript(scriptId);
            setCurrentScript(script);
            setEditingContent(script!.content);
            setParseResult(parseDuckyscript(script!.content));
            setIsEditing(true);
            setError(null);
            return script;
        } catch (err) {
            console.error('[DuckyscriptContext] Error opening script:', err);
            setError(getErrorMessage(err));
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Create a new script
     */
    const createNewScript = useCallback(() => {
        setCurrentScript(null);
        setEditingContent('');
        setParseResult({ tokens: [], ast: [], errors: [], isValid: true });
        setIsEditing(true);
        setError(null);
    }, []);

    /**
     * Update editing content and parse
     */
    const updateContent = useCallback((content: string) => {
        setEditingContent(content);
        const result = parseDuckyscript(content);
        setParseResult(result);
    }, []);

    /**
     * Save the current script
     */
    const saveCurrentScript = useCallback(async (name: string) => {
        try {
            setIsLoading(true);
            const scriptId = currentScript?.id || null;
            const saved = await DuckyscriptService.saveScript(name, editingContent, scriptId);

            setCurrentScript(saved);
            await loadScripts();
            setError(null);

            return saved;
        } catch (err) {
            console.error('[DuckyscriptContext] Error saving script:', err);
            setError(getErrorMessage(err));
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [currentScript, editingContent, loadScripts]);

    /**
     * Delete a script
     */
    const deleteCurrentScript = useCallback(async () => {
        try {
            if (!currentScript) return;

            setIsLoading(true);
            await DuckyscriptService.deleteScript(currentScript.id);
            setCurrentScript(null);
            setEditingContent('');
            await loadScripts();
            setError(null);
        } catch (err) {
            console.error('[DuckyscriptContext] Error deleting script:', err);
            setError(getErrorMessage(err));
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [currentScript, loadScripts]);

    /**
     * Import a script file
     */
    const importScript = useCallback(async (file: File) => {
        try {
            setIsLoading(true);
            const imported = await DuckyscriptService.importScriptFile(file);
            await loadScripts();
            setError(null);
            return imported;
        } catch (err) {
            console.error('[DuckyscriptContext] Error importing script:', err);
            setError(getErrorMessage(err));
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [loadScripts]);

    /**
     * Export current script as file
     */
    const exportScript = useCallback(async (scriptId: string) => {
        try {
            setIsLoading(true);
            await DuckyscriptService.exportScriptFile(scriptId);
            setError(null);
        } catch (err) {
            console.error('[DuckyscriptContext] Error exporting script:', err);
            setError(getErrorMessage(err));
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Close the current script editor
     */
    const closeScript = useCallback(() => {
        setCurrentScript(null);
        setEditingContent('');
        setParseResult(null);
        setIsEditing(false);
        setError(null);
    }, []);

    /**
     * Get execution time estimate for current script
     */
    const getEstimatedTime = useCallback(() => {
        if (!parseResult?.ast) return 0;
        return estimateExecutionTime(parseResult.ast);
    }, [parseResult]);

    // Context value
    const value: DuckyscriptContextValue = {
        // State
        scripts,
        currentScript,
        isLoading,
        error,
        editingContent,
        parseResult,
        isUnlocked,
        isEditing,

        // Methods
        loadScripts,
        openScript,
        createNewScript,
        updateContent,
        saveCurrentScript,
        deleteCurrentScript,
        importScript,
        exportScript,
        closeScript,
        getEstimatedTime,
    };

    return (
        <DuckyscriptContext.Provider value={value}>
            {children}
        </DuckyscriptContext.Provider>
    );
};
