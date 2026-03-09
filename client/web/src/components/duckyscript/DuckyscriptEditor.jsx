/**
 * components/duckyscript/DuckyscriptEditor.jsx
 * 
 * UI component for editing and managing duckyscript files
 */

import React, { useState, useContext, useRef, useEffect } from 'react';
import { Button, Typography, Spinner } from '@material-tailwind/react';
import {
    DocumentPlusIcon,
    DocumentArrowUpIcon,
    DocumentArrowDownIcon,
    TrashIcon,
    XMarkIcon,
    CheckIcon,
    ExclamationTriangleIcon,
    ArrowLeftIcon
} from '@heroicons/react/24/outline';
import { DuckyscriptContext } from '../../context/DuckyscriptContext';

const DuckyscriptEditor = ({ onScriptSelected }) => {
    const {
        scripts,
        currentScript,
        editingContent,
        isLoading,
        error,
        parseResult,
        isEditing,
        isUnlocked,
        createNewScript,
        openScript,
        updateContent,
        saveCurrentScript,
        deleteCurrentScript,
        importScript,
        exportScript,
        closeScript,
        getEstimatedTime,
    } = useContext(DuckyscriptContext);

    const [scriptName, setScriptName] = useState('');
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const fileInputRef = useRef(null);

    // Update name when script changes
    useEffect(() => {
        if (currentScript) {
            setScriptName(currentScript.name);
        }
    }, [currentScript]);

    const handleNewScript = () => {
        createNewScript();
        setScriptName('');
        setShowSaveDialog(false);
    };

    const handleImportFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        importScript(file).catch(err => {
            console.error('Import failed:', err);
        });

        // Reset input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleSave = async () => {
        if (!scriptName.trim()) {
            alert('Please enter a script name');
            return;
        }

        try {
            const saved = await saveCurrentScript(scriptName.trim());
            setShowSaveDialog(false);
            if (onScriptSelected) {
                onScriptSelected(saved);
            }
        } catch (err) {
            console.error('Save failed:', err);
        }
    };

    const handleDelete = async () => {
        try {
            await deleteCurrentScript();
            setShowDeleteConfirm(false);
        } catch (err) {
            console.error('Delete failed:', err);
        }
    };

    const handleExport = async () => {
        if (!currentScript) return;
        try {
            await exportScript(currentScript.id);
        } catch (err) {
            console.error('Export failed:', err);
        }
    };

    const handleSelectScript = async (script) => {
        // Load the full script content
        const loadedScript = await openScript(script.id);
        // Notify parent with the fully loaded script so it has content property
        if (onScriptSelected && loadedScript) {
            onScriptSelected(loadedScript);
        }
    };

    const estimatedTime = getEstimatedTime();
    const hasErrors = parseResult?.errors?.length > 0;

    return (
        <div className="flex flex-col gap-4 w-full h-full flex-1">
            {/* Editor Header */}
            <div className="flex items-center justify-between gap-2">
                <Typography type="h6" className="text-text font-header">
                    {isEditing ? 'Edit Script' : 'Duckyscript Manager'}
                </Typography>
                <div className="flex gap-2">
                    {isEditing && (
                        <>
                            <Button
                                size="md"
                                onClick={handleSave}
                                disabled={isLoading || !editingContent.trim() || !scriptName.trim() || !isUnlocked}
                                className="bg-primary text-text hover:bg-primary-ash px-3 py-1 disabled:bg-ash border-none flex items-center gap-2"
                            >
                                <CheckIcon className="h-5 w-5" />
                                <Typography type="small" className="font-semibold">
                                    {currentScript?.id ? 'Update' : 'Save'}
                                </Typography>
                            </Button>

                            <Button
                                size="sm"
                                onClick={() => setShowDeleteConfirm(true)}
                                disabled={isLoading || !currentScript || !isUnlocked}
                                className="bg-secondary border-secondary text-text p-2 disabled:bg-ash "
                            >
                                <TrashIcon className="h-5 w-5" />
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleExport}
                                disabled={isLoading || !currentScript || !isUnlocked}
                                className="bg-ink border-dust text-text hover:bg-dust p-2 disabled:bg-ash "
                            >
                                <DocumentArrowDownIcon className="h-5 w-5" />
                            </Button>
                            <Button
                                size="sm"
                                onClick={closeScript}
                                disabled={isLoading || !isUnlocked}
                                className="bg-ash text-text hover:bg-dust p-2 disabled:bg-secondary/50 border-dust"
                            >
                                <ArrowLeftIcon className="h-5 w-5" />
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Script Editor or List */}
            {isEditing ? (
                <div className="flex flex-col gap-4 flex-1 min-h-0">
                    {/* Name Input */}
                    <input
                        type="text"
                        value={scriptName}
                        onChange={(e) => setScriptName(e.target.value)}
                        placeholder="Script name"
                        className="w-full h-10 bg-ink border-2 border-ash focus:border-primary outline-none text-text px-3 rounded"
                    />

                    {/* Code Editor Container */}
                    <div className="flex flex-col flex-1 min-h-0 border-2 border-ash rounded bg-ink">
                        {/* Code Editor */}
                        <textarea
                            value={editingContent}
                            onChange={(e) => updateContent(e.target.value)}
                            placeholder="Enter duckyscript code..."
                            className="w-full flex-1 bg-ink outline-none text-text p-3 rounded-t font-mono text-sm resize-none focus:border-primary"
                        />

                        {/* Parse Result Display - Status Bar */}
                        <div className="bg-ash border-t border-ash rounded-b p-2 px-4 flex items-center gap-2 text-xs">


                            {/* Middle - Stats (grows to fill space) */}
                            <div className="flex gap-3 text-dust flex-1">
                                <span>Lines: {editingContent.split('\n').length}</span>
                                <span>Commands: {parseResult?.ast?.length || 0}</span>
                                <span>Est. Time: {Math.round(estimatedTime)}ms</span>
                            </div>

                            {/* Right side - Error message (pinned to right) */}
                            {parseResult?.errors?.length > 0 && (
                                <Typography type="small" className="text-dust flex-shrink-0">
                                    {parseResult.errors[0].message}
                                </Typography>
                            )}

                            {/* Left side - Status */}
                            <div className="flex items-center gap-2">
                                {hasErrors ? (
                                    <>
                                        <ExclamationTriangleIcon className="h-4 w-4 text-orange flex-shrink-0" />
                                        <Typography type="small" className="text-orange font-semibold">
                                            {parseResult.errors.length} error{parseResult.errors.length !== 1 ? 's' : ''}
                                        </Typography>
                                    </>
                                ) : (
                                    <>
                                        <CheckIcon className="h-4 w-4 text-primary flex-shrink-0" />
                                        <Typography type="small" className="text-primary font-semibold">
                                            Valid
                                        </Typography>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Delete Confirmation */}
                    {showDeleteConfirm && currentScript && (
                        <div className="bg-orange/20 border border-orange rounded p-3 flex flex-col gap-2">
                            <Typography type="small" className="text-orange font-semibold">
                                Delete "{currentScript.name}"?
                            </Typography>
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="flex-1 bg-ash text-text"
                                >
                                    <Typography type="small">Cancel</Typography>
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleDelete}
                                    disabled={isLoading}
                                    className="flex-1 bg-secondary text-text"
                                >
                                    <Typography type="small">Delete</Typography>
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-auto">
                    {/* Action Buttons */}
                    <div className="flex gap-2">
                        <Button
                            onClick={handleNewScript}
                            disabled={isLoading || !isUnlocked}
                            className="flex-1 bg-primary border-none text-text hover:bg-primary-ash py-2 disabled:bg-ash"
                        >
                            <DocumentPlusIcon className="h-5 w-5 mr-2 border-none" />
                            <Typography type="small" className="font-semibold">New Script</Typography>
                        </Button>
                        <Button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isLoading || !isUnlocked}
                            className="flex-1 bg-orange border-none text-text hover:bg-orange py-2 disabled:bg-ash"
                        >
                            <DocumentArrowUpIcon className="h-5 w-5 mr-2 " />
                            <Typography type="small" className="font-semibold">Import From .txt File</Typography>
                        </Button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".txt"
                            onChange={handleImportFile}
                            className="hidden"
                        />
                    </div>

                    {/* Scripts List */}
                    {scripts.length > 0 ? (
                        <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto">
                            {scripts.map(script => (
                                <button
                                    key={script.id}
                                    onClick={() => handleSelectScript(script)}
                                    disabled={isLoading || !isUnlocked}
                                    className="bg-ink border-2 border-ash hover:border-primary text-left p-3 rounded transition flex flex-col gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Typography type="small" className="text-text font-semibold">
                                        {script.name}
                                    </Typography>
                                    <Typography type="small" className="text-dust text-xs">
                                        {script.lineCount} lines • {script.hasErrors ? '❌ Errors' : '✓ Valid'} • {Math.round(script.estimatedTime)}ms
                                    </Typography>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <Typography type="small" className="text-dust">
                                No scripts yet. Create a new one or import a file.
                            </Typography>
                        </div>
                    )}
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="bg-red-500/20 border border-red-500 rounded p-3">
                    <Typography type="small" className="text-red-500">
                        {error}
                    </Typography>
                </div>
            )}

            {/* Loading Spinner */}
            {isLoading && (
                <div className="flex items-center justify-center py-4">
                    <Spinner className="h-6 w-6" />
                </div>
            )}
        </div>
    );
};

export default DuckyscriptEditor;
