import { useState, useRef, useEffect, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { WebContainer } from '@webcontainer/api';
import { Terminal as XTermTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
    FolderOpen, File, Plus, X, Play, Square, ChevronRight, ChevronDown,
    RefreshCw, Download, Maximize2, Minimize2, Terminal, MessageCircle, Send, Lock,
    Trash2, Pencil,
} from 'lucide-react';
import { socketService } from '@/lib/socket';
import type * as MonacoTypes from 'monaco-editor';

// ===== Types =====
interface FileNode { name: string; type: 'file' | 'directory'; children?: FileNode[]; }
interface ChatMessage { id: string; senderId: string; content: string; timestamp: Date; type: 'text' | 'system' | 'ai'; }
interface FileLock { path: string; userId: string; userName: string; }
interface ContextMenu { x: number; y: number; path: string; type: 'file' | 'directory'; }

interface CollabIDEProps {
    sessionId: string;
    partnerId: string;
    projectTitle: string;
    userId: string;
    userName: string;
    messages: ChatMessage[];
    onSendMessage: (msg: string) => void;
    lastSeenMessageCount: number;
    onMessagesSeen: (count: number) => void;
}

function getLanguage(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
        ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
        css: 'css', html: 'html', json: 'json', md: 'markdown', py: 'python',
        go: 'go', rs: 'rust', yml: 'yaml', yaml: 'yaml', sh: 'shell', env: 'plaintext', txt: 'plaintext',
    };
    return map[ext] || 'plaintext';
}

// Default starter files
const DEFAULT_FILES: Record<string, string> = {
    'package.json': JSON.stringify({
        name: 'pairon-project', private: true, version: '1.0.0', type: 'module',
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
        devDependencies: { '@types/react': '^18.2.0', '@types/react-dom': '^18.2.0', '@vitejs/plugin-react': '^4.2.0', typescript: '^5.3.0', vite: '^5.0.0' },
    }, null, 2),
    'index.html': `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>PairOn Project</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.tsx"></script>\n</body>\n</html>`,
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2020', useDefineForClassFields: true, lib: ['ES2020', 'DOM', 'DOM.Iterable'], module: 'ESNext', skipLibCheck: true, moduleResolution: 'bundler', allowImportingTsExtensions: true, resolveJsonModule: true, isolatedModules: true, noEmit: true, jsx: 'react-jsx', strict: true }, include: ['src'] }, null, 2),
    'vite.config.ts': `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({\n  plugins: [react()],\n})`,
    'src/main.tsx': `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App'\nimport './index.css'\n\nReactDOM.createRoot(document.getElementById('root')!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>,\n)`,
    'src/App.tsx': `import { useState } from 'react'\n\nfunction App() {\n  const [count, setCount] = useState(0)\n  return (\n    <div style={{ fontFamily: 'system-ui', padding: '2rem', textAlign: 'center' }}>\n      <h1>🚀 PairOn Project</h1>\n      <p>Start building together!</p>\n      <button onClick={() => setCount(c => c + 1)} style={{ padding: '0.5rem 1rem', fontSize: '1rem', cursor: 'pointer' }}>\n        Count: {count}\n      </button>\n    </div>\n  )\n}\nexport default App`,
    'src/index.css': `* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: system-ui, -apple-system, sans-serif; background: #0f0f1a; color: #e2e8f0; }\n`,
};

function toWebContainerFS(files: Record<string, string>): Record<string, any> {
    const fs: Record<string, any> = {};
    for (const [path, content] of Object.entries(files)) {
        const parts = path.split('/');
        let current = fs;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) current[parts[i]] = { directory: {} };
            current = current[parts[i]].directory;
        }
        current[parts[parts.length - 1]] = { file: { contents: content } };
    }
    return fs;
}

// Autosave key
const AUTOSAVE_KEY = (sid: string) => `pairon_ide_${sid}`;
const AUTOSAVE_DEBOUNCE = 1000;

export function CollabIDE({ sessionId, partnerId: _partnerId, projectTitle, userId, userName, messages, onSendMessage, lastSeenMessageCount, onMessagesSeen }: CollabIDEProps) {
    // Files as plain object for easy serialization
    const [files, setFiles] = useState<Record<string, string>>(() => {
        const saved = localStorage.getItem(AUTOSAVE_KEY(sessionId));
        if (saved) { try { return JSON.parse(saved); } catch { /* */ } }
        return { ...DEFAULT_FILES };
    });
    const [activeFile, setActiveFile] = useState<string>('src/App.tsx');
    const [openTabs, setOpenTabs] = useState<string[]>(['src/App.tsx', 'src/main.tsx']);
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['src']));
    const [showNewFile, setShowNewFile] = useState(false);
    const [newFileName, setNewFileName] = useState('');

    // WebContainer & terminal
    const [, setWebcontainer] = useState<WebContainer | null>(null);
    const [isBooting, setIsBooting] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [previewUrl, setPreviewUrl] = useState('');

    // File locking
    const [fileLocks, setFileLocks] = useState<Map<string, FileLock>>(new Map());

    // Context menu
    const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
    const [renamingPath, setRenamingPath] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');

    // Mini chat
    const [showMiniChat, setShowMiniChat] = useState(false);
    const [miniChatMsg, setMiniChatMsg] = useState('');
    const miniChatEndRef = useRef<HTMLDivElement>(null);

    // Layout
    const [terminalHeight, setTerminalHeight] = useState(200);
    const [sidebarWidth] = useState(200);
    const [previewWidth, setPreviewWidth] = useState(350);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Monaco refs
    const editorRef = useRef<MonacoTypes.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof MonacoTypes | null>(null);
    const modelsRef = useRef<Map<string, MonacoTypes.editor.ITextModel>>(new Map());

    // Other refs
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTermTerminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const webcontainerRef = useRef<WebContainer | null>(null);
    const shellProcessRef = useRef<any>(null);
    const filesRef = useRef(files);
    const lockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suppressSyncRef = useRef(false); // Prevent echo on remote changes

    useEffect(() => { filesRef.current = files; }, [files]);

    // Unread count
    const unreadCount = showMiniChat ? 0 : Math.max(0, messages.length - lastSeenMessageCount);
    useEffect(() => {
        if (showMiniChat) { miniChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); onMessagesSeen(messages.length); }
    }, [messages.length, showMiniChat, onMessagesSeen]);

    // ===== Autosave =====
    const autosave = useCallback((updated: Record<string, string>) => {
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = setTimeout(() => {
            localStorage.setItem(AUTOSAVE_KEY(sessionId), JSON.stringify(updated));
        }, AUTOSAVE_DEBOUNCE);
    }, [sessionId]);

    // ===== Monaco model management =====
    const getOrCreateModel = useCallback((path: string, content: string) => {
        const monaco = monacoRef.current;
        if (!monaco) return null;
        let model = modelsRef.current.get(path);
        if (model && !model.isDisposed()) return model;
        const uri = monaco.Uri.parse(`file:///${path}`);
        model = monaco.editor.getModel(uri) || monaco.editor.createModel(content, getLanguage(path), uri);
        modelsRef.current.set(path, model);
        return model;
    }, []);

    const switchToFile = useCallback((path: string) => {
        const editor = editorRef.current;
        const content = filesRef.current[path] ?? '';
        const model = getOrCreateModel(path, content);
        if (editor && model) {
            editor.setModel(model);
            // Sync content if model content differs (remote update)
            if (model.getValue() !== content) {
                suppressSyncRef.current = true;
                model.setValue(content);
                suppressSyncRef.current = false;
            }
        }
        setActiveFile(path);
        if (!openTabs.includes(path)) setOpenTabs(prev => [...prev, path]);
    }, [getOrCreateModel, openTabs]);

    // Handle editor mount — set up model system
    const handleEditorMount: OnMount = useCallback((editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        // Create model for initial file
        const model = getOrCreateModel(activeFile, filesRef.current[activeFile] ?? '');
        if (model) editor.setModel(model);

        // Listen for content changes
        editor.onDidChangeModelContent(() => {
            if (suppressSyncRef.current) return;
            const currentModel = editor.getModel();
            if (!currentModel) return;
            const path = currentModel.uri.path.slice(1); // Remove leading /
            const value = currentModel.getValue();
            // Update files state
            setFiles(prev => { const next = { ...prev, [path]: value }; autosave(next); return next; });
            // Sync to WebContainer
            if (webcontainerRef.current) webcontainerRef.current.fs.writeFile(path, value).catch(() => { });
            // Sync to partner
            const socket = socketService.getSocket();
            socket?.emit('code:file-change', { sessionId, path, content: value, senderId: socket.id });
            // Lock file
            lockFile(path);
        });
    }, [activeFile, sessionId, getOrCreateModel, autosave]);

    // ===== Initialize Terminal =====
    useEffect(() => {
        if (!terminalRef.current || xtermRef.current) return;
        const term = new XTermTerminal({
            theme: { background: '#0d1117', foreground: '#c9d1d9', cursor: '#58a6ff', cursorAccent: '#0d1117', selectionBackground: '#264f78' },
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace", fontSize: 13, cursorBlink: true, convertEol: true,
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        setTimeout(() => { try { fitAddon.fit(); } catch { /* */ } }, 100);
        xtermRef.current = term; fitAddonRef.current = fitAddon;
        term.writeln('\x1b[1;35m╔══════════════════════════════════╗\x1b[0m');
        term.writeln('\x1b[1;35m║   🚀 PairOn Collaborative IDE   ║\x1b[0m');
        term.writeln('\x1b[1;35m╚══════════════════════════════════╝\x1b[0m');
        term.writeln(''); term.writeln('\x1b[33mClick "▶ Run" to boot the dev environment.\x1b[0m'); term.writeln('');
        const ro = new ResizeObserver(() => { try { fitAddon.fit(); } catch { /* */ } });
        if (terminalRef.current) ro.observe(terminalRef.current);
        return () => { ro.disconnect(); term.dispose(); xtermRef.current = null; };
    }, []);

    // ===== Socket: File sync + Locks =====
    useEffect(() => {
        const socket = socketService.getSocket();
        if (!socket) return;

        const handleFileChange = (data: { path: string; content: string; senderId: string }) => {
            if (data.senderId === socket.id) return;
            setFiles(prev => { const next = { ...prev, [data.path]: data.content }; autosave(next); return next; });
            // Update Monaco model
            const model = modelsRef.current.get(data.path);
            if (model && !model.isDisposed() && model.getValue() !== data.content) {
                suppressSyncRef.current = true;
                model.setValue(data.content);
                suppressSyncRef.current = false;
            }
            if (webcontainerRef.current) webcontainerRef.current.fs.writeFile(data.path, data.content).catch(() => { });
        };
        const handleFileCreate = (data: { path: string; content: string; senderId: string }) => {
            if (data.senderId === socket.id) return;
            setFiles(prev => { const next = { ...prev, [data.path]: data.content }; autosave(next); return next; });
            if (webcontainerRef.current) {
                const dir = data.path.split('/').slice(0, -1).join('/');
                if (dir) webcontainerRef.current.fs.mkdir(dir, { recursive: true }).catch(() => { });
                webcontainerRef.current.fs.writeFile(data.path, data.content).catch(() => { });
            }
        };
        const handleFileDelete = (data: { path: string; senderId: string }) => {
            if (data.senderId === socket.id) return;
            setFiles(prev => { const next = { ...prev }; delete next[data.path]; autosave(next); return next; });
            // Dispose model
            const model = modelsRef.current.get(data.path);
            if (model && !model.isDisposed()) model.dispose();
            modelsRef.current.delete(data.path);
            setOpenTabs(prev => prev.filter(t => t !== data.path));
            if (webcontainerRef.current) webcontainerRef.current.fs.rm(data.path).catch(() => { });
        };
        const handleFileRename = (data: { oldPath: string; newPath: string; senderId: string }) => {
            if (data.senderId === socket.id) return;
            setFiles(prev => {
                const next = { ...prev };
                // Handle file or directory (all files starting with oldPath)
                Object.keys(next).forEach(p => {
                    if (p === data.oldPath || p.startsWith(data.oldPath + '/')) {
                        const newP = data.newPath + p.slice(data.oldPath.length);
                        next[newP] = next[p];
                        delete next[p];
                        // Update model
                        const model = modelsRef.current.get(p);
                        if (model && !model.isDisposed()) model.dispose();
                        modelsRef.current.delete(p);
                    }
                });
                autosave(next);
                return next;
            });
            setOpenTabs(prev => prev.map(t => t === data.oldPath || t.startsWith(data.oldPath + '/') ? data.newPath + t.slice(data.oldPath.length) : t));
            setActiveFile(prev => prev === data.oldPath || prev.startsWith(data.oldPath + '/') ? data.newPath + prev.slice(data.oldPath.length) : prev);
        };
        const handleFileLock = (data: FileLock) => { setFileLocks(prev => { const n = new Map(prev); n.set(data.path, data); return n; }); };
        const handleFileUnlock = (data: { path: string }) => { setFileLocks(prev => { const n = new Map(prev); n.delete(data.path); return n; }); };

        socket.on('code:file-change', handleFileChange);
        socket.on('code:file-create', handleFileCreate);
        socket.on('code:file-delete', handleFileDelete);
        socket.on('code:file-rename', handleFileRename);
        socket.on('code:file-lock', handleFileLock);
        socket.on('code:file-unlock', handleFileUnlock);
        return () => {
            socket.off('code:file-change', handleFileChange);
            socket.off('code:file-create', handleFileCreate);
            socket.off('code:file-delete', handleFileDelete);
            socket.off('code:file-rename', handleFileRename);
            socket.off('code:file-lock', handleFileLock);
            socket.off('code:file-unlock', handleFileUnlock);
        };
    }, [autosave]);

    // ===== File locking =====
    const lockFile = useCallback((path: string) => {
        const socket = socketService.getSocket();
        socket?.emit('code:file-lock', { sessionId, path, userId, userName });
        if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
        lockTimeoutRef.current = setTimeout(() => { socket?.emit('code:file-unlock', { sessionId, path, userId }); }, 3000);
    }, [sessionId, userId, userName]);

    const isLockedByPartner = useCallback((path: string) => { const l = fileLocks.get(path); return l && l.userId !== userId; }, [fileLocks, userId]);
    const getLockerName = useCallback((path: string) => fileLocks.get(path)?.userName || 'Partner', [fileLocks]);

    // ===== Boot WebContainer =====
    const bootWebContainer = useCallback(async () => {
        if (webcontainerRef.current || isBooting) return;
        setIsBooting(true);
        const term = xtermRef.current;
        if (term) term.writeln('\x1b[36m⏳ Booting development environment...\x1b[0m');
        try {
            const wc = await WebContainer.boot();
            webcontainerRef.current = wc; setWebcontainer(wc);
            await wc.mount(toWebContainerFS(filesRef.current));
            if (term) term.writeln('\x1b[32m✓ Files mounted\x1b[0m');
            wc.on('server-ready', (_port: number, url: string) => { setPreviewUrl(url); if (term) term.writeln(`\x1b[32m✓ Preview ready at ${url}\x1b[0m`); });
            if (term) term.writeln('\x1b[36m📦 Installing dependencies...\x1b[0m');
            const install = await wc.spawn('npm', ['install']);
            install.output.pipeTo(new WritableStream({ write(d) { if (term) term.write(d); } }));
            if (await install.exit !== 0) { if (term) term.writeln('\x1b[31m✗ npm install failed\x1b[0m'); setIsBooting(false); return; }
            if (term) term.writeln('\x1b[32m✓ Dependencies installed\x1b[0m\n\x1b[36m🚀 Starting dev server...\x1b[0m');
            const dev = await wc.spawn('npm', ['run', 'dev']);
            shellProcessRef.current = dev; setIsRunning(true);
            dev.output.pipeTo(new WritableStream({ write(d) { if (term) term.write(d); } }));
            setIsBooting(false);
        } catch (err: any) {
            if (term) { term.writeln(`\x1b[31m✗ Failed: ${err.message}\x1b[0m`); term.writeln('\x1b[33mℹ Requires Chromium browser\x1b[0m'); }
            setIsBooting(false);
        }
    }, [isBooting]);

    const stopServer = useCallback(() => {
        if (shellProcessRef.current) { shellProcessRef.current.kill(); shellProcessRef.current = null; setIsRunning(false); setPreviewUrl(''); if (xtermRef.current) xtermRef.current.writeln('\n\x1b[33m■ Stopped\x1b[0m'); }
    }, []);

    // ===== File operations =====
    const createFile = useCallback((filename: string) => {
        if (!filename.trim()) return;
        setFiles(prev => { const next = { ...prev, [filename]: '' }; autosave(next); return next; });
        switchToFile(filename);
        if (webcontainerRef.current) {
            const dir = filename.split('/').slice(0, -1).join('/');
            if (dir) webcontainerRef.current.fs.mkdir(dir, { recursive: true }).catch(() => { });
            webcontainerRef.current.fs.writeFile(filename, '').catch(() => { });
        }
        const socket = socketService.getSocket();
        socket?.emit('code:file-create', { sessionId, path: filename, content: '', senderId: socket?.id });
        setShowNewFile(false); setNewFileName('');
        // Auto-expand parent dirs
        const parts = filename.split('/');
        if (parts.length > 1) {
            setExpandedDirs(prev => { const n = new Set(prev); for (let i = 1; i < parts.length; i++) n.add(parts.slice(0, i).join('/')); return n; });
        }
    }, [sessionId, autosave, switchToFile]);

    const deleteFile = useCallback((path: string) => {
        // Delete all files with this prefix (handles directories)
        setFiles(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(p => { if (p === path || p.startsWith(path + '/')) delete next[p]; });
            autosave(next);
            return next;
        });
        // Dispose models
        for (const [p, model] of modelsRef.current) {
            if (p === path || p.startsWith(path + '/')) { if (!model.isDisposed()) model.dispose(); modelsRef.current.delete(p); }
        }
        // Close tabs
        setOpenTabs(prev => {
            const next = prev.filter(t => t !== path && !t.startsWith(path + '/'));
            if ((activeFile === path || activeFile.startsWith(path + '/')) && next.length > 0) setActiveFile(next[next.length - 1]);
            return next;
        });
        if (webcontainerRef.current) webcontainerRef.current.fs.rm(path, { recursive: true }).catch(() => { });
        const socket = socketService.getSocket();
        socket?.emit('code:file-delete', { sessionId, path, senderId: socket?.id });
        setContextMenu(null);
    }, [sessionId, activeFile, autosave]);

    const renameFile = useCallback((oldPath: string, newName: string) => {
        if (!newName.trim()) { setRenamingPath(null); return; }
        const parts = oldPath.split('/');
        parts[parts.length - 1] = newName;
        const newPath = parts.join('/');
        if (newPath === oldPath) { setRenamingPath(null); return; }

        setFiles(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(p => {
                if (p === oldPath || p.startsWith(oldPath + '/')) {
                    const renamed = newPath + p.slice(oldPath.length);
                    next[renamed] = next[p]; delete next[p];
                    const model = modelsRef.current.get(p);
                    if (model && !model.isDisposed()) model.dispose();
                    modelsRef.current.delete(p);
                }
            });
            autosave(next); return next;
        });
        setOpenTabs(prev => prev.map(t => t === oldPath || t.startsWith(oldPath + '/') ? newPath + t.slice(oldPath.length) : t));
        setActiveFile(prev => prev === oldPath || prev.startsWith(oldPath + '/') ? newPath + prev.slice(oldPath.length) : prev);
        const socket = socketService.getSocket();
        socket?.emit('code:file-rename', { sessionId, oldPath, newPath, senderId: socket?.id });
        setRenamingPath(null);
    }, [sessionId, autosave]);

    const closeTab = useCallback((path: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setOpenTabs(prev => { const next = prev.filter(t => t !== path); if (activeFile === path && next.length > 0) switchToFile(next[next.length - 1]); return next; });
    }, [activeFile, switchToFile]);

    const toggleDir = useCallback((dir: string) => {
        setExpandedDirs(prev => { const n = new Set(prev); if (n.has(dir)) n.delete(dir); else n.add(dir); return n; });
    }, []);

    const downloadZip = useCallback(async () => {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        Object.entries(files).forEach(([p, c]) => zip.file(p, c));
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${projectTitle.replace(/\s+/g, '-').toLowerCase()}.zip`; a.click();
        URL.revokeObjectURL(url);
    }, [files, projectTitle]);

    // ===== File tree =====
    const buildTree = useCallback((): FileNode[] => {
        const root: FileNode[] = [];
        const dirMap = new Map<string, FileNode>();
        const paths = Object.keys(files).sort();
        for (const path of paths) {
            const parts = path.split('/');
            if (parts.length === 1) { root.push({ name: parts[0], type: 'file' }); continue; }
            for (let i = 0; i < parts.length - 1; i++) {
                const dirPath = parts.slice(0, i + 1).join('/');
                if (!dirMap.has(dirPath)) {
                    const dirNode: FileNode = { name: parts[i], type: 'directory', children: [] };
                    dirMap.set(dirPath, dirNode);
                    if (i === 0) { if (!root.find(n => n.name === parts[0] && n.type === 'directory')) root.push(dirNode); }
                    else { dirMap.get(parts.slice(0, i).join('/'))?.children?.push(dirNode); }
                }
            }
            dirMap.get(parts.slice(0, -1).join('/'))?.children?.push({ name: parts[parts.length - 1], type: 'file' });
        }
        return root;
    }, [files]);

    const renderTree = (nodes: FileNode[], prefix = '') => {
        const sorted = [...nodes].sort((a, b) => { if (a.type !== b.type) return a.type === 'directory' ? -1 : 1; return a.name.localeCompare(b.name); });
        return sorted.map(node => {
            const fullPath = prefix ? `${prefix}/${node.name}` : node.name;

            // Renaming mode
            if (renamingPath === fullPath) {
                return (
                    <div key={fullPath} className="px-2 py-0.5">
                        <input autoFocus value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') renameFile(fullPath, renameValue); if (e.key === 'Escape') setRenamingPath(null); }}
                            onBlur={() => renameFile(fullPath, renameValue)}
                            className="w-full bg-[#1e2030] border border-blue-500 rounded px-1.5 py-0.5 text-xs text-white outline-none"
                        />
                    </div>
                );
            }

            if (node.type === 'directory') {
                const isExpanded = expandedDirs.has(fullPath);
                return (
                    <div key={fullPath}>
                        <button onClick={() => toggleDir(fullPath)}
                            onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, path: fullPath, type: 'directory' }); }}
                            className="w-full flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:bg-[#1e2030] hover:text-gray-200 transition-colors rounded group">
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                            <span className="flex-1 text-left">{node.name}</span>
                        </button>
                        {isExpanded && node.children && <div className="ml-3 border-l border-gray-800">{renderTree(node.children, fullPath)}</div>}
                    </div>
                );
            }

            const locked = isLockedByPartner(fullPath);
            return (
                <button key={fullPath}
                    onClick={() => switchToFile(fullPath)}
                    onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, path: fullPath, type: 'file' }); }}
                    className={`w-full flex items-center gap-1.5 px-2 py-1 text-xs transition-colors rounded ${activeFile === fullPath ? 'bg-[#2d2f3f] text-white' : 'text-gray-500 hover:bg-[#1e2030] hover:text-gray-300'}`}>
                    <File className="w-3.5 h-3.5 text-gray-500" />
                    <span className="truncate flex-1 text-left">{node.name}</span>
                    {locked && <Lock className="w-3 h-3 text-yellow-500" />}
                </button>
            );
        });
    };

    useEffect(() => { setTimeout(() => { try { fitAddonRef.current?.fit(); } catch { /* */ } }, 50); }, [terminalHeight]);
    // Close context menu on click anywhere
    useEffect(() => { const h = () => setContextMenu(null); window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, []);

    const tree = buildTree();
    const activeFileLocked = isLockedByPartner(activeFile);

    return (
        <div className={`flex flex-col bg-[#0d1117] text-white ${isFullscreen ? 'fixed inset-0 z-50' : 'h-full'}`}>
            {/* Top bar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-gray-800 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-400">📁 {projectTitle}</span>
                    {activeFileLocked && (
                        <span className="flex items-center gap-1 text-[10px] text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full">
                            <Lock className="w-3 h-3" /> {getLockerName(activeFile)} is editing
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {!isRunning ? (
                        <button onClick={bootWebContainer} disabled={isBooting}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-md transition-colors">
                            {isBooting ? (<><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Booting...</>) : (<><Play className="w-3 h-3" /> Run</>)}
                        </button>
                    ) : (
                        <button onClick={stopServer} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors">
                            <Square className="w-3 h-3" /> Stop
                        </button>
                    )}
                    <button onClick={downloadZip} className="p-1.5 text-gray-400 hover:text-white rounded" title="Download ZIP"><Download className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 text-gray-400 hover:text-white rounded">
                        {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    </button>
                </div>
            </div>

            {/* Main */}
            <div className="flex flex-1 overflow-hidden">
                {/* File explorer */}
                <div className="flex-shrink-0 bg-[#0d1117] border-r border-gray-800 overflow-y-auto" style={{ width: sidebarWidth }}>
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Explorer</span>
                        <button onClick={() => setShowNewFile(true)} className="p-0.5 text-gray-500 hover:text-white rounded" title="New file"><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                    {showNewFile && (
                        <div className="px-2 py-1 border-b border-gray-800">
                            <input autoFocus value={newFileName} onChange={(e) => setNewFileName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') createFile(newFileName); if (e.key === 'Escape') { setShowNewFile(false); setNewFileName(''); } }}
                                placeholder="src/components/Button.tsx"
                                className="w-full bg-[#1e2030] border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500" />
                        </div>
                    )}
                    <div className="p-1">{renderTree(tree)}</div>
                </div>

                {/* Editor + Terminal */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex items-center bg-[#161b22] border-b border-gray-800 overflow-x-auto flex-shrink-0">
                        {openTabs.map(tab => {
                            const locked = isLockedByPartner(tab);
                            return (
                                <button key={tab} onClick={() => switchToFile(tab)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-gray-800 whitespace-nowrap transition-colors ${activeFile === tab ? 'bg-[#0d1117] text-white border-t-2 border-t-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>
                                    {locked && <Lock className="w-3 h-3 text-yellow-500" />}
                                    <span>{tab.split('/').pop()}</span>
                                    <span onClick={(e) => closeTab(tab, e)} className="p-0.5 rounded hover:bg-gray-700"><X className="w-3 h-3" /></span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex-1 min-h-0 relative">
                        {activeFileLocked && (
                            <div className="absolute top-0 left-0 right-0 z-10 bg-yellow-500/10 border-b border-yellow-500/30 px-3 py-1 flex items-center gap-2">
                                <Lock className="w-3 h-3 text-yellow-500" />
                                <span className="text-[11px] text-yellow-400">{getLockerName(activeFile)} is editing — view only</span>
                            </div>
                        )}
                        <Editor
                            height="100%"
                            theme="vs-dark"
                            onMount={handleEditorMount}
                            options={{
                                minimap: { enabled: false }, fontSize: 14,
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                lineNumbers: 'on', scrollBeyondLastLine: false, automaticLayout: true,
                                tabSize: 2, wordWrap: 'on', bracketPairColorization: { enabled: true },
                                padding: { top: activeFileLocked ? 28 : 8, bottom: 8 },
                                readOnly: activeFileLocked,
                            }}
                        />
                    </div>

                    <div className="flex-shrink-0 border-t border-gray-800 bg-[#0d1117]" style={{ height: terminalHeight }}>
                        <div className="flex items-center justify-between px-3 py-1 bg-[#161b22] border-b border-gray-800">
                            <div className="flex items-center gap-1.5">
                                <Terminal className="w-3 h-3 text-gray-500" />
                                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Terminal</span>
                            </div>
                            <button onClick={() => setTerminalHeight(h => h === 200 ? 350 : 200)} className="p-0.5 text-gray-500 hover:text-white">
                                {terminalHeight > 200 ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                            </button>
                        </div>
                        <div ref={terminalRef} className="h-[calc(100%-24px)]" />
                    </div>
                </div>

                {/* Preview + Mini Chat */}
                <div className="flex-shrink-0 border-l border-gray-800 bg-[#161b22] flex flex-col" style={{ width: previewWidth }}>
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800 flex-shrink-0">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Preview</span>
                        <div className="flex items-center gap-1">
                            {previewUrl && <button onClick={() => { const f = document.getElementById('preview-iframe') as HTMLIFrameElement; if (f) f.src = previewUrl; }} className="p-0.5 text-gray-500 hover:text-white"><RefreshCw className="w-3 h-3" /></button>}
                            <button onClick={() => setPreviewWidth(w => w === 350 ? 500 : 350)} className="p-0.5 text-gray-500 hover:text-white">
                                {previewWidth > 350 ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 bg-white">
                        {previewUrl ? (
                            <iframe id="preview-iframe" src={previewUrl} className="w-full h-full border-0" title="Preview" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" />
                        ) : (
                            <div className="flex items-center justify-center h-full bg-[#0d1117]">
                                <div className="text-center">
                                    <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3"><Play className="w-5 h-5 text-gray-600" /></div>
                                    <p className="text-xs text-gray-600">Click <strong className="text-green-500">▶ Run</strong> to see preview</p>
                                </div>
                            </div>
                        )}
                    </div>
                    {/* Mini chat toggle */}
                    <div className="border-t border-gray-800">
                        <button onClick={() => { setShowMiniChat(!showMiniChat); if (!showMiniChat) onMessagesSeen(messages.length); }}
                            className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#1e2030] transition-colors">
                            <div className="flex items-center gap-1.5">
                                <MessageCircle className="w-3 h-3 text-gray-500" />
                                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Chat</span>
                            </div>
                            <div className="flex items-center gap-1">
                                {!showMiniChat && unreadCount > 0 && (
                                    <span className="w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">{unreadCount > 9 ? '9+' : unreadCount}</span>
                                )}
                                {showMiniChat ? <Minimize2 className="w-3 h-3 text-gray-500" /> : <Maximize2 className="w-3 h-3 text-gray-500" />}
                            </div>
                        </button>
                    </div>
                    {showMiniChat && (
                        <div className="h-56 flex flex-col border-t border-gray-800 bg-[#0d1117]">
                            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                                {messages.slice(-20).map(msg => (
                                    <div key={msg.id}>
                                        {msg.type === 'system' ? <span className="text-[10px] text-gray-600 block text-center">{msg.content}</span> : (
                                            <div className={`flex ${msg.senderId === userId ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[85%] px-2.5 py-1.5 rounded-xl text-xs ${msg.senderId === userId ? 'bg-blue-600 text-white' : 'bg-[#1e2030] text-gray-300'}`}>{msg.content}</div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <div ref={miniChatEndRef} />
                            </div>
                            <form onSubmit={(e) => { e.preventDefault(); if (miniChatMsg.trim()) { onSendMessage(miniChatMsg); setMiniChatMsg(''); } }} className="p-2 border-t border-gray-800 flex gap-1.5">
                                <input value={miniChatMsg} onChange={(e) => setMiniChatMsg(e.target.value)} placeholder="Message..."
                                    className="flex-1 bg-[#1e2030] border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500" />
                                <button type="submit" disabled={!miniChatMsg.trim()} className="p-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg"><Send className="w-3 h-3 text-white" /></button>
                            </form>
                        </div>
                    )}
                </div>
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div className="fixed z-50 bg-[#1e2030] border border-gray-700 rounded-lg shadow-xl py-1 min-w-[140px]" style={{ left: contextMenu.x, top: contextMenu.y }}>
                    <button onClick={() => { setRenameValue(contextMenu.path.split('/').pop() || ''); setRenamingPath(contextMenu.path); setContextMenu(null); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-[#2d2f3f] transition-colors">
                        <Pencil className="w-3 h-3" /> Rename
                    </button>
                    <button onClick={() => { if (confirm(`Delete "${contextMenu.path}"?`)) deleteFile(contextMenu.path); else setContextMenu(null); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
                        <Trash2 className="w-3 h-3" /> Delete
                    </button>
                </div>
            )}
        </div>
    );
}
