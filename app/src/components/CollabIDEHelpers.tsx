import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Search, MessageCircle, Bell } from 'lucide-react';

// ===== Toast System =====
export interface Toast { id: string; message: string; type: 'info' | 'success' | 'error'; }

export function useToasts() {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
        const id = Date.now().toString();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
    }, []);
    return { toasts, addToast };
}

export function ToastContainer({ toasts }: { toasts: Toast[] }) {
    if (toasts.length === 0) return null;
    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
            {toasts.map(t => (
                <div key={t.id} className={`px-3 py-2 rounded-lg text-xs font-medium shadow-lg animate-slide-in ${t.type === 'success' ? 'bg-green-600 text-white' : t.type === 'error' ? 'bg-red-600 text-white' : 'bg-[#2d2f3f] text-gray-200 border border-gray-700'
                    }`}>
                    {t.message}
                </div>
            ))}
        </div>
    );
}

// ===== Search Across Files Panel =====
interface SearchResult { path: string; line: number; content: string; matchStart: number; matchEnd: number; }

export function SearchPanel({ files, onOpenFile, onClose, onReplace }: {
    files: Record<string, string>;
    onOpenFile: (path: string) => void;
    onClose: () => void;
    onReplace: (path: string, oldText: string, newText: string) => void;
}) {
    const [query, setQuery] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [showReplace, setShowReplace] = useState(false);
    const [useRegex, setUseRegex] = useState(false);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const results: SearchResult[] = [];
    if (query.length >= 2) {
        const flags = caseSensitive ? 'g' : 'gi';
        for (const [path, content] of Object.entries(files)) {
            const lines = content.split('\n');
            lines.forEach((line, idx) => {
                try {
                    const pattern = useRegex ? new RegExp(query, flags) : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
                    const match = pattern.exec(line);
                    if (match) results.push({ path, line: idx + 1, content: line.trim(), matchStart: match.index, matchEnd: match.index + match[0].length });
                } catch { /* invalid regex */ }
            });
        }
    }

    return (
        <div className="h-full flex flex-col bg-[#0d1117] border-r border-gray-800" style={{ width: 300 }}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Search</span>
                <div className="flex gap-1">
                    <button onClick={() => setShowReplace(!showReplace)} className={`text-[10px] px-1.5 py-0.5 rounded ${showReplace ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-white'}`}>Replace</button>
                    <button onClick={onClose} className="p-0.5 text-gray-500 hover:text-white"><X className="w-3 h-3" /></button>
                </div>
            </div>
            <div className="px-2 py-1.5 space-y-1.5 border-b border-gray-800">
                <div className="flex gap-1">
                    <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search..."
                        className="flex-1 bg-[#1e2030] border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500" />
                    <button onClick={() => setCaseSensitive(!caseSensitive)} className={`px-1.5 text-[10px] rounded ${caseSensitive ? 'bg-blue-600 text-white' : 'text-gray-500 border border-gray-700'}`} title="Case sensitive">Aa</button>
                    <button onClick={() => setUseRegex(!useRegex)} className={`px-1.5 text-[10px] rounded ${useRegex ? 'bg-blue-600 text-white' : 'text-gray-500 border border-gray-700'}`} title="Regex">.*</button>
                </div>
                {showReplace && (
                    <input value={replaceText} onChange={e => setReplaceText(e.target.value)} placeholder="Replace with..."
                        className="w-full bg-[#1e2030] border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500" />
                )}
            </div>
            <div className="flex-1 overflow-y-auto">
                {query.length < 2 && <p className="text-xs text-gray-600 p-3 text-center">Type at least 2 characters</p>}
                {query.length >= 2 && results.length === 0 && <p className="text-xs text-gray-600 p-3 text-center">No results found</p>}
                {results.slice(0, 100).map((r, i) => (
                    <button key={i} onClick={() => onOpenFile(r.path)}
                        className="w-full text-left px-3 py-1.5 hover:bg-[#1e2030] transition-colors border-b border-gray-800/50">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-blue-400 truncate">{r.path}</span>
                            <span className="text-[10px] text-gray-600">:{r.line}</span>
                            {showReplace && (
                                <button onClick={(e) => { e.stopPropagation(); onReplace(r.path, query, replaceText); }}
                                    className="ml-auto text-[9px] text-yellow-500 hover:text-yellow-300 px-1">Replace</button>
                            )}
                        </div>
                        <p className="text-[11px] text-gray-400 truncate font-mono mt-0.5">{r.content}</p>
                    </button>
                ))}
                {results.length > 0 && <p className="text-[10px] text-gray-600 p-2 text-center">{results.length} result{results.length !== 1 ? 's' : ''}</p>}
            </div>
        </div>
    );
}

// ===== Breadcrumb =====
export function Breadcrumb({ path, onNavigate }: { path: string; onNavigate: (dir: string) => void }) {
    const parts = path.split('/');
    return (
        <div className="flex items-center gap-0.5 px-3 py-1 bg-[#161b22] border-b border-gray-800 text-[11px] overflow-x-auto flex-shrink-0">
            {parts.map((part, i) => {
                const fullPath = parts.slice(0, i + 1).join('/');
                const isLast = i === parts.length - 1;
                return (
                    <span key={i} className="flex items-center gap-0.5 whitespace-nowrap">
                        {i > 0 && <span className="text-gray-600 mx-0.5">›</span>}
                        <button onClick={() => !isLast && onNavigate(fullPath)}
                            className={`hover:text-blue-400 transition-colors ${isLast ? 'text-white font-medium' : 'text-gray-500'}`}>
                            {part}
                        </button>
                    </span>
                );
            })}
        </div>
    );
}

// ===== Recent Files Dropdown =====
export function RecentFiles({ recentFiles, onOpenFile, onClose }: {
    recentFiles: string[];
    onOpenFile: (path: string) => void;
    onClose: () => void;
}) {
    if (recentFiles.length === 0) return null;
    return (
        <div className="absolute top-full left-0 mt-1 z-50 bg-[#1e2030] border border-gray-700 rounded-lg shadow-xl w-64 py-1">
            <div className="flex items-center justify-between px-3 py-1 border-b border-gray-700">
                <span className="text-[10px] text-gray-500 uppercase font-semibold">Recent Files</span>
                <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-3 h-3" /></button>
            </div>
            {recentFiles.map(path => (
                <button key={path} onClick={() => { onOpenFile(path); onClose(); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-[#2d2f3f] transition-colors text-left">
                    <span className="truncate">{path}</span>
                    <span className="text-gray-600 text-[10px] ml-auto">{path.split('/').slice(0, -1).join('/')}</span>
                </button>
            ))}
        </div>
    );
}

// ===== Inline Comments =====
export interface InlineComment { id: string; filePath: string; line: number; text: string; userId: string; userName: string; timestamp: number; }

export function CommentWidget({ comments, onAdd, onDelete, userId }: {
    comments: InlineComment[];
    onAdd: (text: string) => void;
    onDelete: (id: string) => void;
    userId: string;
}) {
    const [newComment, setNewComment] = useState('');
    return (
        <div className="bg-[#1e2030] border border-blue-500/30 rounded-lg p-2 space-y-1.5 max-w-sm">
            {comments.map(c => (
                <div key={c.id} className="flex items-start gap-1.5">
                    <div className="flex-1">
                        <span className="text-[10px] text-blue-400 font-medium">{c.userName}</span>
                        <p className="text-[11px] text-gray-300">{c.text}</p>
                    </div>
                    {c.userId === userId && (
                        <button onClick={() => onDelete(c.id)} className="text-gray-600 hover:text-red-400 p-0.5"><X className="w-3 h-3" /></button>
                    )}
                </div>
            ))}
            <form onSubmit={e => { e.preventDefault(); if (newComment.trim()) { onAdd(newComment); setNewComment(''); } }} className="flex gap-1">
                <input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Add comment..."
                    className="flex-1 bg-[#0d1117] border border-gray-700 rounded px-2 py-1 text-[11px] text-white placeholder-gray-600 outline-none focus:border-blue-500" />
                <button type="submit" className="px-2 py-1 bg-blue-600 text-white text-[10px] rounded">Add</button>
            </form>
        </div>
    );
}

// Suppress unused import warnings
void Search; void MessageCircle; void Bell;

// ===== Diff Viewer Modal =====
export function DiffViewer({ original, modified, fileName, onClose }: {
    original: string; modified: string; fileName: string; onClose: () => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        let editor: any;
        const loadDiff = async () => {
            const monaco = await import('monaco-editor');
            if (!containerRef.current) return;
            const originalModel = monaco.editor.createModel(original, 'typescript');
            const modifiedModel = monaco.editor.createModel(modified, 'typescript');
            editor = monaco.editor.createDiffEditor(containerRef.current, {
                theme: 'vs-dark', automaticLayout: true, readOnly: true, renderSideBySide: true,
                minimap: { enabled: false }, fontSize: 13,
            });
            editor.setModel({ original: originalModel, modified: modifiedModel });
        };
        loadDiff();
        return () => { if (editor) editor.dispose(); };
    }, [original, modified]);
    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-8">
            <div className="bg-[#1e2030] border border-gray-700 rounded-xl shadow-2xl w-full max-w-5xl h-[70vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
                    <span className="text-sm text-white font-medium">Diff: {fileName}</span>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
                <div ref={containerRef} className="flex-1" />
            </div>
        </div>
    );
}

// ===== Panel Resize Hook =====
export function usePanelResize(initialSize: number, min: number, max: number, direction: 'horizontal' | 'vertical' = 'horizontal') {
    const [size, setSize] = useState(initialSize);
    const sizeRef = useRef(initialSize);
    const startPos = useRef(0);

    // Keep ref in sync with state
    useEffect(() => { sizeRef.current = size; }, [size]);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
        const startSz = sizeRef.current;

        // Prevent text selection during drag
        document.body.style.userSelect = 'none';
        document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';

        const onMouseMove = (ev: MouseEvent) => {
            ev.preventDefault();
            const currentPos = direction === 'horizontal' ? ev.clientX : ev.clientY;
            const delta = currentPos - startPos.current;
            // For vertical (terminal at bottom), dragging UP = negative delta = bigger panel
            const adjustedDelta = direction === 'vertical' ? -delta : delta;
            const newSize = Math.max(min, Math.min(max, startSz + adjustedDelta));
            setSize(newSize);
        };

        const onMouseUp = () => {
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, [min, max, direction]);

    return { size, setSize, onMouseDown };
}
