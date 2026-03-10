import { useState, useRef, useEffect, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { WebContainer } from '@webcontainer/api';
import { Terminal as XTermTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
    FolderOpen, File, Plus, X, Play, Square, ChevronRight, ChevronDown,
    RefreshCw, Download, Maximize2, Minimize2, Terminal, MessageCircle, Send, Lock,
    Trash2, Pencil, Copy, FolderPlus, Sun, Moon, Hammer, Info,
    MoreVertical,
} from 'lucide-react';
import { socketService } from '@/lib/socket';
import type * as MonacoTypes from 'monaco-editor';
import { useToasts, ToastContainer, Breadcrumb, usePanelResize, ResizeDivider } from './CollabIDEHelpers';

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

// Blocked extensions (not supported by WebContainers)
const BLOCKED_EXTENSIONS = ['py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'rb', 'php', 'swift', 'kt', 'scala', 'cs', 'ex', 'exs', 'r', 'lua', 'pl', 'dart'];
const isBlockedExtension = (filename: string): boolean => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return BLOCKED_EXTENSIONS.includes(ext);
};

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
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Editor settings
    const [editorTheme, setEditorTheme] = useState<'vs-dark' | 'vs' | 'hc-black'>('vs-dark');
    const [fontSize, setFontSize] = useState(14);

    // Quick open (Ctrl+P)
    const [showQuickOpen, setShowQuickOpen] = useState(false);
    const [quickOpenQuery, setQuickOpenQuery] = useState('');
    const quickOpenInputRef = useRef<HTMLInputElement>(null);

    const { toasts, addToast } = useToasts();

    // Drag & drop
    const [draggedPath, setDraggedPath] = useState<string | null>(null);

    // Panel resize
    const sidebar = usePanelResize(200, 120, 400);
    const preview = usePanelResize(350, 200, 600, 'horizontal', true);
    const terminal = usePanelResize(200, 100, 500, 'vertical', true);

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
    const shellWriterRef = useRef<WritableStreamDefaultWriter<string> | null>(null);
    const filesRef = useRef(files);
    const lockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suppressSyncRef = useRef(false);

    // Terminal tabs
    const [activeTermTab, setActiveTermTab] = useState<'shell' | 'output'>('shell');
    const outputRef = useRef<HTMLDivElement>(null);
    const [outputLines, setOutputLines] = useState<string[]>([]);

    // Inline comments
    const [comments, setComments] = useState<Record<string, { id: string; line: number; text: string; userId: string; userName: string; timestamp: number }[]>>({});
    const [commentLine, setCommentLine] = useState<number | null>(null);
    const [commentText, setCommentText] = useState('');

    useEffect(() => { filesRef.current = files; }, [files]);

    // Unread count
    const unreadCount = showMiniChat ? 0 : Math.max(0, messages.length - lastSeenMessageCount);
    useEffect(() => {
        if (showMiniChat) { miniChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); onMessagesSeen(messages.length); }
    }, [messages.length, showMiniChat, onMessagesSeen]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
                e.preventDefault(); setShowQuickOpen(true); setQuickOpenQuery('');
                setTimeout(() => quickOpenInputRef.current?.focus(), 50);
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); setFontSize(s => Math.min(s + 1, 28)); }
            if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); setFontSize(s => Math.max(s - 1, 10)); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Quick open filtered files
    const quickOpenFiles = Object.keys(files).filter(p =>
        !quickOpenQuery || p.toLowerCase().includes(quickOpenQuery.toLowerCase())
    ).slice(0, 15);

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
            if (model.getValue() !== content) { suppressSyncRef.current = true; model.setValue(content); suppressSyncRef.current = false; }
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

        // Add "Comment on Line" action to editor context menu
        editor.addAction({
            id: 'add-comment',
            label: '💬 Add Comment on Line',
            contextMenuGroupId: 'navigation',
            contextMenuOrder: 99,
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyM],
            run: (ed) => {
                const pos = ed.getPosition();
                if (pos) setCommentLine(pos.lineNumber);
            },
        });
    }, [activeFile, sessionId, getOrCreateModel, autosave]);

    // ===== Initialize Terminal =====
    useEffect(() => {
        if (!terminalRef.current || xtermRef.current) return;
        const term = new XTermTerminal({
            theme: { background: '#0d1117', foreground: '#c9d1d9', cursor: '#58a6ff', cursorAccent: '#0d1117', selectionBackground: '#264f78' },
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace", fontSize: 13, cursorBlink: true, convertEol: true,
            allowProposedApi: true,
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        setTimeout(() => { try { fitAddon.fit(); } catch { /* */ } }, 100);
        xtermRef.current = term; fitAddonRef.current = fitAddon;
        term.writeln('\x1b[1;35m╔══════════════════════════════════════════════════╗\x1b[0m');
        term.writeln('\x1b[1;35m║        🚀 PairOn Collaborative IDE          ║\x1b[0m');
        term.writeln('\x1b[1;35m╚══════════════════════════════════════════════════╝\x1b[0m');
        term.writeln('');
        term.writeln('\x1b[1;37m  This IDE runs Node.js in the browser (WebContainers).\x1b[0m');
        term.writeln('\x1b[1;37m  It only supports HTTP connections — no raw TCP sockets.\x1b[0m');
        term.writeln('');
        term.writeln('\x1b[1;32m  ✅ WILL WORK:\x1b[0m');
        term.writeln('\x1b[32m  • Languages:\x1b[0m JavaScript, TypeScript');
        term.writeln('\x1b[32m  • Frameworks:\x1b[0m React, Vue, Svelte, Angular, Next.js');
        term.writeln('\x1b[32m  • Build tools:\x1b[0m Vite, Webpack, esbuild');
        term.writeln('\x1b[32m  • Backend:\x1b[0m Express, Fastify, Hono (HTTP only)');
        term.writeln('\x1b[32m  • Styling:\x1b[0m CSS, SASS, Tailwind, Styled-Components');
        term.writeln('\x1b[32m  • Databases:\x1b[0m Firebase, Supabase, Appwrite (HTTP APIs)');
        term.writeln('\x1b[32m  • Storage:\x1b[0m localStorage, IndexedDB, JSON files');
        term.writeln('\x1b[32m  • Packages:\x1b[0m Any npm package that runs on Node.js');
        term.writeln('');
        term.writeln('\x1b[1;31m  ❌ WILL NOT WORK:\x1b[0m');
        term.writeln('\x1b[31m  • Languages:\x1b[0m Python, Java, Go, Rust, C/C++, PHP');
        term.writeln('\x1b[31m  • Databases:\x1b[0m MongoDB/Mongoose, PostgreSQL, MySQL, Redis');
        term.writeln('\x1b[31m  • Reason:\x1b[0m These need TCP sockets, not available here');
        term.writeln('');
        term.writeln('\x1b[1;36m  💡 TIP:\x1b[0m Use \x1b[1;33mFirebase\x1b[0m or \x1b[1;33mSupabase\x1b[0m instead of MongoDB!');
        term.writeln('\x1b[36m         npm install firebase  |  npm install @supabase/supabase-js\x1b[0m');
        term.writeln('');
        term.writeln('\x1b[33m  Click "▶ Run" to boot the dev environment.\x1b[0m');
        term.writeln('');

        // Pipe keyboard input to the shell process
        term.onData((data: string) => {
            if (shellWriterRef.current) {
                shellWriterRef.current.write(data);
            }
        });

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

        const handleComment = (data: { filePath: string; comment: { id: string; line: number; text: string; userId: string; userName: string; timestamp: number }; senderId: string }) => {
            if (data.senderId === socket.id) return;
            setComments(prev => ({ ...prev, [data.filePath]: [...(prev[data.filePath] || []), data.comment] }));
        };

        socket.on('code:file-change', handleFileChange);
        socket.on('code:file-create', handleFileCreate);
        socket.on('code:file-delete', handleFileDelete);
        socket.on('code:file-rename', handleFileRename);
        socket.on('code:file-lock', handleFileLock);
        socket.on('code:file-unlock', handleFileUnlock);
        socket.on('code:comment', handleComment);
        return () => {
            socket.off('code:file-change', handleFileChange);
            socket.off('code:file-create', handleFileCreate);
            socket.off('code:file-delete', handleFileDelete);
            socket.off('code:file-rename', handleFileRename);
            socket.off('code:file-lock', handleFileLock);
            socket.off('code:file-unlock', handleFileUnlock);
            socket.off('code:comment', handleComment);
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

            // Spawn an interactive shell (like VS Code terminal)
            const shellProcess = await wc.spawn('jsh', { terminal: { cols: term?.cols || 80, rows: term?.rows || 24 } });
            shellProcessRef.current = shellProcess;

            // Pipe shell output to xterm
            shellProcess.output.pipeTo(new WritableStream({ write(data) { if (term) term.write(data); } }));

            // Get shell input writer for keyboard
            const input = shellProcess.input.getWriter();
            shellWriterRef.current = input;

            setIsRunning(true);
            setIsBooting(false);

            // Auto-run npm install && npm run dev
            await input.write('npm install && npm run dev\n');
        } catch (err: any) {
            if (term) { term.writeln(`\x1b[31m✗ Failed: ${err.message}\x1b[0m`); term.writeln('\x1b[33mℹ Requires Chromium browser\x1b[0m'); }
            setIsBooting(false);
        }
    }, [isBooting]);

    const stopServer = useCallback(() => {
        if (shellProcessRef.current) {
            shellProcessRef.current.kill();
            shellProcessRef.current = null;
            shellWriterRef.current = null;
            setIsRunning(false); setPreviewUrl('');
            if (xtermRef.current) xtermRef.current.writeln('\n\x1b[33m■ Stopped\x1b[0m');
        }
    }, []);

    // ===== File operations =====
    const createFile = useCallback((filename: string) => {
        if (!filename.trim()) return;
        if (isBlockedExtension(filename)) {
            const ext = filename.split('.').pop()?.toUpperCase();
            addToast(`❌ .${ext} files are not supported. This IDE runs on Node.js — only JS/TS/web files are supported.`, 'error');
            setShowNewFile(false); setNewFileName('');
            return;
        }
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
    }, [sessionId, autosave, switchToFile, addToast]);

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
        if (isBlockedExtension(newName)) {
            const ext = newName.split('.').pop()?.toUpperCase();
            addToast(`❌ .${ext} files are not supported. Only JS/TS/web files are allowed.`, 'error');
            setRenamingPath(null); return;
        }
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

    // Duplicate file
    const duplicateFile = useCallback((path: string) => {
        const ext = path.lastIndexOf('.');
        const newPath = ext > 0 ? path.slice(0, ext) + '-copy' + path.slice(ext) : path + '-copy';
        const content = files[path] || '';
        setFiles(prev => { const next = { ...prev, [newPath]: content }; autosave(next); return next; });
        switchToFile(newPath);
        if (webcontainerRef.current) {
            const dir = newPath.split('/').slice(0, -1).join('/');
            if (dir) webcontainerRef.current.fs.mkdir(dir, { recursive: true }).catch(() => { });
            webcontainerRef.current.fs.writeFile(newPath, content).catch(() => { });
        }
        const socket = socketService.getSocket();
        socket?.emit('code:file-create', { sessionId, path: newPath, content, senderId: socket?.id });
        setContextMenu(null);
    }, [files, sessionId, autosave, switchToFile]);

    // Create folder
    const createFolder = useCallback((parentPath?: string) => {
        const folderName = prompt('Folder name:', 'new-folder');
        if (!folderName) return;
        const fullPath = parentPath ? `${parentPath}/${folderName}` : folderName;
        // Create a .gitkeep to represent the folder
        const keepPath = `${fullPath}/.gitkeep`;
        setFiles(prev => { const next = { ...prev, [keepPath]: '' }; autosave(next); return next; });
        setExpandedDirs(prev => { const n = new Set(prev); n.add(fullPath); return n; });
        if (webcontainerRef.current) webcontainerRef.current.fs.mkdir(fullPath, { recursive: true }).catch(() => { });
        setContextMenu(null);
    }, [autosave]);

    // Save As
    const saveAs = useCallback((path: string) => {
        const newName = prompt('Save as:', path);
        if (!newName || newName === path) return;
        const content = files[path] || '';
        setFiles(prev => { const next = { ...prev, [newName]: content }; autosave(next); return next; });
        switchToFile(newName);
        if (webcontainerRef.current) {
            const dir = newName.split('/').slice(0, -1).join('/');
            if (dir) webcontainerRef.current.fs.mkdir(dir, { recursive: true }).catch(() => { });
            webcontainerRef.current.fs.writeFile(newName, content).catch(() => { });
        }
        const socket = socketService.getSocket();
        socket?.emit('code:file-create', { sessionId, path: newName, content, senderId: socket?.id });
        setContextMenu(null);
    }, [files, sessionId, autosave, switchToFile]);

    const downloadZip = useCallback(async () => {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        Object.entries(files).forEach(([p, c]) => zip.file(p, c));
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${projectTitle.replace(/\s+/g, '-').toLowerCase()}.zip`; a.click();
        URL.revokeObjectURL(url);
        addToast('Project downloaded as ZIP', 'success');
    }, [files, projectTitle, addToast]);

    // Build project
    const buildProject = useCallback(async () => {
        if (!webcontainerRef.current) { addToast('Boot the dev environment first', 'error'); return; }
        const term = xtermRef.current;
        if (term) term.writeln('\n\x1b[36m🔨 Building project (npm run build)...\x1b[0m');
        addToast('Building project...', 'info');
        setActiveTermTab('output');
        setOutputLines(prev => [...prev, '🔨 Building project (npm run build)...']);
        const build = await webcontainerRef.current.spawn('npm', ['run', 'build']);
        build.output.pipeTo(new WritableStream({ write(d) { if (term) term.write(d); setOutputLines(prev => [...prev, d]); } }));
        const code = await build.exit;
        setOutputLines(prev => [...prev, code === 0 ? '✅ Build successful!' : '❌ Build failed']);
        addToast(code === 0 ? 'Build successful!' : 'Build failed', code === 0 ? 'success' : 'error');
    }, [addToast]);

    // Run specific file in terminal
    const runFile = useCallback(async (path: string) => {
        if (!webcontainerRef.current) { addToast('Boot the dev environment first', 'error'); return; }
        const term = xtermRef.current;
        const ext = path.split('.').pop();
        const cmd = ext === 'ts' ? 'npx' : 'node';
        const args = ext === 'ts' ? ['tsx', path] : [path];
        if (term) term.writeln(`\n\x1b[36m▶ Running ${path}...\x1b[0m`);
        setOutputLines(prev => [...prev, `▶ Running ${path}...`]);
        const proc = await webcontainerRef.current.spawn(cmd, args);
        proc.output.pipeTo(new WritableStream({ write(d) { if (term) term.write(d); setOutputLines(prev => [...prev, d]); } }));
        setContextMenu(null);
    }, [addToast]);

    // Prettier format
    const formatFile = useCallback(async () => {
        const content = files[activeFile];
        if (!content) return;
        try {
            const prettier = await import('prettier/standalone');
            const babel = await import('prettier/plugins/babel');
            const ts = await import('prettier/plugins/typescript');
            const estree = await import('prettier/plugins/estree');
            const formatted = await prettier.format(content, {
                parser: activeFile.endsWith('.ts') || activeFile.endsWith('.tsx') ? 'typescript' : 'babel',
                plugins: [babel.default || babel, ts.default || ts, estree.default || estree],
                semi: true, singleQuote: true, tabWidth: 2,
            });
            setFiles(prev => { const next = { ...prev, [activeFile]: formatted }; autosave(next); return next; });
            const model = modelsRef.current.get(activeFile);
            if (model && !model.isDisposed()) { suppressSyncRef.current = true; model.setValue(formatted); suppressSyncRef.current = false; }
            if (webcontainerRef.current) webcontainerRef.current.fs.writeFile(activeFile, formatted).catch(() => { });
            addToast('Formatted with Prettier', 'success');
        } catch (e: any) { addToast(`Format error: ${e.message}`, 'error'); }
    }, [files, activeFile, autosave, addToast]);

    // Move file (drag & drop)
    const moveFile = useCallback((fromPath: string, toDir: string) => {
        const fileName = fromPath.split('/').pop()!;
        const newPath = toDir ? `${toDir}/${fileName}` : fileName;
        if (newPath === fromPath) return;
        setFiles(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(p => {
                if (p === fromPath || p.startsWith(fromPath + '/')) {
                    const renamed = newPath + p.slice(fromPath.length);
                    next[renamed] = next[p]; delete next[p];
                    const model = modelsRef.current.get(p);
                    if (model && !model.isDisposed()) model.dispose();
                    modelsRef.current.delete(p);
                }
            });
            autosave(next); return next;
        });
        setOpenTabs(prev => prev.map(t => t === fromPath || t.startsWith(fromPath + '/') ? newPath + t.slice(fromPath.length) : t));
        setActiveFile(prev => prev === fromPath || prev.startsWith(fromPath + '/') ? newPath + prev.slice(fromPath.length) : prev);
        const socket = socketService.getSocket();
        socket?.emit('code:file-rename', { sessionId, oldPath: fromPath, newPath, senderId: socket?.id });
        addToast(`Moved to ${toDir || 'root'}`, 'success');
    }, [sessionId, autosave, addToast]);

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
                    <div key={fullPath}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (draggedPath && draggedPath !== fullPath) moveFile(draggedPath, fullPath); setDraggedPath(null); }}>
                        <div className="w-full flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:bg-[#1e2030] hover:text-gray-200 transition-colors rounded group"
                            draggable onDragStart={() => setDraggedPath(fullPath)}>
                            <button onClick={() => toggleDir(fullPath)} className="flex items-center gap-1 flex-1 text-left">
                                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                                <span className="flex-1">{node.name}</span>
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, path: fullPath, type: 'directory' }); }}
                                className="p-0.5 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-white transition-opacity">
                                <MoreVertical className="w-3 h-3" />
                            </button>
                        </div>
                        {isExpanded && node.children && <div className="ml-3 border-l border-gray-800">{renderTree(node.children, fullPath)}</div>}
                    </div>
                );
            }

            const locked = isLockedByPartner(fullPath);
            return (
                <div key={fullPath}
                    className={`flex items-center gap-1.5 px-2 py-1 text-xs transition-colors rounded group cursor-pointer ${activeFile === fullPath ? 'bg-[#2d2f3f] text-white' : 'text-gray-500 hover:bg-[#1e2030] hover:text-gray-300'}`}
                    draggable onDragStart={() => setDraggedPath(fullPath)}
                    onClick={() => switchToFile(fullPath)}
                    onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, path: fullPath, type: 'file' }); }}>
                    <File className="w-3.5 h-3.5 text-gray-500" />
                    <span className="truncate flex-1 text-left">{node.name}</span>
                    {locked && <Lock className="w-3 h-3 text-yellow-500" />}
                    <button onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, path: fullPath, type: 'file' }); }}
                        className="p-0.5 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-white transition-opacity">
                        <MoreVertical className="w-3 h-3" />
                    </button>
                </div>
            );
        });
    };

    useEffect(() => { setTimeout(() => { try { fitAddonRef.current?.fit(); } catch { /* */ } }, 50); }, [terminal.size]);
    // Close context menu on click anywhere
    useEffect(() => { const h = () => setContextMenu(null); window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, []);

    const tree = buildTree();
    const activeFileLocked = isLockedByPartner(activeFile);

    return (
        <div className={`flex flex-col bg-[#0d1117] text-white ${isFullscreen ? 'fixed inset-0 z-50' : 'h-full'}`}>
            {/* Top bar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-gray-800 flex-shrink-0 overflow-hidden">
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
                    <button onClick={buildProject} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-yellow-600 hover:bg-yellow-700 text-white rounded-md transition-colors" title="Build (npm run build)">
                        <Hammer className="w-3 h-3" /> Build
                    </button>
                    <button onClick={downloadZip} className="p-1.5 text-gray-400 hover:text-white rounded" title="Download ZIP"><Download className="w-3.5 h-3.5" /></button>
                    <div className="relative group">
                        <button className="p-1.5 text-gray-400 hover:text-blue-400 rounded transition-colors" title="IDE Info">
                            <Info className="w-3.5 h-3.5" />
                        </button>
                        <div className="absolute right-0 top-full mt-1 w-80 bg-[#1e2030] border border-gray-700 rounded-xl shadow-2xl p-3.5 z-[100] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 max-h-[80vh] overflow-y-auto">
                            <p className="text-[11px] font-bold text-white mb-1">🖥️ IDE Compatibility Guide</p>
                            <p className="text-[9px] text-gray-500 mb-3">This IDE runs Node.js in the browser. Only HTTP connections are supported — no TCP sockets.</p>

                            <div className="mb-2.5">
                                <p className="text-[10px] font-semibold text-green-400 mb-1.5">✅ Will Work</p>
                                <div className="space-y-1 text-[10px] text-gray-400">
                                    <p><span className="text-green-400/70">•</span> <strong className="text-gray-300">Languages:</strong> JavaScript, TypeScript</p>
                                    <p><span className="text-green-400/70">•</span> <strong className="text-gray-300">Frameworks:</strong> React, Vue, Svelte, Angular, Next.js, Nuxt</p>
                                    <p><span className="text-green-400/70">•</span> <strong className="text-gray-300">Build:</strong> Vite, Webpack, esbuild, SWC</p>
                                    <p><span className="text-green-400/70">•</span> <strong className="text-gray-300">Backend:</strong> Express, Fastify, Hono (HTTP servers)</p>
                                    <p><span className="text-green-400/70">•</span> <strong className="text-gray-300">Styling:</strong> CSS, SASS, Tailwind, Styled-Components</p>
                                    <p><span className="text-green-400/70">•</span> <strong className="text-gray-300">Databases:</strong> Firebase, Supabase, Appwrite</p>
                                    <p><span className="text-green-400/70">•</span> <strong className="text-gray-300">Storage:</strong> localStorage, IndexedDB, JSON files</p>
                                    <p><span className="text-green-400/70">•</span> <strong className="text-gray-300">APIs:</strong> fetch, axios — any HTTP/REST API</p>
                                </div>
                            </div>

                            <div className="mb-2.5">
                                <p className="text-[10px] font-semibold text-red-400 mb-1.5">❌ Will NOT Work</p>
                                <div className="space-y-1 text-[10px] text-gray-400">
                                    <p><span className="text-red-400/70">•</span> <strong className="text-gray-300">Languages:</strong> Python, Java, Go, Rust, C/C++, PHP, Ruby, Swift</p>
                                    <p><span className="text-red-400/70">•</span> <strong className="text-gray-300">Databases:</strong> MongoDB/Mongoose, PostgreSQL, MySQL, Redis, SQLite</p>
                                    <p><span className="text-red-400/70">•</span> <strong className="text-gray-300">Why:</strong> These need TCP socket connections, which aren't available in the browser</p>
                                </div>
                            </div>

                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2.5 mb-2">
                                <p className="text-[10px] font-semibold text-blue-400 mb-1">💡 Need a database? Use these instead:</p>
                                <p className="text-[9px] text-gray-400 font-mono">npm install firebase</p>
                                <p className="text-[9px] text-gray-400 font-mono">npm install @supabase/supabase-js</p>
                                <p className="text-[9px] text-gray-500 mt-1">These connect over HTTP and work perfectly here!</p>
                            </div>

                            <div className="pt-2 border-t border-gray-700">
                                <p className="text-[9px] text-gray-500">Powered by WebContainers (StackBlitz) — Node.js runtime in the browser</p>
                            </div>
                        </div>
                    </div>
                    <button onClick={() => setEditorTheme(t => t === 'vs-dark' ? 'vs' : t === 'vs' ? 'hc-black' : 'vs-dark')}
                        className="p-1.5 text-gray-400 hover:text-white rounded" title={`Theme: ${editorTheme}`}>
                        {editorTheme === 'vs' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                    </button>
                    <span className="text-[10px] text-gray-500 px-1">{fontSize}px</span>
                    <button onClick={formatFile} className="p-1.5 text-gray-400 hover:text-white rounded" title="Format with Prettier">✨</button>
                    <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 text-gray-400 hover:text-white rounded">
                        {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    </button>
                </div>
            </div>

            {/* Main — CSS Grid ensures columns never exceed container width */}
            <div className="flex-1 overflow-hidden" style={{
                display: 'grid',
                gridTemplateColumns: `${sidebar.size}px 5px 1fr 5px ${preview.size}px`,
                minHeight: 0,
            }}>
                {/* File explorer */}
                <div className="bg-[#0d1117] border-r border-gray-800 overflow-hidden min-w-0 relative">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Explorer</span>
                        <div className="flex items-center gap-0.5">
                            <button onClick={() => createFolder()} className="p-0.5 text-gray-500 hover:text-white rounded" title="New folder"><FolderPlus className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setShowNewFile(true)} className="p-0.5 text-gray-500 hover:text-white rounded" title="New file"><Plus className="w-3.5 h-3.5" /></button>
                        </div>
                    </div>
                    {showNewFile && (
                        <div className="px-2 py-1 border-b border-gray-800">
                            <input autoFocus value={newFileName} onChange={(e) => setNewFileName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') createFile(newFileName); if (e.key === 'Escape') { setShowNewFile(false); setNewFileName(''); } }}
                                placeholder="src/components/Button.tsx"
                                className="w-full bg-[#1e2030] border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500" />
                        </div>
                    )}
                    <div className="p-1 overflow-y-auto flex-1">{renderTree(tree)}</div>
                </div>
                {/* Sidebar resize divider */}
                <ResizeDivider dividerRef={sidebar.dividerRef} />

                {/* Editor + Terminal */}
                <div className="flex flex-col min-w-0 overflow-hidden">
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

                    {/* Breadcrumb */}
                    <Breadcrumb path={activeFile} onNavigate={(dir) => {
                        setExpandedDirs(prev => { const n = new Set(prev); n.add(dir); return n; });
                    }} />

                    <div className="flex flex-1 min-h-0">
                        <div className="flex-1 relative">
                            {activeFileLocked && (
                                <div className="absolute top-0 left-0 right-0 z-10 bg-yellow-500/10 border-b border-yellow-500/30 px-3 py-1 flex items-center gap-2">
                                    <Lock className="w-3 h-3 text-yellow-500" />
                                    <span className="text-[11px] text-yellow-400">{getLockerName(activeFile)} is editing — view only</span>
                                </div>
                            )}
                            <Editor
                                height="100%" theme={editorTheme} onMount={handleEditorMount}
                                language={getLanguage(activeFile)}
                                defaultLanguage="typescript"
                                options={{
                                    minimap: { enabled: false }, fontSize,
                                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                    lineNumbers: 'on', scrollBeyondLastLine: false, automaticLayout: true,
                                    tabSize: 2, wordWrap: 'on', bracketPairColorization: { enabled: true },
                                    padding: { top: activeFileLocked ? 28 : 8, bottom: 8 }, readOnly: activeFileLocked,
                                }}
                            />
                        </div>
                    </div>

                    {/* Terminal resize handle */}
                    <ResizeDivider dividerRef={terminal.dividerRef} direction="vertical" />
                    <div className="flex-shrink-0 border-t border-gray-800 bg-[#0d1117]" style={{ height: terminal.size }}>
                        <div className="flex items-center justify-between px-3 py-1 bg-[#161b22] border-b border-gray-800">
                            <div className="flex items-center gap-0">
                                <button onClick={() => setActiveTermTab('shell')}
                                    className={`flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${activeTermTab === 'shell' ? 'text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>
                                    <Terminal className="w-3 h-3" /> Shell
                                </button>
                                <button onClick={() => setActiveTermTab('output')}
                                    className={`flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${activeTermTab === 'output' ? 'text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>
                                    Output {outputLines.length > 0 && <span className="bg-gray-700 text-[9px] px-1 rounded">{outputLines.length}</span>}
                                </button>
                            </div>
                            <div className="flex items-center gap-1">
                                {activeTermTab === 'output' && outputLines.length > 0 && (
                                    <button onClick={() => setOutputLines([])} className="text-[10px] text-gray-500 hover:text-white px-1">Clear</button>
                                )}
                                <button onClick={() => terminal.setSize(h => h === 200 ? 350 : 200)} className="p-0.5 text-gray-500 hover:text-white">
                                    {terminal.size > 200 ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                                </button>
                            </div>
                        </div>
                        <div ref={terminalRef} className="h-[calc(100%-28px)]" style={{ display: activeTermTab === 'shell' ? 'block' : 'none' }} />
                        {activeTermTab === 'output' && (
                            <div ref={outputRef} className="h-[calc(100%-28px)] overflow-y-auto p-2 font-mono text-xs text-gray-400">
                                {outputLines.length === 0 ? (
                                    <p className="text-gray-600 text-center py-4">Build & run output will appear here</p>
                                ) : outputLines.map((line, i) => (
                                    <div key={i} className="py-0.5 border-b border-gray-800/30">{line}</div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Inline Comment Panel */}
                    {commentLine !== null && (
                        <div className="absolute bottom-0 left-0 right-0 z-20 bg-[#1e2030] border-t border-blue-500/30 p-2">
                            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                                <span>💬 Comment on line {commentLine}</span>
                                <button onClick={() => { setCommentLine(null); setCommentText(''); }} className="ml-auto text-gray-500 hover:text-white"><X className="w-3 h-3" /></button>
                            </div>
                            {(comments[activeFile] || []).filter(c => c.line === commentLine).map(c => (
                                <div key={c.id} className="flex items-start gap-1.5 mb-1 text-xs">
                                    <span className="text-blue-400 font-medium">{c.userName}:</span>
                                    <span className="text-gray-300">{c.text}</span>
                                </div>
                            ))}
                            <form onSubmit={(e) => {
                                e.preventDefault();
                                if (!commentText.trim() || commentLine === null) return;
                                const newComment = { id: Date.now().toString(), line: commentLine, text: commentText, userId, userName, timestamp: Date.now() };
                                setComments(prev => ({ ...prev, [activeFile]: [...(prev[activeFile] || []), newComment] }));
                                const socket = socketService.getSocket();
                                socket?.emit('code:comment', { sessionId, filePath: activeFile, comment: newComment, senderId: socket?.id });
                                setCommentText('');
                                addToast('Comment added', 'success');
                            }} className="flex gap-1 mt-1">
                                <input value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Add a comment..."
                                    className="flex-1 bg-[#0d1117] border border-gray-700 rounded px-2 py-1 text-[11px] text-white placeholder-gray-600 outline-none focus:border-blue-500" autoFocus />
                                <button type="submit" className="px-2 py-1 bg-blue-600 text-white text-[10px] rounded hover:bg-blue-500">Add</button>
                            </form>
                        </div>
                    )}
                </div>

                {/* Preview resize divider */}
                <ResizeDivider dividerRef={preview.dividerRef} />

                {/* Preview + Mini Chat */}
                <div className="border-l border-gray-800 bg-[#161b22] flex flex-col min-w-0 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800 flex-shrink-0">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Preview</span>
                        <div className="flex items-center gap-1">
                            {previewUrl && <button onClick={() => { const f = document.getElementById('preview-iframe') as HTMLIFrameElement; if (f) f.src = previewUrl; }} className="p-0.5 text-gray-500 hover:text-white"><RefreshCw className="w-3 h-3" /></button>}
                            <button onClick={() => preview.setSize(w => w === 350 ? 500 : 350)} className="p-0.5 text-gray-500 hover:text-white">
                                {preview.size > 350 ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
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
                <div className="fixed z-50 bg-[#1e2030] border border-gray-700 rounded-lg shadow-xl py-1 min-w-[160px]" style={{ left: contextMenu.x, top: contextMenu.y }}>
                    <button onClick={() => { setRenameValue(contextMenu.path.split('/').pop() || ''); setRenamingPath(contextMenu.path); setContextMenu(null); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-[#2d2f3f] transition-colors">
                        <Pencil className="w-3 h-3" /> Rename
                    </button>
                    {contextMenu.type === 'file' && (
                        <>
                            <button onClick={() => duplicateFile(contextMenu.path)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-[#2d2f3f] transition-colors">
                                <Copy className="w-3 h-3" /> Duplicate
                            </button>
                            <button onClick={() => saveAs(contextMenu.path)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-[#2d2f3f] transition-colors">
                                <Download className="w-3 h-3" /> Save As
                            </button>
                        </>
                    )}
                    {contextMenu.type === 'directory' && (
                        <button onClick={() => createFolder(contextMenu.path)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-[#2d2f3f] transition-colors">
                            <FolderPlus className="w-3 h-3" /> New Subfolder
                        </button>
                    )}
                    {contextMenu.type === 'file' && /\.(js|ts|mjs)$/.test(contextMenu.path) && (
                        <button onClick={() => runFile(contextMenu.path)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-green-400 hover:bg-green-500/10 transition-colors">
                            <Play className="w-3 h-3" /> Run File
                        </button>
                    )}
                    <div className="border-t border-gray-700 my-0.5" />
                    <button onClick={() => { if (confirm(`Delete "${contextMenu.path}"?`)) deleteFile(contextMenu.path); else setContextMenu(null); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
                        <Trash2 className="w-3 h-3" /> Delete
                    </button>
                </div>
            )}

            {/* Quick Open Modal (Ctrl+P) */}
            {showQuickOpen && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={() => setShowQuickOpen(false)}>
                    <div className="bg-[#1e2030] border border-gray-700 rounded-xl shadow-2xl w-[420px] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
                            <span className="text-[11px]">🔍</span>
                            <input ref={quickOpenInputRef} autoFocus value={quickOpenQuery} onChange={(e) => setQuickOpenQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') setShowQuickOpen(false);
                                    if (e.key === 'Enter' && quickOpenFiles.length > 0) { switchToFile(quickOpenFiles[0]); setShowQuickOpen(false); }
                                }}
                                placeholder="Search files by name..."
                                className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none" />
                        </div>
                        <div className="max-h-[300px] overflow-y-auto">
                            {quickOpenFiles.map(path => (
                                <button key={path} onClick={() => { switchToFile(path); setShowQuickOpen(false); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-[#2d2f3f] transition-colors text-left">
                                    <File className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                                    <span className="text-gray-300 truncate">{path}</span>
                                    <span className="text-gray-600 ml-auto text-[10px]">{path.split('/').slice(0, -1).join('/')}</span>
                                </button>
                            ))}
                            {quickOpenFiles.length === 0 && <div className="px-3 py-4 text-xs text-gray-500 text-center">No files found</div>}
                        </div>
                        <div className="px-3 py-1.5 border-t border-gray-700 text-[10px] text-gray-600 flex gap-3">
                            <span>↑↓ Navigate</span><span>↵ Open</span><span>Esc Close</span>
                        </div>
                    </div>
                </div>
            )}


            {/* Toast notifications */}
            <ToastContainer toasts={toasts} />
        </div>
    );
}
