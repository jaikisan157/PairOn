import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Search, MessageCircle, Bell, Package, AlertCircle, CheckCircle2, Globe } from 'lucide-react';

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
                        {i > 0 && <span className="text-gray-600 mx-0.5">â€º</span>}
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
export function usePanelResize(initialSize: number, min: number, max: number, direction: 'horizontal' | 'vertical' = 'horizontal', invert = false) {
    const [size, setSize] = useState(initialSize);
    const sizeRef = useRef(initialSize);
    const dividerRef = useRef<HTMLDivElement>(null);

    useEffect(() => { sizeRef.current = size; }, [size]);

    useEffect(() => {
        const el = dividerRef.current;
        if (!el) return;

        const handleMouseDown = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const startPos = direction === 'horizontal' ? e.clientX : e.clientY;
            const startSz = sizeRef.current;

            document.body.style.userSelect = 'none';
            document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
            el.style.background = '#3b82f6';

            const onMove = (ev: MouseEvent) => {
                ev.preventDefault();
                const pos = direction === 'horizontal' ? ev.clientX : ev.clientY;
                let delta = pos - startPos;
                if (invert) delta = -delta;
                const newSz = Math.max(min, Math.min(max, startSz + delta));
                sizeRef.current = newSz;
                setSize(newSz);
            };

            const onUp = () => {
                document.body.style.userSelect = '';
                document.body.style.cursor = '';
                el.style.background = '';
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        };

        el.addEventListener('mousedown', handleMouseDown);
        return () => { el.removeEventListener('mousedown', handleMouseDown); };
    }, [min, max, direction, invert]);

    return { size, setSize, dividerRef };
}

// ResizeDivider component
export function ResizeDivider({ dividerRef, direction = 'horizontal' }: { dividerRef: React.RefObject<HTMLDivElement | null>; direction?: 'horizontal' | 'vertical' }) {
    const isH = direction === 'horizontal';
    return (
        <div
            ref={dividerRef}
            style={{
                [isH ? 'width' : 'height']: '5px',
                flexShrink: 0,
                cursor: isH ? 'col-resize' : 'row-resize',
                background: '#21262d',
                transition: 'background 0.15s',
                zIndex: 10,
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#58a6ff'; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.background = '#21262d'; }}
        />
    );
}

// ===== Package Manager Panel =====
export function PackageManagerPanel({ packageJson, onInstall, onUninstall, onClose }: {
    packageJson: string;
    onInstall: (pkg: string, isDev: boolean) => void;
    onUninstall: (pkg: string) => void;
    onClose: () => void;
}) {
    const [query, setQuery] = useState('');
    const [isDev, setIsDev] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    let deps: [string, string][] = [];
    let devDeps: [string, string][] = [];
    try {
        const pkg = JSON.parse(packageJson);
        deps = Object.entries(pkg.dependencies || {}) as [string, string][];
        devDeps = Object.entries(pkg.devDependencies || {}) as [string, string][];
    } catch { /* invalid JSON */ }

    const allDeps = [
        ...deps.map(([n, v]) => ({ name: n, version: v, isDev: false })),
        ...devDeps.map(([n, v]) => ({ name: n, version: v, isDev: true })),
    ].filter(d => !query || d.name.toLowerCase().includes(query.toLowerCase()));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
            <div className="bg-[#1e2030] border border-gray-700 rounded-xl shadow-2xl w-[480px] max-h-[75vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-blue-400" />
                        <span className="text-sm font-semibold text-white">Package Manager</span>
                    </div>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
                {/* Install form */}
                <div className="px-4 py-3 border-b border-gray-700 flex-shrink-0 space-y-2">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Install Package</p>
                    <form onSubmit={e => { e.preventDefault(); if (query.trim()) { onInstall(query.trim(), isDev); setQuery(''); } }} className="flex gap-2">
                        <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
                            placeholder="e.g. axios, lodash, dayjs"
                            className="flex-1 bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500" />
                        <button type="button" onClick={() => setIsDev(!isDev)}
                            className={`px-2 py-1.5 text-[10px] rounded-lg border transition-colors ${isDev ? 'bg-orange-600/20 border-orange-500 text-orange-400' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}
                            title="Toggle dev dependency">--save-dev</button>
                        <button type="submit" disabled={!query.trim()}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs rounded-lg font-medium transition-colors">
                            Install
                        </button>
                    </form>
                    <p className="text-[10px] text-gray-600">
                        {isDev ? 'ðŸ“¦ Will install as devDependency (--save-dev)' : 'ðŸ“¦ Will install as dependency'}
                    </p>
                </div>
                {/* Filter + package list */}
                <div className="px-4 py-2 border-b border-gray-800 flex-shrink-0">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600" />
                        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter installed packages..."
                            className="w-full bg-[#0d1117] border border-gray-700 rounded px-6 py-1 text-[11px] text-white placeholder-gray-600 outline-none focus:border-blue-500" />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {allDeps.length === 0 ? (
                        <p className="text-xs text-gray-600 text-center py-8">
                            {deps.length + devDeps.length === 0 ? 'No packages installed yet' : 'No matching packages'}
                        </p>
                    ) : (
                        allDeps.map(dep => (
                            <div key={dep.name} className="flex items-center gap-2 px-4 py-2 hover:bg-[#2d2f3f] border-b border-gray-800/50 group">
                                <div className="flex-1 min-w-0">
                                    <span className="text-xs text-gray-200">{dep.name}</span>
                                    <span className="text-[10px] text-gray-600 ml-2 font-mono">{dep.version}</span>
                                </div>
                                {dep.isDev && <span className="text-[9px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20">dev</span>}
                                <button onClick={() => onUninstall(dep.name)}
                                    className="p-1 text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100" title="Uninstall">
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
                <div className="px-4 py-2 border-t border-gray-700 text-[10px] text-gray-600 flex-shrink-0 flex gap-3">
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" />{deps.length} dependencies</span>
                    <span className="flex items-center gap-1"><Package className="w-3 h-3 text-orange-400" />{devDeps.length} devDependencies</span>
                </div>
            </div>
        </div>
    );
}

// ===== Project Templates =====
export interface ProjectTemplate { id: string; name: string; description: string; icon: string; files: Record<string, string>; }

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
    {
        id: 'react-ts', name: 'React + TypeScript', description: 'Vite-powered SPA with TypeScript', icon: 'âš›ï¸',
        files: {
            'package.json': JSON.stringify({ name: 'react-ts-app', private: true, version: '1.0.0', type: 'module', scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' }, dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' }, devDependencies: { '@types/react': '^18.2.0', '@types/react-dom': '^18.2.0', '@vitejs/plugin-react': '^4.2.0', typescript: '^5.3.0', vite: '^5.0.0' } }, null, 2),
            'index.html': `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>React App</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.tsx"></script>\n</body>\n</html>`,
            'vite.config.ts': `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nexport default defineConfig({ plugins: [react()] })`,
            'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2020', lib: ['ES2020', 'DOM', 'DOM.Iterable'], module: 'ESNext', skipLibCheck: true, moduleResolution: 'bundler', allowImportingTsExtensions: true, noEmit: true, jsx: 'react-jsx', strict: false }, include: ['src'] }, null, 2),
            'src/main.tsx': `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App'\nimport './index.css'\n\nReactDOM.createRoot(document.getElementById('root')!).render(\n  <React.StrictMode><App /></React.StrictMode>\n)`,
            'src/App.tsx': `import { useState } from 'react'\n\nexport default function App() {\n  const [count, setCount] = useState(0)\n  return (\n    <div style={{ fontFamily: 'system-ui', padding: '2rem', textAlign: 'center' }}>\n      <h1>âš›ï¸ React + TypeScript</h1>\n      <p style={{ color: '#9ca3af', margin: '0.5rem 0 1.5rem' }}>Edit <code>src/App.tsx</code> to get started</p>\n      <button onClick={() => setCount(c => c + 1)}\n        style={{ padding: '0.5rem 1.5rem', fontSize: '1rem', cursor: 'pointer', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px' }}>\n        Count: {count}\n      </button>\n    </div>\n  )\n}`,
            'src/index.css': `* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: system-ui; background: #0f0f1a; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }`,
        }
    },
    {
        id: 'express-api', name: 'Express REST API', description: 'Node.js REST API with TypeScript + tsx', icon: 'ðŸš€',
        files: {
            'package.json': JSON.stringify({ name: 'express-api', version: '1.0.0', type: 'module', scripts: { dev: 'node --watch --experimental-strip-types src/index.ts', start: 'tsx src/index.ts' }, dependencies: { express: '^4.18.2', cors: '^2.8.5' }, devDependencies: { '@types/express': '^4.17.21', '@types/cors': '^2.8.17', tsx: '^4.7.0', typescript: '^5.3.0' } }, null, 2),
            'src/index.ts': `import express from 'express'\nimport cors from 'cors'\n\nconst app = express()\nconst PORT = 3000\n\napp.use(cors())\napp.use(express.json())\n\napp.get('/', (_req, res) => {\n  res.json({ message: 'ðŸš€ Express API is running!', timestamp: new Date().toISOString() })\n})\n\napp.get('/api/items', (_req, res) => {\n  res.json([\n    { id: 1, name: 'Item One', done: false },\n    { id: 2, name: 'Item Two', done: true },\n  ])\n})\n\napp.post('/api/items', (req, res) => {\n  const body = req.body\n  res.status(201).json({ id: Date.now(), ...body })\n})\n\napp.listen(PORT, () => console.log(\`âœ… Server â†’ http://localhost:\${PORT}\`))`,
            'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'node', strict: false, esModuleInterop: true, skipLibCheck: true }, include: ['src'] }, null, 2),
        }
    },
    {
        id: 'vanilla-ts', name: 'Vanilla TypeScript', description: 'Zero-framework TS app with Vite', icon: 'âš¡',
        files: {
            'package.json': JSON.stringify({ name: 'vanilla-ts', private: true, version: '1.0.0', type: 'module', scripts: { dev: 'vite', build: 'tsc && vite build' }, devDependencies: { typescript: '^5.3.0', vite: '^5.0.0' } }, null, 2),
            'index.html': `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8" /><title>Vanilla TS</title><link rel="stylesheet" href="src/style.css"></head>\n<body>\n  <div id="app"></div>\n  <script type="module" src="src/main.ts"></script>\n</body>\n</html>`,
            'src/main.ts': `const app = document.getElementById('app')!\n\nlet count = 0\n\nfunction render() {\n  app.innerHTML = \`\n    <h1>âš¡ Vanilla TypeScript</h1>\n    <p>Edit <code>src/main.ts</code> to get started</p>\n    <button id="btn">Clicked: \${count}</button>\n  \`\n  document.getElementById('btn')!.addEventListener('click', () => { count++; render() })\n}\n\nrender()`,
            'src/style.css': `* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: system-ui; background: #0f0f1a; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }\n#app { text-align: center; }\nh1 { font-size: 2rem; margin-bottom: 0.75rem; color: #f59e0b; }\np { color: #6b7280; margin-bottom: 1.5rem; }\ncode { background: #1e2030; padding: 0.1em 0.3em; border-radius: 4px; font-size: 0.9em; }\nbutton { padding: 0.6rem 1.5rem; font-size: 1rem; cursor: pointer; background: #4f46e5; color: white; border: none; border-radius: 8px; transition: background 0.2s; }\nbutton:hover { background: #4338ca; }`,
            'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2020', module: 'ESNext', moduleResolution: 'bundler', strict: false, noEmit: true }, include: ['src'] }, null, 2),
        }
    },
    {
        id: 'todo-app', name: 'Todo App', description: 'React to-do list with local storage', icon: 'âœ…',
        files: {
            'package.json': JSON.stringify({ name: 'todo-app', private: true, version: '1.0.0', type: 'module', scripts: { dev: 'vite', build: 'vite build' }, dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' }, devDependencies: { '@types/react': '^18.2.0', '@types/react-dom': '^18.2.0', '@vitejs/plugin-react': '^4.2.0', typescript: '^5.3.0', vite: '^5.0.0' } }, null, 2),
            'index.html': `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8" /><title>Todo App</title></head>\n<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>\n</html>`,
            'vite.config.ts': `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nexport default defineConfig({ plugins: [react()] })`,
            'src/main.tsx': `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App'\nimport './style.css'\nReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)`,
            'src/App.tsx': `import { useState, useEffect } from 'react'\n\ninterface Todo { id: number; text: string; done: boolean }\n\nexport default function App() {\n  const [todos, setTodos] = useState<Todo[]>(() => JSON.parse(localStorage.getItem('todos') || '[]'))\n  const [input, setInput] = useState('')\n\n  useEffect(() => { localStorage.setItem('todos', JSON.stringify(todos)) }, [todos])\n\n  const add = () => { if (!input.trim()) return; setTodos(t => [...t, { id: Date.now(), text: input.trim(), done: false }]); setInput('') }\n  const toggle = (id: number) => setTodos(t => t.map(x => x.id === id ? { ...x, done: !x.done } : x))\n  const remove = (id: number) => setTodos(t => t.filter(x => x.id !== id))\n\n  return (\n    <div className="app">\n      <h1>âœ… Todo App</h1>\n      <div className="row">\n        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="What needs to be done?" />\n        <button onClick={add}>Add</button>\n      </div>\n      <ul>\n        {todos.map(t => (\n          <li key={t.id}>\n            <span className={t.done ? 'done' : ''} onClick={() => toggle(t.id)}>{t.text}</span>\n            <button className="del" onClick={() => remove(t.id)}>Ã—</button>\n          </li>\n        ))}\n      </ul>\n      {todos.length > 0 && <p className="count">{todos.filter(t => !t.done).length} of {todos.length} remaining</p>}\n    </div>\n  )\n}`,
            'src/style.css': `* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: system-ui; background: #0f0f1a; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; }\n.app { width: 420px; }\nh1 { font-size: 1.8rem; text-align: center; margin-bottom: 1.5rem; }\n.row { display: flex; gap: 0.5rem; margin-bottom: 1rem; }\ninput { flex: 1; padding: 0.6rem 0.8rem; background: #1e2030; border: 1px solid #30363d; border-radius: 8px; color: white; outline: none; font-size: 0.9rem; }\ninput:focus { border-color: #4f46e5; }\nbutton { padding: 0.6rem 1rem; background: #4f46e5; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 0.9rem; }\nbutton:hover { background: #4338ca; }\nul { list-style: none; }\nli { display: flex; align-items: center; background: #1e2030; border-radius: 8px; padding: 0.75rem 0.75rem 0.75rem 1rem; margin-bottom: 0.5rem; }\nli span { flex: 1; cursor: pointer; }\nli span.done { text-decoration: line-through; color: #6b7280; }\n.del { background: transparent; color: #6b7280; font-size: 1.2rem; padding: 0 0.25rem; }\n.del:hover { color: #ef4444; background: transparent; }\n.count { text-align: center; color: #6b7280; font-size: 0.8rem; margin-top: 1rem; }`,
            'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2020', lib: ['ES2020', 'DOM'], module: 'ESNext', skipLibCheck: true, moduleResolution: 'bundler', allowImportingTsExtensions: true, noEmit: true, jsx: 'react-jsx', strict: false }, include: ['src'] }, null, 2),
        }
    },
    {
        id: 'node-script', name: 'Node.js Script', description: 'Simple Node.js CLI / automation script', icon: 'ðŸŸ©',
        files: {
            'package.json': JSON.stringify({ name: 'node-script', version: '1.0.0', type: 'module', scripts: { start: 'node index.js', dev: 'node --watch index.js' }, dependencies: {} }, null, 2),
            'index.js': `// Node.js script â€” runs in WebContainer\nimport { readFileSync } from 'node:fs'\nimport { resolve } from 'node:path'\n\nconsole.log('ðŸŸ© Node.js is running!')\nconsole.log('Node version: check terminal for details')\n\n// Example: read package.json\nconst pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf-8'))\nconsole.log('Package name:', pkg.name)\nconsole.log('Scripts:', Object.keys(pkg.scripts || {}))`,
        }
    },
    {
        id: 'react-tailwind', name: 'React + Tailwind', description: 'React + Vite + Tailwind CSS v3', icon: 'ðŸŽ¨',
        files: {
            'package.json': JSON.stringify({ name: 'react-tailwind', private: true, version: '1.0.0', type: 'module', scripts: { dev: 'vite', build: 'vite build' }, dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' }, devDependencies: { '@types/react': '^18.2.0', '@types/react-dom': '^18.2.0', '@vitejs/plugin-react': '^4.2.0', autoprefixer: '^10.4.17', postcss: '^8.4.35', tailwindcss: '^3.4.1', typescript: '^5.3.0', vite: '^5.0.0' } }, null, 2),
            'index.html': `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>React Tailwind</title></head>\n<body class="bg-gray-950 text-white">\n  <div id="root"></div>\n  <script type="module" src="/src/main.tsx"></script>\n</body>\n</html>`,
            'vite.config.ts': `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nexport default defineConfig({ plugins: [react()] })`,
            'tailwind.config.js': `/** @type {import('tailwindcss').Config} */\nexport default { content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'], theme: { extend: {} }, plugins: [] }`,
            'postcss.config.js': `export default { plugins: { tailwindcss: {}, autoprefixer: {} } }`,
            'src/main.tsx': `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App'\nimport './index.css'\nReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)`,
            'src/App.tsx': `import { useState } from 'react'\n\nexport default function App() {\n  const [count, setCount] = useState(0)\n  return (\n    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">\n      <h1 className="text-4xl font-bold text-white">ðŸŽ¨ React + <span className="text-sky-400">Tailwind</span></h1>\n      <p className="text-gray-400 text-sm">Edit <code className="bg-gray-800 px-1.5 py-0.5 rounded text-sky-400">src/App.tsx</code> to get started</p>\n      <button onClick={() => setCount(c => c + 1)}\n        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-colors">\n        Count: {count}\n      </button>\n    </div>\n  )\n}`,
            'src/index.css': `@tailwind base;\n@tailwind components;\n@tailwind utilities;`,
            'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2020', lib: ['ES2020', 'DOM', 'DOM.Iterable'], module: 'ESNext', skipLibCheck: true, moduleResolution: 'bundler', allowImportingTsExtensions: true, noEmit: true, jsx: 'react-jsx', strict: false }, include: ['src'] }, null, 2),
        }
    },
];

export function ProjectTemplatesModal({ onApply, onClose }: {
    onApply: (template: ProjectTemplate) => void;
    onClose: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
            <div className="bg-[#1e2030] border border-gray-700 rounded-xl shadow-2xl w-[560px] max-h-[75vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-blue-400" />
                        <span className="text-sm font-semibold text-white">Project Templates</span>
                    </div>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
                <div className="px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20 flex-shrink-0">
                    <p className="text-[11px] text-yellow-300 flex items-center gap-1.5">
                        <AlertCircle className="w-3 h-3 flex-shrink-0" />
                        This will replace all current files. Download a ZIP backup first if needed.
                    </p>
                </div>
                <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-3">
                    {PROJECT_TEMPLATES.map(t => (
                        <button key={t.id} onClick={() => { onApply(t); onClose(); }}
                            className="text-left p-3 bg-[#0d1117] border border-gray-800 rounded-lg hover:border-blue-500 hover:bg-[#161b22] transition-all group">
                            <div className="text-2xl mb-1.5">{t.icon}</div>
                            <p className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">{t.name}</p>
                            <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{t.description}</p>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ===== Environment Variables Panel =====
export function EnvVarsPanel({ envContent, onSave, onClose, partnerOwned = false }: {
    envContent: string;
    onSave: (content: string) => void;
    onClose: () => void;
    partnerOwned?: boolean;
}) {
    const [linesArr, setLinesArr] = useState<{ key: string; value: string }[]>(() =>
        envContent.split('\n')
            .filter(l => l.trim() && !l.startsWith('#'))
            .map(l => {
                const idx = l.indexOf('=');
                return idx > -1 ? { key: l.slice(0, idx).trim(), value: l.slice(idx + 1).trim() } : { key: l.trim(), value: '' };
            })
    );
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');

    const save = () => {
        const content = [
            '# Environment Variables',
            '# Generated by PairOn IDE',
            '',
            ...linesArr.map(l => `${l.key}=${l.value}`),
        ].join('\n');
        onSave(content);
        onClose();
    };

    const addVar = () => {
        if (!newKey.trim()) return;
        setLinesArr(prev => [...prev, { key: newKey.trim().toUpperCase().replace(/\s+/g, '_'), value: newValue }]);
        setNewKey(''); setNewValue('');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
            <div className="bg-[#1e2030] border border-gray-700 rounded-xl shadow-2xl w-[520px] max-h-[75vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
                    <span className="text-sm font-semibold text-white">
                        {partnerOwned ? "🔒 Partner's Env Variables (values hidden)" : '🔒 Environment Variables (.env)'}
                    </span>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
                {partnerOwned ? (
                    <div className="px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20 flex-shrink-0">
                        <p className="text-[11px] text-yellow-300">
                            🔐 <strong>Partner's API key values are private</strong> — you can see key names but values are hidden and cannot be copied or edited.
                        </p>
                    </div>
                ) : (
                    <div className="px-4 py-2 bg-blue-500/10 border-b border-blue-500/20 flex-shrink-0">
                        <p className="text-[11px] text-blue-300">
                            Values are written to <code className="bg-blue-900/40 px-1 rounded">.env</code> in the project root. Use <code className="bg-blue-900/40 px-1 rounded">import.meta.env.KEY</code> in Vite projects.
                            <span className="ml-1 text-yellow-300 font-medium">⚠️ .env is excluded from ZIP downloads</span>
                        </p>
                    </div>
                )}
                <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                    {linesArr.length === 0 && <p className="text-xs text-gray-600 text-center py-6">{partnerOwned ? 'No env variables set by partner.' : 'No variables yet. Add one below.'}</p>}
                    {linesArr.map((line, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <input value={line.key}
                                onChange={e => !partnerOwned && setLinesArr(prev => prev.map((l, j) => j === i ? { ...l, key: e.target.value } : l))}
                                readOnly={partnerOwned}
                                className="w-40 bg-[#0d1117] border border-gray-700 rounded px-2 py-1.5 text-xs text-blue-300 font-mono outline-none focus:border-blue-500"
                                placeholder="KEY" />
                            <span className="text-gray-600 text-sm font-mono">=</span>
                            {partnerOwned ? (
                                <div className="flex-1 relative">
                                    <span
                                        className="flex-1 block bg-[#0d1117] border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-600 font-mono select-none cursor-not-allowed"
                                        onCopy={e => e.preventDefault()}
                                    >
                                        {'•'.repeat(12)}
                                    </span>
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-yellow-600 font-medium">hidden</span>
                                </div>
                            ) : (
                                <input value={line.value}
                                    onChange={e => setLinesArr(prev => prev.map((l, j) => j === i ? { ...l, value: e.target.value } : l))}
                                    className="flex-1 bg-[#0d1117] border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300 font-mono outline-none focus:border-blue-500"
                                    placeholder="value" />
                            )}
                            {!partnerOwned && (
                                <button onClick={() => setLinesArr(prev => prev.filter((_, j) => j !== i))}
                                    className="p-1.5 text-gray-600 hover:text-red-400 transition-colors">
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
                <div className="px-4 py-3 border-t border-gray-700 flex-shrink-0 space-y-2">
                    {!partnerOwned && (
                        <div className="flex items-center gap-2">
                            <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="NEW_KEY"
                                className="w-40 bg-[#0d1117] border border-gray-700 rounded px-2 py-1.5 text-xs text-blue-300 font-mono outline-none focus:border-blue-500" />
                            <span className="text-gray-600 text-sm font-mono">=</span>
                            <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="value"
                                onKeyDown={e => e.key === 'Enter' && addVar()}
                                className="flex-1 bg-[#0d1117] border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300 font-mono outline-none focus:border-blue-500" />
                            <button onClick={addVar} disabled={!newKey.trim()}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs rounded font-medium transition-colors">
                                Add
                            </button>
                        </div>
                    )}
                    <div className="flex gap-2">
                        {!partnerOwned && (
                            <button onClick={save} className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg font-medium transition-colors">
                                Save .env
                            </button>
                        )}
                        <button onClick={onClose} className={`${partnerOwned ? 'w-full' : 'flex-1'} py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors`}>
                            {partnerOwned ? 'Close' : 'Cancel'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Suppress unused import warnings
void Search; void MessageCircle; void Bell; void Package; void AlertCircle; void CheckCircle2; void Globe;