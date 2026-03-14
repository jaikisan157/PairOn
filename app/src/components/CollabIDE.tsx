import { useState, useRef, useEffect, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { WebContainer } from '@webcontainer/api';
import { Terminal as XTermTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
    FolderOpen, Folder, File, Plus, X, Play, Square, ChevronRight, ChevronDown,
    RefreshCw, Download, Maximize2, Minimize2, Terminal, MessageCircle, Send, Lock,
    Trash2, Pencil, Copy, FolderPlus, Sun, Moon, Hammer, Info,
    MoreVertical, Search, Package, Settings2, AlertTriangle,
} from 'lucide-react';
import { socketService } from '@/lib/socket';
import type * as MonacoTypes from 'monaco-editor';
import {
    useToasts, ToastContainer, Breadcrumb, usePanelResize, ResizeDivider,
    SearchPanel, PackageManagerPanel, ProjectTemplatesModal, EnvVarsPanel,
    type ProjectTemplate,
} from './CollabIDEHelpers';

// ===== Types =====
interface FileNode { name: string; type: 'file' | 'directory'; children?: FileNode[]; }
interface ChatMessage { id: string; senderId: string; content: string; timestamp: Date; type: 'text' | 'system' | 'ai'; }
interface FileLock { path: string; userId: string; userName: string; }
interface ContextMenu { x: number; y: number; path: string; type: 'file' | 'directory'; }
interface InstallProgress { active: boolean; percent: number; phase: string; startTime: number; termId: string; }

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
        // Web fundamentals
        ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
        css: 'css', scss: 'scss', sass: 'scss', less: 'less',
        html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
        json: 'json', jsonc: 'json', json5: 'json',
        md: 'markdown', mdx: 'markdown',
        // Config files
        yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini',
        env: 'shell', gitignore: 'plaintext', dockerignore: 'plaintext',
        // Shell
        sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
        bat: 'bat', cmd: 'bat', ps1: 'powershell',
        // Backend languages
        py: 'python', rb: 'ruby', php: 'php', java: 'java',
        go: 'go', rs: 'rust', cs: 'csharp', fs: 'fsharp',
        swift: 'swift', kt: 'kotlin', kts: 'kotlin', scala: 'scala',
        lua: 'lua', r: 'r', pl: 'perl', dart: 'dart',
        // Systems
        c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
        // Data / Query
        sql: 'sql', graphql: 'graphql', gql: 'graphql',
        // Misc
        dockerfile: 'dockerfile', makefile: 'plaintext',
        txt: 'plaintext', log: 'plaintext', csv: 'plaintext',
        vue: 'html', svelte: 'html', astro: 'html',
    };
    // Handle special filenames
    const name = filename.split('/').pop()?.toLowerCase() || '';
    if (name === 'dockerfile') return 'dockerfile';
    if (name === 'makefile' || name === 'cmakelists.txt') return 'plaintext';
    if (name.startsWith('.env')) return 'shell';
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
    const [newFileParent, setNewFileParent] = useState<string>(''); // which dir the new-file input is inside
    const [newItemType, setNewItemType] = useState<'file' | 'folder'>('file');
    const [folders, setFolders] = useState<Set<string>>(() => {
        const savedFolders = localStorage.getItem(`pairon_ide_folders_${sessionId}`);
        if (savedFolders) { try { return new Set(JSON.parse(savedFolders) as string[]); } catch { /* */ } }
        // Derive initial folders from file paths
        const saved = localStorage.getItem(AUTOSAVE_KEY(sessionId));
        const f = new Set<string>();
        const paths = saved ? Object.keys(JSON.parse(saved) || {}) : Object.keys(DEFAULT_FILES);
        for (const p of paths) { const segs = p.split('/'); for (let i = 1; i < segs.length; i++) f.add(segs.slice(0, i).join('/')); }
        return f;
    });

    // WebContainer & terminal
    const [, setWebcontainer] = useState<WebContainer | null>(null);
    const [isBooting, setIsBooting] = useState(false);
    const [bootProgress, setBootProgress] = useState(0);
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
    const [showIdeInfo, setShowIdeInfo] = useState(false);
    const quickOpenInputRef = useRef<HTMLInputElement>(null);

    // New panel states
    const [showSearch, setShowSearch] = useState(false);
    const [showPackageManager, setShowPackageManager] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);
    const [showEnvPanel, setShowEnvPanel] = useState(false);

    // GitHub push modal
    const [showGithubModal, setShowGithubModal] = useState(false);
    const [githubRepoName, setGithubRepoName] = useState('');
    const [githubPartnerUsername, setGithubPartnerUsername] = useState('');
    const [githubPushing, setGithubPushing] = useState(false);
    const [githubResult, setGithubResult] = useState<{ url: string; owner: string } | null>(null);

    // formatFile ref for keyboard shortcut (avoids stale closure)
    const formatFileRef = useRef<() => Promise<void>>(() => Promise.resolve());

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

    // Multi-terminal state
    interface TerminalInstance {
        id: string;
        label: string;
        term: XTermTerminal;
        fitAddon: FitAddon;
        shellProcess: any;
        shellWriter: WritableStreamDefaultWriter<string> | null;
        container: HTMLDivElement | null;
    }
    const terminalsRef = useRef<Map<string, TerminalInstance>>(new Map());
    const [terminalTabs, setTerminalTabs] = useState<{ id: string; label: string }[]>([]);
    const [activeTerminalId, setActiveTerminalId] = useState<string>('');
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suppressSyncRef = useRef(false);

    // Terminal tabs
    const [activeTermTab, setActiveTermTab] = useState<'shell' | 'output' | 'partner'>('shell');
    const outputRef = useRef<HTMLDivElement>(null);
    const [outputLines, setOutputLines] = useState<string[]>([]);

    // Partner terminal state (read-only view of partner's shell)
    const [partnerTermTabs, setPartnerTermTabs] = useState<{ id: string; label: string }[]>([]);
    const partnerTerminalsRef = useRef<Map<string, { term: XTermTerminal; fitAddon: FitAddon; container: HTMLDivElement | null }>>(new Map());
    const partnerTermContainerRef = useRef<HTMLDivElement>(null);
    const [activePartnerTermId, setActivePartnerTermId] = useState<string>('');
    // Terminal activity locks: terminalId -> { userId, userName } of the person currently typing
    const [terminalLocks, setTerminalLocks] = useState<Map<string, { userId: string; userName: string }>>(new Map());
    const terminalUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // npm install progress
    const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);
    const installProgressRef = useRef<InstallProgress | null>(null);
    // Refs for accessing latest state in socket callbacks without stale closures
    const foldersRef = useRef<Set<string>>(new Set());
    const previewUrlRef = useRef<string>('');
    const stateUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Track who owns .env (socket.id of the person who last saved it)
    const envOwnerRef = useRef<string>('');

    // Inline comments
    const [comments, setComments] = useState<Record<string, { id: string; line: number; text: string; userId: string; userName: string; timestamp: number }[]>>({});
    const [commentLine, setCommentLine] = useState<number | null>(null);
    const [commentText, setCommentText] = useState('');

    useEffect(() => { filesRef.current = files; }, [files]);
    useEffect(() => { foldersRef.current = folders; }, [folders]);
    useEffect(() => { previewUrlRef.current = previewUrl; }, [previewUrl]);

    // Unread count
    const unreadCount = showMiniChat ? 0 : Math.max(0, messages.length - lastSeenMessageCount);
    useEffect(() => {
        if (showMiniChat) { miniChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); onMessagesSeen(messages.length); }
    }, [messages.length, showMiniChat, onMessagesSeen]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'p' && !e.shiftKey) {
                e.preventDefault(); setShowQuickOpen(true); setQuickOpenQuery('');
                setTimeout(() => quickOpenInputRef.current?.focus(), 50);
            }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
                e.preventDefault(); setShowSearch(s => !s);
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 's' && !e.shiftKey) {
                e.preventDefault(); formatFileRef.current();
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
            // Sync state to backend so rejoining partner gets the latest file snapshot
            const socket = socketService.getSocket();
            socket?.emit('ide:state-update', {
                sessionId,
                files: updated,
                folders: [...foldersRef.current],
                previewUrl: previewUrlRef.current,
            });
        }, AUTOSAVE_DEBOUNCE);
    }, [sessionId]);

    // Persist explicit folders whenever they change
    useEffect(() => {
        localStorage.setItem(`pairon_ide_folders_${sessionId}`, JSON.stringify([...folders]));
    }, [folders, sessionId]);

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

        // Configure TypeScript to support JSX (fixes red underlines for .tsx/.jsx files)
        monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
            target: monaco.languages.typescript.ScriptTarget.Latest,
            module: monaco.languages.typescript.ModuleKind.ESNext,
            moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
            jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
            jsxImportSource: 'react',
            allowJs: true,
            allowSyntheticDefaultImports: true,
            esModuleInterop: true,
            forceConsistentCasingInFileNames: true,
            strict: false,
            skipLibCheck: true,
            noEmit: true,
            isolatedModules: true,
            resolveJsonModule: true,
        });
        monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
            target: monaco.languages.typescript.ScriptTarget.Latest,
            module: monaco.languages.typescript.ModuleKind.ESNext,
            jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
            allowJs: true,
            allowSyntheticDefaultImports: true,
            esModuleInterop: true,
        });
        // Suppress false positives — JSX errors (2792, 17004) and missing module path errors (2307)
        const diagnosticCodesToIgnore = [2307, 2304, 2552, 7016, 1259, 2691, 1005, 2792, 17004, 6133, 6196];
        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: false,
            noSyntaxValidation: false,
            diagnosticCodesToIgnore,
        });
        monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: false,
            noSyntaxValidation: false,
            diagnosticCodesToIgnore,
        });
        // Inject minimal react & react/jsx-runtime type stubs so Monaco doesn't complain about missing modules
        const reactStub = `declare module 'react' {
  export = React;
  export as namespace React;
  namespace React {
    type ReactNode = any;
    type ReactElement = any;
    type FC<P = {}> = (props: P) => ReactElement | null;
    type CSSProperties = Record<string, any>;
    function useState<T>(v: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void];
    function useEffect(f: () => void | (() => void), deps?: any[]): void;
    function useCallback<T extends (...args: any[]) => any>(f: T, deps: any[]): T;
    function useRef<T>(v: T): { current: T };
    function useMemo<T>(f: () => T, deps: any[]): T;
    function useContext<T>(ctx: React.Context<T>): T;
    function createContext<T>(v: T): React.Context<T>;
    interface Context<T> { Provider: any; Consumer: any; }
    const StrictMode: any;
    const Fragment: any;
    const Suspense: any;
    function forwardRef<T, P = {}>(render: (props: P, ref: any) => ReactElement | null): any;
    function memo<T>(c: T): T;
    function lazy<T>(f: () => Promise<{ default: T }>): T;
  }
}`;
        const jsxRuntimeStub = `declare module 'react/jsx-runtime' {
  export function jsx(type: any, props: any, key?: any): any;
  export function jsxs(type: any, props: any, key?: any): any;
  export const Fragment: any;
}`;
        monaco.languages.typescript.typescriptDefaults.addExtraLib(reactStub, 'file:///node_modules/@types/react/index.d.ts');
        monaco.languages.typescript.typescriptDefaults.addExtraLib(jsxRuntimeStub, 'file:///node_modules/react/jsx-runtime.d.ts');
        monaco.languages.typescript.javascriptDefaults.addExtraLib(reactStub, 'file:///node_modules/@types/react/index.d.ts');
        monaco.languages.typescript.javascriptDefaults.addExtraLib(jsxRuntimeStub, 'file:///node_modules/react/jsx-runtime.d.ts');

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

    // ===== Initialize first terminal =====
    useEffect(() => {
        if (!terminalRef.current || xtermRef.current) return;
        const term = new XTermTerminal({
            theme: { background: '#0d1117', foreground: '#c9d1d9', cursor: '#58a6ff', cursorAccent: '#0d1117', selectionBackground: '#264f78' },
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace", fontSize: 13, cursorBlink: true, convertEol: true,
            allowProposedApi: true,
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        // Create a dedicated child container so multiple terminals can coexist
        const container = document.createElement('div');
        container.style.cssText = 'width:100%;height:100%;position:absolute;top:0;left:0;';
        terminalRef.current.appendChild(container);
        term.open(container);
        setTimeout(() => { try { fitAddon.fit(); } catch { /* */ } }, 100);
        xtermRef.current = term; fitAddonRef.current = fitAddon;
        term.writeln('\x1b[1;35m╔══════════════════════════════════════════════════╗\x1b[0m');
        term.writeln('\x1b[1;35m║        🚀 PairOn Collaborative IDE          ║\x1b[0m');
        term.writeln('\x1b[1;35m╚══════════════════════════════════════════════════╝\x1b[0m');
        term.writeln('');
        term.writeln('\x1b[1;37m  This IDE runs Node.js in the browser (WebContainers).\x1b[0m');
        term.writeln('\x1b[1;37m  It only supports HTTP connections — no raw TCP sockets.\x1b[0m');
        term.writeln('');
        term.writeln('\x1b[1;32m  ✅ WILL WORK:\x1b[0m JS, TS, React, Vue, Svelte, Next.js, Express');
        term.writeln('\x1b[1;31m  ❌ WON\'T WORK:\x1b[0m Python, Java, Go, MongoDB, PostgreSQL (need TCP)');
        term.writeln('');
        term.writeln('\x1b[1;36m  ⌨  Shortcuts:\x1b[0m Ctrl+S = Format  │  Ctrl+Shift+F = Search  │  Ctrl+P = Quick Open');
        term.writeln('\x1b[1;36m  📦 Packages:\x1b[0m  Click the package icon in the toolbar to manage npm dependencies');
        term.writeln('\x1b[33m  Click ▶ Run or type commands below.\x1b[0m');
        term.writeln('');

        // Pipe keyboard input to the active shell process, and emit lock to partner
        term.onData((data: string) => {
            if (shellWriterRef.current) {
                shellWriterRef.current.write(data);
            }
            const socket = socketService.getSocket();
            socket?.emit('terminal:lock', sessionId, { terminalId: firstId, userName });
            if (terminalUnlockTimerRef.current) clearTimeout(terminalUnlockTimerRef.current);
            terminalUnlockTimerRef.current = setTimeout(() => {
                socket?.emit('terminal:unlock', sessionId, { terminalId: firstId });
            }, 4000);
        });

        // Store as first terminal instance
        const firstId = 'term-1';

        // Notify partner a new terminal is open
        socketService.getSocket()?.emit('terminal:create', sessionId, { terminalId: firstId, label: 'bash' });
        terminalsRef.current.set(firstId, {
            id: firstId, label: 'bash', term, fitAddon,
            shellProcess: null, shellWriter: null, container,
        });
        setTerminalTabs([{ id: firstId, label: 'bash' }]);
        setActiveTerminalId(firstId);

        const ro = new ResizeObserver(() => { try { fitAddon.fit(); } catch { /* */ } });
        ro.observe(container);
        return () => { ro.disconnect(); term.dispose(); xtermRef.current = null; terminalsRef.current.clear(); };
    }, []);

    // ===== Switch active terminal (show/hide containers) =====
    useEffect(() => {
        if (activeTermTab !== 'shell' || !activeTerminalId) return;
        terminalsRef.current.forEach((inst, id) => {
            if (inst.container) inst.container.style.display = id === activeTerminalId ? 'block' : 'none';
        });
        const active = terminalsRef.current.get(activeTerminalId);
        if (active) {
            xtermRef.current = active.term;
            fitAddonRef.current = active.fitAddon;
            shellWriterRef.current = active.shellWriter;
            setTimeout(() => { try { active.fitAddon.fit(); } catch { /* */ } }, 50);
        }
    }, [activeTerminalId, activeTermTab]);

    // ===== Close a terminal tab =====
    const closeTerminal = useCallback((id: string) => {
        const inst = terminalsRef.current.get(id);
        if (!inst) return;
        try { inst.shellProcess?.kill(); } catch { /* */ }
        inst.shellWriter?.close().catch(() => { });
        inst.term.dispose();
        inst.container?.remove();
        terminalsRef.current.delete(id);
        socketService.getSocket()?.emit('terminal:close', sessionId, { terminalId: id });
        setTerminalTabs(prev => {
            const remaining = prev.filter(t => t.id !== id);
            if (remaining.length > 0) setActiveTerminalId(remaining[remaining.length - 1].id);
            return remaining;
        });
    }, [sessionId]);

    // ===== Switch active partner terminal (show/hide containers) =====
    useEffect(() => {
        if (!activePartnerTermId) return;
        partnerTerminalsRef.current.forEach((inst, id) => {
            if (inst.container) inst.container.style.display = id === activePartnerTermId ? 'block' : 'none';
        });
        const active = partnerTerminalsRef.current.get(activePartnerTermId);
        if (active) setTimeout(() => { try { active.fitAddon.fit(); } catch { /* */ } }, 50);
    }, [activePartnerTermId]);

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
            // Track env owner: whoever sent this file create owns it
            if (data.path === '.env' || data.path.startsWith('.env.')) {
                envOwnerRef.current = data.senderId;
            }
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

        // ===== IDE state sync handlers =====
        const handleStateSnapshot = (data: { files: Record<string, string>; folders: string[]; previewUrl?: string }) => {
            setFiles(data.files);
            filesRef.current = data.files;
            // Refresh Monaco models for changed files
            Object.entries(data.files).forEach(([path, content]) => {
                const model = modelsRef.current.get(path);
                if (model && !model.isDisposed() && model.getValue() !== content) {
                    suppressSyncRef.current = true;
                    model.setValue(content);
                    suppressSyncRef.current = false;
                }
            });
            if (data.folders?.length) setFolders(new Set(data.folders));
            if (data.previewUrl) setPreviewUrl(data.previewUrl);
            if (webcontainerRef.current) {
                Object.entries(data.files).forEach(([path, content]) => {
                    webcontainerRef.current!.fs.writeFile(path, content).catch(() => {});
                });
            }
            localStorage.setItem(AUTOSAVE_KEY(sessionId), JSON.stringify(data.files));
        };

        const handlePartnerRejoined = () => {
            socket.emit('ide:push-state', {
                sessionId,
                files: filesRef.current,
                folders: [...foldersRef.current],
                previewUrl: previewUrlRef.current,
            });
        };

        const handlePartnerPreviewUrl = (url: string) => { setPreviewUrl(url); };

        // ===== Partner terminal handlers =====
        const handlePartnerTermCreate = (data: { terminalId: string; label: string }) => {
            if (partnerTerminalsRef.current.has(data.terminalId)) return;
            if (!partnerTermContainerRef.current) return;
            const container = document.createElement('div');
            container.style.cssText = 'width:100%;height:100%;position:absolute;top:0;left:0;display:none';
            partnerTermContainerRef.current.appendChild(container);
            const term = new XTermTerminal({
                theme: { background: '#0d1117', foreground: '#a8d8a8', cursor: '#58a6ff', selectionBackground: '#264f78' },
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 13, cursorBlink: false, convertEol: true,
                disableStdin: true,
            });
            const fitAddon = new FitAddon();
            term.loadAddon(fitAddon);
            term.open(container);
            setTimeout(() => { try { fitAddon.fit(); } catch { /* */ } }, 50);
            partnerTerminalsRef.current.set(data.terminalId, { term, fitAddon, container });
            const ro = new ResizeObserver(() => { try { fitAddon.fit(); } catch { /* */ } });
            ro.observe(container);
            setPartnerTermTabs(prev => {
                if (prev.find(t => t.id === data.terminalId)) return prev;
                return [...prev, { id: data.terminalId, label: data.label }];
            });
            setActivePartnerTermId(prev => prev || data.terminalId);
        };

        const handlePartnerTermClose = (data: { terminalId: string }) => {
            const inst = partnerTerminalsRef.current.get(data.terminalId);
            if (inst) { inst.term.dispose(); inst.container?.remove(); partnerTerminalsRef.current.delete(data.terminalId); }
            setPartnerTermTabs(prev => prev.filter(t => t.id !== data.terminalId));
            setActivePartnerTermId(prev => prev === data.terminalId ? (partnerTerminalsRef.current.keys().next().value ?? '') : prev);
        };

        const handlePartnerOutput = (data: { terminalId: string; chunk: string; label: string }) => {
            const inst = partnerTerminalsRef.current.get(data.terminalId);
            if (inst) {
                inst.term.write(data.chunk);
            } else {
                // Auto-create if we missed the terminal:partner-create event
                handlePartnerTermCreate({ terminalId: data.terminalId, label: data.label || 'bash' });
                const newInst = partnerTerminalsRef.current.get(data.terminalId);
                if (newInst) newInst.term.write(data.chunk);
            }
        };

        const handlePartnerLock = (data: { terminalId: string; userId: string; userName: string }) => {
            setTerminalLocks(prev => { const n = new Map(prev); n.set(data.terminalId, { userId: data.userId, userName: data.userName }); return n; });
        };
        const handlePartnerUnlock = (data: { terminalId: string }) => {
            setTerminalLocks(prev => { const n = new Map(prev); n.delete(data.terminalId); return n; });
        };

        socket.on('ide:state-snapshot', handleStateSnapshot);
        socket.on('ide:partner-rejoined', handlePartnerRejoined);
        socket.on('ide:partner-preview-url', handlePartnerPreviewUrl);
        socket.on('terminal:partner-create', handlePartnerTermCreate);
        socket.on('terminal:partner-close', handlePartnerTermClose);
        socket.on('terminal:partner-output', handlePartnerOutput);
        socket.on('terminal:partner-lock', handlePartnerLock);
        socket.on('terminal:partner-unlock', handlePartnerUnlock);

        return () => {
            socket.off('code:file-change', handleFileChange);
            socket.off('code:file-create', handleFileCreate);
            socket.off('code:file-delete', handleFileDelete);
            socket.off('code:file-rename', handleFileRename);
            socket.off('code:file-lock', handleFileLock);
            socket.off('code:file-unlock', handleFileUnlock);
            socket.off('code:comment', handleComment);
            socket.off('ide:state-snapshot', handleStateSnapshot);
            socket.off('ide:partner-rejoined', handlePartnerRejoined);
            socket.off('ide:partner-preview-url', handlePartnerPreviewUrl);
            socket.off('terminal:partner-create', handlePartnerTermCreate);
            socket.off('terminal:partner-close', handlePartnerTermClose);
            socket.off('terminal:partner-output', handlePartnerOutput);
            socket.off('terminal:partner-lock', handlePartnerLock);
            socket.off('terminal:partner-unlock', handlePartnerUnlock);
        };
    }, [autosave, sessionId]);

    // ===== File locking =====
    const lockFile = useCallback((path: string) => {
        const socket = socketService.getSocket();
        socket?.emit('code:file-lock', { sessionId, path, userId, userName });
        if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
        lockTimeoutRef.current = setTimeout(() => { socket?.emit('code:file-unlock', { sessionId, path, userId }); }, 3000);
    }, [sessionId, userId, userName]);

    const isLockedByPartner = useCallback((path: string) => { const l = fileLocks.get(path); return l && l.userId !== userId; }, [fileLocks, userId]);
    const getLockerName = useCallback((path: string) => fileLocks.get(path)?.userName || 'Partner', [fileLocks]);

    // ===== npm install progress parser =====
    const parseNpmOutput = useCallback((data: string, termId: string) => {
        const plain = data.replace(/\x1b\[[0-9;]*[mGKH]/g, '');
        const cur = installProgressRef.current;
        if (!cur?.active && /npm +(install|i)\b/.test(plain)) {
            const next: InstallProgress = { active: true, percent: 2, phase: 'Initializing…', startTime: Date.now(), termId };
            installProgressRef.current = next;
            setInstallProgress(next);
            return;
        }
        if (!cur?.active) return;
        let next = { ...cur };
        if (/idealTree|resolve/.test(plain)) {
            next = { ...cur, percent: Math.max(cur.percent, 15), phase: 'Resolving dependencies…' };
        } else if (/reify|extract/.test(plain)) {
            next = { ...cur, percent: Math.max(cur.percent, 42), phase: 'Extracting packages…' };
        } else if (/http fetch/.test(plain)) {
            next = { ...cur, percent: Math.min(82, cur.percent + 1), phase: 'Downloading packages…' };
        } else if (/added \d+ package/.test(plain)) {
            const done: InstallProgress = { ...cur, percent: 100, phase: 'Done!' };
            installProgressRef.current = done;
            setInstallProgress(done);
            setTimeout(() => { installProgressRef.current = null; setInstallProgress(null); }, 2500);
            return;
        } else {
            return;
        }
        installProgressRef.current = next;
        setInstallProgress(next);
    }, []);

    // ===== Boot WebContainer (auto-boots on mount for immediate terminal) =====
    const bootWebContainer = useCallback(async () => {
        if (webcontainerRef.current || isBooting) return;
        setIsBooting(true);
        setBootProgress(10);
        const term = xtermRef.current;
        if (term) term.writeln('\x1b[36m⏳ Booting development environment...\x1b[0m');
        try {
            setBootProgress(20);
            const wc = await WebContainer.boot();
            setBootProgress(40);
            webcontainerRef.current = wc; setWebcontainer(wc);
            await wc.mount(toWebContainerFS(filesRef.current));
            setBootProgress(60);
            if (term) term.writeln('\x1b[32m✓ Files mounted\x1b[0m');
            wc.on('server-ready', (_port: number, url: string) => {
                setPreviewUrl(url);
                if (term) term.writeln(`\x1b[32m✓ Preview ready at ${url}\x1b[0m`);
                const socket = socketService.getSocket();
                socket?.emit('ide:preview-url', sessionId, url);
            });

            setBootProgress(75);
            // Spawn an interactive shell (like VS Code terminal)
            const shellProcess = await wc.spawn('jsh', { terminal: { cols: term?.cols || 80, rows: term?.rows || 24 } });
            shellProcessRef.current = shellProcess;

            // Pipe shell output to xterm and relay to partner
            const firstId = 'term-1';
            shellProcess.output.pipeTo(new WritableStream({
                write(data) {
                    if (term) term.write(data);
                    parseNpmOutput(data, firstId);
                    const socket = socketService.getSocket();
                    socket?.emit('terminal:output', sessionId, { terminalId: firstId, chunk: data, label: 'bash' });
                },
            }));

            // Get shell input writer for keyboard
            const input = shellProcess.input.getWriter();
            shellWriterRef.current = input;

            // Update first terminal instance with the live shell
            const firstInst = terminalsRef.current.get('term-1');
            if (firstInst) { firstInst.shellProcess = shellProcess; firstInst.shellWriter = input; }

            setBootProgress(100);
            setIsBooting(false);
            if (term) term.writeln('\x1b[32m✓ Shell ready — you can type commands now\x1b[0m\n');
        } catch (err: any) {
            if (term) { term.writeln(`\x1b[31m✗ Failed: ${err.message}\x1b[0m`); term.writeln('\x1b[33mℹ Requires Chromium browser\x1b[0m'); }
            setIsBooting(false);
            setBootProgress(0);
        }
    }, [isBooting]);

    // Auto-boot WebContainer when IDE mounts
    useEffect(() => {
        // Small delay to let terminal initialize first
        const timer = setTimeout(() => { bootWebContainer(); }, 500);
        return () => clearTimeout(timer);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Cleanup WebContainer and Monaco models on unmount
    useEffect(() => {
        return () => {
            // Kill shell processes
            try { shellProcessRef.current?.kill(); } catch { /* */ }
            terminalsRef.current.forEach(inst => {
                try { inst.shellProcess?.kill(); } catch { /* */ }
                inst.shellWriter?.close().catch(() => { });
                inst.term.dispose();
            });
            terminalsRef.current.clear();
            // Dispose all Monaco models
            modelsRef.current.forEach(model => { if (!model.isDisposed()) model.dispose(); });
            modelsRef.current.clear();
            // Teardown WebContainer
            if (webcontainerRef.current) {
                try { (webcontainerRef.current as any).teardown?.(); } catch { /* */ }
                webcontainerRef.current = null;
            }
            // Clear autosave timer
            if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
            if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
            if (terminalUnlockTimerRef.current) clearTimeout(terminalUnlockTimerRef.current);
            if (stateUpdateTimerRef.current) clearTimeout(stateUpdateTimerRef.current);
            // Dispose partner terminals
            partnerTerminalsRef.current.forEach(inst => { inst.term.dispose(); inst.container?.remove(); });
            partnerTerminalsRef.current.clear();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
            setShowNewFile(false); setNewFileName(''); setNewFileParent('');
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
        setShowNewFile(false); setNewFileName(''); setNewFileParent('');
        // Register parent dirs in folders set & auto-expand
        const parts = filename.split('/');
        if (parts.length > 1) {
            setFolders(prev => { const n = new Set(prev); for (let i = 1; i < parts.length; i++) n.add(parts.slice(0, i).join('/')); return n; });
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

    // Create folder — open inline input (no prompt)
    const createFolder = useCallback((parentPath?: string) => {
        setShowNewFile(true);
        setNewFileParent(parentPath || '');
        setNewItemType('folder');
        setNewFileName('');
        if (parentPath) {
            setExpandedDirs(prev => { const n = new Set(prev); n.add(parentPath); return n; });
        }
        setContextMenu(null);
    }, []);

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
        // Never include .env in the download — security
        Object.entries(files).forEach(([p, c]) => {
            if (p === '.env' || p.startsWith('.env.')) return;
            zip.file(p, c);
        });
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${projectTitle.replace(/\s+/g, '-').toLowerCase()}.zip`; a.click();
        URL.revokeObjectURL(url);
        addToast('Project downloaded as ZIP (⚠️ .env excluded for security)', 'success');
    }, [files, projectTitle, addToast]);

    // Push to GitHub
    const pushToGitHub = useCallback(async () => {
        if (!githubRepoName.trim()) {
            addToast('Please enter a repo name', 'error');
            return;
        }
        setGithubPushing(true);
        setGithubResult(null);
        try {
            // Fetch stored token from backend
            const pairon_token = localStorage.getItem('pairon_token') || '';
            const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
            const tokenRes = await fetch(`${API}/api/auth/github/token`, {
                headers: { Authorization: `Bearer ${pairon_token}` },
            });
            if (!tokenRes.ok) {
                throw new Error('GitHub not connected. Please connect your GitHub account in Profile settings first.');
            }
            const { token: storedToken, username: ghUsername } = await tokenRes.json();
            const owner = ghUsername as string;
            const headers = {
                Authorization: `token ${storedToken}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json',
            };
            const remoteToken = storedToken as string;

            // 2. Create the repository
            const repoName = githubRepoName.trim().replace(/\s+/g, '-').toLowerCase();
            const createRes = await fetch('https://api.github.com/user/repos', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: repoName,
                    description: `${projectTitle} — built collaboratively on PairOn`,
                    private: false,
                    auto_init: false,
                }),
            });
            if (!createRes.ok) {
                const err = await createRes.json().catch(() => ({}));
                // Handle name already taken
                const msg = err.message || '';
                const errDetails = (err.errors || []).map((e: any) => e.message).join(', ');
                if (msg.toLowerCase().includes('already exists') || errDetails.toLowerCase().includes('already exists')) {
                    throw new Error(`Repo "${repoName}" already exists on your GitHub. Change the repo name and try again.`);
                }
                throw new Error(`GitHub API error (${createRes.status}): ${errDetails || msg || 'Failed to create repository'}`);
            }

            // 3. Add partner as collaborator (if provided)
            if (githubPartnerUsername.trim()) {
                await fetch(
                    `https://api.github.com/repos/${owner}/${repoName}/collaborators/${githubPartnerUsername.trim()}`,
                    { method: 'PUT', headers, body: JSON.stringify({ permission: 'push' }) }
                ).catch(() => { /* non-fatal */ });
            }

            const repoUrl = `https://github.com/${owner}/${repoName}`;
            const remoteWithToken = `https://${remoteToken}@github.com/${owner}/${repoName}.git`;

            // 4. Run git commands in the terminal
            setGithubResult({ url: repoUrl, owner });
            setShowGithubModal(false);
            addToast('🎉 Repo created! Running git push in terminal...', 'success');

            // Switch to terminal tab
            setActiveTermTab('shell');

            // Write git commands to the active shell after small delay
            await new Promise(r => setTimeout(r, 600));
            const writer = shellWriterRef.current;
            if (writer) {
                const cmds = [
                    'git init\n',
                    'git add .\n',
                    `git commit -m "Initial commit — built on PairOn"\n`,
                    `git remote add origin ${remoteWithToken}\n`,
                    'git branch -M main\n',
                    'git push -u origin main\n',
                ];
                for (const cmd of cmds) {
                    await writer.write(cmd);
                    await new Promise(r => setTimeout(r, 400));
                }
            } else {
                // Fallback: show commands in toast for user to copy-paste
                addToast('Boot the terminal first, then run: git init && git add . && git commit -m "init" && git push', 'info');
            }


        } catch (err: any) {
            addToast(err.message || 'Failed to push to GitHub', 'error');
        } finally {
            setGithubPushing(false);
        }
    }, [githubRepoName, githubPartnerUsername, projectTitle, addToast, setActiveTermTab, setShowGithubModal]);

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

    // Keep formatFileRef in sync (lets keyboard shortcut call the latest version)
    useEffect(() => { formatFileRef.current = formatFile; }, [formatFile]);

    // ===== Replace in file (for global search replace) =====
    const replaceInFile = useCallback((path: string, oldText: string, newText: string) => {
        const content = filesRef.current[path] || '';
        const updated = content.split(oldText).join(newText);
        setFiles(prev => { const next = { ...prev, [path]: updated }; autosave(next); return next; });
        const model = modelsRef.current.get(path);
        if (model && !model.isDisposed()) {
            suppressSyncRef.current = true;
            model.setValue(updated);
            suppressSyncRef.current = false;
        }
        if (webcontainerRef.current) webcontainerRef.current.fs.writeFile(path, updated).catch(() => { });
        addToast(`Replaced in ${path}`, 'success');
    }, [autosave, addToast]);

    // ===== Package install/uninstall =====
    const installPackage = useCallback((pkg: string, isDev = false) => {
        if (!shellWriterRef.current) { addToast('Boot the dev environment first (click ▶ Run)', 'error'); return; }
        const cmd = `npm install ${isDev ? '--save-dev ' : ''}${pkg}\n`;
        shellWriterRef.current.write(cmd);
        setActiveTermTab('shell');
        addToast(`Installing ${pkg}…`, 'info');
        setShowPackageManager(false);
    }, [addToast]);

    const uninstallPackage = useCallback((pkg: string) => {
        if (!shellWriterRef.current) { addToast('Boot the dev environment first', 'error'); return; }
        shellWriterRef.current.write(`npm uninstall ${pkg}\n`);
        setActiveTermTab('shell');
        addToast(`Uninstalling ${pkg}…`, 'info');
    }, [addToast]);

    // ===== Apply project template =====
    const applyTemplate = useCallback((template: ProjectTemplate) => {
        // Dispose all existing models
        for (const [, model] of modelsRef.current) { if (!model.isDisposed()) model.dispose(); }
        modelsRef.current.clear();
        // Replace file state
        const newFiles = { ...template.files };
        setFiles(newFiles);
        autosave(newFiles);
        // Derive folders
        const newFolders = new Set<string>();
        for (const p of Object.keys(newFiles)) {
            const parts = p.split('/');
            for (let i = 1; i < parts.length; i++) newFolders.add(parts.slice(0, i).join('/'));
        }
        setFolders(newFolders);
        setExpandedDirs(new Set(newFolders));
        // Open first meaningful file
        const entryFile = Object.keys(newFiles).find(f => f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.js')) || Object.keys(newFiles)[0];
        setOpenTabs([entryFile]);
        setActiveFile(entryFile);
        // Re-mount files in WebContainer
        if (webcontainerRef.current) {
            webcontainerRef.current.mount(toWebContainerFS(newFiles));
        }
        addToast(`Applied template: ${template.name}`, 'success');
    }, [autosave, addToast]);

    // ===== Auto-detect node_modules before running =====
    const runProjectWithAutoInstall = useCallback(async () => {
        if (!shellWriterRef.current) {
            await bootWebContainer();
        }
        if (shellWriterRef.current) {
            setIsRunning(true);
            // Check if package.json exists and auto-install before dev
            const hasPkgJson = Boolean(filesRef.current['package.json']);
            const cmd = hasPkgJson
                ? 'npm install && npm run dev\n'
                : 'npm run dev\n';
            shellWriterRef.current.write(cmd);
            setActiveTermTab('shell');
        }
    }, [bootWebContainer]);
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

        // Helper to ensure a directory node exists in the tree
        const ensureDir = (dirPath: string) => {
            if (dirMap.has(dirPath)) return;
            const parts = dirPath.split('/');
            // Ensure parents first
            for (let i = 1; i <= parts.length; i++) {
                const dp = parts.slice(0, i).join('/');
                if (dirMap.has(dp)) continue;
                const dirNode: FileNode = { name: parts[i - 1], type: 'directory', children: [] };
                dirMap.set(dp, dirNode);
                if (i === 1) {
                    if (!root.find(n => n.name === parts[0] && n.type === 'directory')) root.push(dirNode);
                } else {
                    const parentPath = parts.slice(0, i - 1).join('/');
                    const parent = dirMap.get(parentPath);
                    if (parent && !parent.children?.find(c => c.name === parts[i - 1] && c.type === 'directory')) {
                        parent.children?.push(dirNode);
                    }
                }
            }
        };

        // Register all explicit folders first
        for (const f of folders) ensureDir(f);

        // Add files
        const paths = Object.keys(files).filter(p => !p.endsWith('/.gitkeep')).sort();
        for (const path of paths) {
            const parts = path.split('/');
            if (parts.length === 1) {
                if (!root.find(n => n.name === parts[0] && n.type === 'file')) {
                    root.push({ name: parts[0], type: 'file' });
                }
                continue;
            }
            // Ensure parent dirs exist
            ensureDir(parts.slice(0, -1).join('/'));
            const parentDir = dirMap.get(parts.slice(0, -1).join('/'));
            const fileName = parts[parts.length - 1];
            if (parentDir && !parentDir.children?.find(c => c.name === fileName && c.type === 'file')) {
                parentDir.children?.push({ name: fileName, type: 'file' });
            }
        }
        return root;
    }, [files, folders]);

    const renderTree = (nodes: FileNode[], prefix = '') => {
        const sorted = [...nodes].sort((a, b) => { if (a.type !== b.type) return a.type === 'directory' ? -1 : 1; return a.name.localeCompare(b.name); });
        return sorted.map(node => {
            const fullPath = prefix ? `${prefix}/${node.name}` : node.name;
            // Detect .env files and whether this file belongs to the partner
            const isEnvFile = fullPath === '.env' || fullPath.startsWith('.env.');
            // isPartnerEnv = true when the env was saved by the partner (not by us)
            const isPartnerEnv = isEnvFile && envOwnerRef.current !== '' && envOwnerRef.current !== socketService.getSocket()?.id;

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
                            draggable onDragStart={() => setDraggedPath(fullPath)}
                            onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, path: fullPath, type: 'directory' }); }}>
                            <button onClick={() => toggleDir(fullPath)} className="flex items-center gap-1 flex-1 text-left">
                                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                {isExpanded ? <FolderOpen className="w-3.5 h-3.5 text-blue-400" /> : <Folder className="w-3.5 h-3.5 text-blue-400" />}
                                <span className="flex-1">{node.name}</span>
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, path: fullPath, type: 'directory' }); }}
                                className="p-0.5 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-white transition-opacity">
                                <MoreVertical className="w-3 h-3" />
                            </button>
                        </div>
                        {isExpanded && (
                            <div className="ml-3 border-l border-gray-800">
                                {/* Inline new-file/folder input for this directory */}
                                {showNewFile && newFileParent === fullPath && (
                                    <div className="px-2 py-0.5">
                                        <input autoFocus value={newFileName} onChange={(e) => setNewFileName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && newFileName.trim()) {
                                                    if (newItemType === 'folder') {
                                                        const fullFolderPath = `${fullPath}/${newFileName.trim()}`;
                                                        setFolders(prev => { const n = new Set(prev); n.add(fullFolderPath); return n; });
                                                        setExpandedDirs(prev => { const n = new Set(prev); n.add(fullFolderPath); return n; });
                                                        webcontainerRef.current?.fs.mkdir(fullFolderPath, { recursive: true }).catch(() => {});
                                                        setShowNewFile(false); setNewFileName(''); setNewFileParent('');
                                                    } else {
                                                        createFile(`${fullPath}/${newFileName}`);
                                                    }
                                                }
                                                if (e.key === 'Escape') { setShowNewFile(false); setNewFileName(''); setNewFileParent(''); }
                                            }}
                                            onBlur={() => { setShowNewFile(false); setNewFileName(''); setNewFileParent(''); }}
                                            placeholder={newItemType === 'folder' ? 'folder-name' : 'filename.tsx'}
                                            className="w-full bg-[#1e2030] border border-blue-500 rounded px-1.5 py-0.5 text-xs text-white placeholder-gray-600 outline-none" />
                                    </div>
                                )}
                                {node.children && renderTree(node.children, fullPath)}
                            </div>
                        )}
                    </div>
                );
            }

            const locked = isLockedByPartner(fullPath);

            // 🔒 Partner's .env — show masked panel instead of blocking
            if (isPartnerEnv) {
                return (
                    <div key={fullPath}
                        className="flex items-center gap-1.5 px-2 py-1 text-xs rounded cursor-pointer text-yellow-600 hover:bg-yellow-400/10 transition-colors"
                        onClick={() => setShowEnvPanel(true)}
                        title="Partner's .env (values hidden)"
                    >
                        <Lock className="w-3.5 h-3.5 text-yellow-500" />
                        <span className="select-none blur-[2px] truncate flex-1">{node.name}</span>
                        <span className="text-[9px] text-yellow-600 no-blur bg-yellow-400/10 px-1 rounded">partner</span>
                    </div>
                );
            }

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
                        <button onClick={runProjectWithAutoInstall} disabled={isBooting}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-md transition-colors">
                            {isBooting ? (
                                <>
                                    <div className="relative w-16 h-2 bg-gray-600 rounded-full overflow-hidden">
                                        <div className="absolute inset-y-0 left-0 bg-green-400 rounded-full transition-all duration-500 ease-out" style={{ width: `${bootProgress}%` }} />
                                    </div>
                                    <span className="text-[9px] text-gray-400 ml-0.5">{bootProgress}%</span>
                                </>
                            ) : (<><Play className="w-3 h-3" /> Run</>)}
                        </button>
                    ) : (
                        <button onClick={stopServer} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors">
                            <Square className="w-3 h-3" /> Stop
                        </button>
                    )}
                    <button onClick={buildProject} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-yellow-600 hover:bg-yellow-700 text-white rounded-md transition-colors" title="Build (npm run build)">
                        <Hammer className="w-3 h-3" /> Build
                    </button>
                    {/* Separator */}
                    <div className="w-px h-4 bg-gray-700 mx-0.5" />
                    {/* Package Manager */}
                    <button onClick={() => setShowPackageManager(true)}
                        className="flex items-center gap-1 p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 rounded transition-colors" title="Package Manager (npm)">
                        <Package className="w-3.5 h-3.5" />
                    </button>
                    {/* Project Templates */}
                    <button onClick={() => setShowTemplates(true)}
                        className="flex items-center gap-1 p-1.5 text-gray-400 hover:text-purple-400 hover:bg-purple-400/10 rounded transition-colors" title="Project Templates">
                        <AlertTriangle className="w-3.5 h-3.5" />
                    </button>
                    {/* Env Variables */}
                    <button onClick={() => setShowEnvPanel(true)}
                        className="flex items-center gap-1 p-1.5 text-gray-400 hover:text-green-400 hover:bg-green-400/10 rounded transition-colors" title="Environment Variables (.env)">
                        <Settings2 className="w-3.5 h-3.5" />
                    </button>
                    {/* Separator */}
                    <div className="w-px h-4 bg-gray-700 mx-0.5" />
                    <button onClick={downloadZip} className="p-1.5 text-gray-400 hover:text-white rounded" title="Download ZIP"><Download className="w-3.5 h-3.5" /></button>
                    <button
                        onClick={() => { setShowGithubModal(true); setGithubResult(null); setGithubRepoName(projectTitle.replace(/\s+/g, '-').toLowerCase()); }}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white bg-gray-800 hover:bg-gray-700 border border-gray-600 hover:border-purple-500 rounded transition-colors"
                        title="Push to GitHub"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                        Push to GitHub
                    </button>
                    <div className="relative">
                        <button onClick={() => setShowIdeInfo(!showIdeInfo)} className={`p-1.5 rounded transition-colors ${showIdeInfo ? 'text-blue-400 bg-blue-400/10' : 'text-gray-400 hover:text-blue-400'}`} title="IDE Info">
                            <Info className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <button onClick={() => setEditorTheme(t => t === 'vs-dark' ? 'vs' : t === 'vs' ? 'hc-black' : 'vs-dark')}
                        className="p-1.5 text-gray-400 hover:text-white rounded" title={`Theme: ${editorTheme}`}>
                        {editorTheme === 'vs' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                    </button>
                    <span className="text-[10px] text-gray-500 px-1">{fontSize}px</span>
                    <button onClick={formatFile} className="p-1.5 text-gray-400 hover:text-white rounded" title="Format with Prettier (Ctrl+S)">✨</button>
                    <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 text-gray-400 hover:text-white rounded">
                        {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    </button>
                </div>

                {/* IDE Info overlay modal */}
                {showIdeInfo && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowIdeInfo(false)}>
                        <div className="w-80 bg-[#1e2030] border border-gray-700 rounded-xl shadow-2xl p-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[11px] font-bold text-white">🖥️ IDE Compatibility Guide</p>
                                <button onClick={() => setShowIdeInfo(false)} className="p-0.5 text-gray-500 hover:text-white"><X className="w-3 h-3" /></button>
                            </div>
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
                                    <p><span className="text-red-400/70">•</span> <strong className="text-gray-300">Why:</strong> TCP socket connections not available in browser</p>
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
                )}
            </div>

            {/* Main — CSS Grid ensures columns never exceed container width */}
            <div className="flex-1 overflow-hidden" style={{
                display: 'grid',
                gridTemplateColumns: `${sidebar.size}px 5px 1fr 5px ${preview.size}px`,
                minHeight: 0,
            }
            }>
                {/* File explorer */}
                <div className="bg-[#0d1117] border-r border-gray-800 flex flex-col min-w-0 relative" >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 flex-shrink-0">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                            {showSearch ? 'Search' : 'Explorer'}
                        </span>
                        <div className="flex items-center gap-0.5">
                            <button onClick={() => setShowSearch(s => !s)}
                                className={`p-0.5 rounded transition-colors ${showSearch ? 'text-blue-400 bg-blue-400/10' : 'text-gray-500 hover:text-white'}`}
                                title="Global Search (Ctrl+Shift+F)">
                                <Search className="w-3.5 h-3.5" />
                            </button>
                            {!showSearch && <>
                                <button onClick={() => { setShowNewFile(true); setNewFileParent(''); setNewItemType('folder'); setNewFileName(''); }} className="p-0.5 text-gray-500 hover:text-white rounded" title="New folder"><FolderPlus className="w-3.5 h-3.5" /></button>
                                <button onClick={() => { setShowNewFile(true); setNewFileParent(''); setNewItemType('file'); setNewFileName(''); }} className="p-0.5 text-gray-500 hover:text-white rounded" title="New file"><Plus className="w-3.5 h-3.5" /></button>
                            </>}
                        </div>
                    </div>
                    {/* Global search panel */}
                    {showSearch && (
                        <div className="flex-1 overflow-hidden">
                            <SearchPanel
                                files={files}
                                onOpenFile={(path) => { switchToFile(path); }}
                                onClose={() => setShowSearch(false)}
                                onReplace={replaceInFile}
                            />
                        </div>
                    )}
                    {/* Root-level new file input (when no parent dir selected) */}
                    {!showSearch && showNewFile && newFileParent === '' && (
                        <div className="px-2 py-1 border-b border-gray-800 flex-shrink-0">
                            <input autoFocus value={newFileName} onChange={(e) => setNewFileName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newFileName.trim()) {
                                        if (newItemType === 'folder') {
                                            const folderPath = newFileName.trim();
                                            setFolders(prev => { const n = new Set(prev); n.add(folderPath); return n; });
                                            setExpandedDirs(prev => { const n = new Set(prev); n.add(folderPath); return n; });
                                            webcontainerRef.current?.fs.mkdir(folderPath, { recursive: true }).catch(() => {});
                                            setShowNewFile(false); setNewFileName('');
                                        } else {
                                            createFile(newFileName);
                                        }
                                    }
                                    if (e.key === 'Escape') { setShowNewFile(false); setNewFileName(''); }
                                }}
                                onBlur={() => { setShowNewFile(false); setNewFileName(''); }}
                                placeholder="filename.tsx or path/to/file.tsx"
                                className="w-full bg-[#1e2030] border border-blue-500 rounded px-2 py-1 text-xs text-white placeholder-gray-600 outline-none" />
                        </div>
                    )}
                    {!showSearch && (
                        <div className="p-1 overflow-y-auto flex-1" style={{ minHeight: 0 }}>
                            {/* VS Code-style: project name as root folder, always expanded */}
                            <div>
                                <div className="flex items-center gap-1 px-2 py-1 text-xs text-gray-300 font-semibold hover:bg-[#1e2030] rounded cursor-default group"
                                    onClick={() => setExpandedDirs(prev => { const n = new Set(prev); n.has('__ROOT__') ? n.delete('__ROOT__') : n.add('__ROOT__'); return n; })}
                                >
                                    {expandedDirs.has('__ROOT__') || !expandedDirs.has('__ROOT__COLLAPSED__')
                                        ? <ChevronDown className="w-3 h-3 text-gray-500" />
                                        : <ChevronRight className="w-3 h-3 text-gray-500" />}
                                    <FolderOpen className="w-3.5 h-3.5 text-yellow-400" />
                                    <span className="uppercase tracking-wide text-[10px] text-gray-400 font-bold">
                                        {projectTitle || 'project'}
                                    </span>
                                </div>
                                <div className="ml-2">
                                    {renderTree(tree)}
                                </div>
                            </div>
                        </div>
                    )}
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
                        <div className="flex items-center justify-between px-2 py-1 bg-[#161b22] border-b border-gray-800">
                            <div className="flex items-center gap-0 overflow-x-auto">
                                {terminalTabs.map((tab) => {
                                    const locked = terminalLocks.has(tab.id);
                                    return (
                                        <button key={tab.id} onClick={() => { setActiveTermTab('shell'); setActiveTerminalId(tab.id); }}
                                            className={`flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-semibold tracking-wider transition-colors whitespace-nowrap ${activeTermTab === 'shell' && activeTerminalId === tab.id ? 'text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>
                                            <Terminal className="w-3 h-3" />
                                            {locked && <span title={`${terminalLocks.get(tab.id)?.userName} is using this terminal`}><Lock className="w-2.5 h-2.5 text-yellow-400" /></span>}
                                            {tab.label}
                                            {terminalTabs.length > 1 && (
                                                <span
                                                    onClick={(e) => { e.stopPropagation(); closeTerminal(tab.id); }}
                                                    className="p-0.5 rounded hover:bg-red-500/20 ml-0.5"
                                                >
                                                    <X className="w-2.5 h-2.5" />
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                                {terminalTabs.length < 4 && (
                                    <button onClick={() => {
                                        if (!terminalRef.current) return;
                                        const newId = `term-${Date.now()}`;
                                        const tabNum = terminalTabs.length + 1;
                                        // Create DOM container for the new terminal
                                        const container = document.createElement('div');
                                        container.style.cssText = 'width:100%;height:100%;position:absolute;top:0;left:0;display:none';
                                        terminalRef.current.appendChild(container);
                                        const newTerm = new XTermTerminal({
                                            theme: { background: '#0d1117', foreground: '#c9d1d9', cursor: '#58a6ff', selectionBackground: '#264f78' },
                                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 13, cursorBlink: true, convertEol: true,
                                            allowProposedApi: true,
                                        });
                                        const newFitAddon = new FitAddon();
                                        newTerm.loadAddon(newFitAddon);
                                        newTerm.open(container);
                                        setTimeout(() => { try { newFitAddon.fit(); } catch { /* */ } }, 50);
                                        const inst: TerminalInstance = {
                                            id: newId, label: `bash ${tabNum}`,
                                            term: newTerm, fitAddon: newFitAddon,
                                            shellProcess: null, shellWriter: null, container,
                                        };
                                        newTerm.onData((data: string) => {
                                            const active = terminalsRef.current.get(newId);
                                            if (active?.shellWriter) active.shellWriter.write(data);
                                            const socket = socketService.getSocket();
                                            socket?.emit('terminal:lock', sessionId, { terminalId: newId, userName });
                                            if (terminalUnlockTimerRef.current) clearTimeout(terminalUnlockTimerRef.current);
                                            terminalUnlockTimerRef.current = setTimeout(() => {
                                                socket?.emit('terminal:unlock', sessionId, { terminalId: newId });
                                            }, 4000);
                                        });
                                        terminalsRef.current.set(newId, inst);
                                        const tabLabel = `bash ${tabNum}`;
                                        // Notify partner of new terminal
                                        socketService.getSocket()?.emit('terminal:create', sessionId, { terminalId: newId, label: tabLabel });
                                        // Spawn shell if WC is booted
                                        if (webcontainerRef.current) {
                                            (async () => {
                                                try {
                                                    const shell = await webcontainerRef.current!.spawn('jsh', { terminal: { cols: newTerm.cols || 80, rows: newTerm.rows || 24 } });
                                                    inst.shellProcess = shell;
                                                    const writer = shell.input.getWriter();
                                                    inst.shellWriter = writer;
                                                    shell.output.pipeTo(new WritableStream({
                                                        write(data) {
                                                            newTerm.write(data);
                                                            parseNpmOutput(data, newId);
                                                            socketService.getSocket()?.emit('terminal:output', sessionId, { terminalId: newId, chunk: data, label: tabLabel });
                                                        },
                                                    }));
                                                    // If this is still the active terminal, update global refs
                                                    if (activeTerminalId === newId) shellWriterRef.current = writer;
                                                } catch { /* WC not ready */ }
                                            })();
                                        }
                                        setTerminalTabs(prev => [...prev, { id: newId, label: tabLabel }]);
                                        setActiveTerminalId(newId);
                                        setActiveTermTab('shell');
                                        // Show new, hide others
                                        terminalsRef.current.forEach((t, tid) => {
                                            if (t.container) t.container.style.display = tid === newId ? 'block' : 'none';
                                        });
                                    }} className="p-0.5 ml-1 text-gray-500 hover:text-white hover:bg-gray-700 rounded" title="New terminal">
                                        <Plus className="w-3 h-3" />
                                    </button>
                                )}
                                <div className="w-px h-3 bg-gray-700 mx-1" />
                                <button onClick={() => setActiveTermTab('output')}
                                    className={`flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${activeTermTab === 'output' ? 'text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>
                                    Output {outputLines.length > 0 && <span className="bg-gray-700 text-[9px] px-1 rounded">{outputLines.length}</span>}
                                </button>
                                {partnerTermTabs.length > 0 && (
                                    <>
                                        <div className="w-px h-3 bg-gray-700 mx-1" />
                                        {partnerTermTabs.map(tab => (
                                            <button key={tab.id} onClick={() => { setActiveTermTab('partner'); setActivePartnerTermId(tab.id); }}
                                                className={`flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-semibold tracking-wider transition-colors whitespace-nowrap ${activeTermTab === 'partner' && activePartnerTermId === tab.id ? 'text-green-300 border-b-2 border-green-500' : 'text-gray-500 hover:text-green-300'}`}
                                                title="Partner's terminal (read-only)">
                                                <Terminal className="w-3 h-3 text-green-500" />
                                                👤 {tab.label}
                                            </button>
                                        ))}
                                    </>
                                )}
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
                        <div ref={terminalRef} className="h-[calc(100%-28px)] relative" style={{ display: activeTermTab === 'shell' ? 'block' : 'none' }}>
                            {/* npm install progress bar */}
                            {installProgress?.active && (
                                <div className="absolute top-0 left-0 right-0 z-10 bg-[#0d1117]/95 backdrop-blur-sm border-b border-blue-500/30 px-3 py-1.5">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] text-blue-300 font-medium">📦 {installProgress.phase}</span>
                                        <span className="text-[10px] text-gray-400">
                                            {installProgress.percent}%
                                            {installProgress.percent < 100 && (() => {
                                                const elapsed = (Date.now() - installProgress.startTime) / 1000;
                                                const estimated = installProgress.percent > 5 ? Math.max(0, Math.round((elapsed / installProgress.percent) * (100 - installProgress.percent))) : '—';
                                                return ` · ~${estimated}s left`;
                                            })()}
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-800 rounded-full h-1.5">
                                        <div
                                            className={`h-1.5 rounded-full transition-all duration-300 ${installProgress.percent === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                                            style={{ width: `${installProgress.percent}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                        {/* Partner terminal (read-only view) */}
                        <div
                            ref={partnerTermContainerRef}
                            className="h-[calc(100%-28px)] relative"
                            style={{ display: activeTermTab === 'partner' ? 'block' : 'none' }}
                        >
                            {partnerTermTabs.length === 0 && activeTermTab === 'partner' && (
                                <div className="flex items-center justify-center h-full text-gray-600 text-xs">
                                    Partner hasn't opened a terminal yet
                                </div>
                            )}
                        </div>
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
                    {
                        commentLine !== null && (
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
                        )
                    }
                </div>

                {/* Preview resize divider */}
                <ResizeDivider dividerRef={preview.dividerRef} />

                {/* Preview + Mini Chat */}
                <div className="border-l border-gray-800 bg-[#161b22] flex flex-col min-w-0 overflow-hidden" >
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
                    {
                        showMiniChat && (
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
                        )
                    }
                </div>
            </div>

            {/* Context Menu */}
            {
                contextMenu && (
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
                            <>
                                <button onClick={() => {
                                    setNewFileParent(contextMenu.path);
                                    setNewItemType('file');
                                    setNewFileName('');
                                    setShowNewFile(true);
                                    setExpandedDirs(prev => { const n = new Set(prev); n.add(contextMenu.path); return n; });
                                    setContextMenu(null);
                                }}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-[#2d2f3f] transition-colors">
                                    <Plus className="w-3 h-3" /> New File
                                </button>
                                <button onClick={() => createFolder(contextMenu.path)}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-[#2d2f3f] transition-colors">
                                    <FolderPlus className="w-3 h-3" /> New Subfolder
                                </button>
                            </>
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
                )
            }

            {/* Quick Open Modal (Ctrl+P) */}
            {
                showQuickOpen && (
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
                )
            }

            {/* Toast notifications */}
            <ToastContainer toasts={toasts} />

            {/* ===== Package Manager Modal ===== */}
            {showPackageManager && (
                <PackageManagerPanel
                    packageJson={files['package.json'] || '{}'}
                    onInstall={installPackage}
                    onUninstall={uninstallPackage}
                    onClose={() => setShowPackageManager(false)}
                />
            )}

            {/* ===== Project Templates Modal ===== */}
            {showTemplates && (
                <ProjectTemplatesModal
                    onApply={applyTemplate}
                    onClose={() => setShowTemplates(false)}
                />
            )}

            {/* ===== Environment Variables Panel ===== */}
            {showEnvPanel && (
                <EnvVarsPanel
                    envContent={files['.env'] || ''}
                    partnerOwned={envOwnerRef.current !== '' && envOwnerRef.current !== socketService.getSocket()?.id}
                    onSave={(content) => {
                        setFiles(prev => { const next = { ...prev, '.env': content }; autosave(next); return next; });
                        if (webcontainerRef.current) webcontainerRef.current.fs.writeFile('.env', content).catch(() => { });
                        const socket = socketService.getSocket();
                        socket?.emit('code:file-create', { sessionId, path: '.env', content, senderId: socket.id });
                        addToast('.env saved ✓', 'success');
                    }}
                    onClose={() => setShowEnvPanel(false)}
                />
            )}

            {/* ===== Push to GitHub Modal ===== */}
            {showGithubModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !githubPushing && setShowGithubModal(false)}>
                    <div className="w-full max-w-md bg-[#161b22] border border-gray-700 rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-2">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                                <span className="text-white font-semibold text-sm">Push to GitHub</span>
                            </div>
                            {!githubPushing && <button onClick={() => setShowGithubModal(false)} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>}
                        </div>

                        {/* Success state */}
                        {githubResult ? (
                            <div className="text-center py-4">
                                <div className="text-4xl mb-3">🎉</div>
                                <p className="text-green-400 font-semibold text-sm mb-1">Project pushed successfully!</p>
                                <p className="text-gray-400 text-xs mb-4">Your repo is live on GitHub</p>
                                <a
                                    href={githubResult.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block w-full py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white text-xs rounded-xl text-center transition-colors mb-2 font-mono truncate"
                                >
                                    {githubResult.url}
                                </a>
                                <p className="text-gray-500 text-xs">Your partner will receive a collaborator invite on GitHub</p>
                                <button
                                    onClick={() => { setShowGithubModal(false); setGithubResult(null); }}
                                    className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-xl transition-colors"
                                >
                                    Done
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* GitHub connection status */}
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-[#0d1117] border border-gray-700">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-gray-400 flex-shrink-0"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[11px] text-gray-400">GitHub Account</p>
                                        {false ? (  // placeholder; connection is always checked via API
                                            <p className="text-[11px] text-green-400 font-semibold">✓ Connected</p>
                                        ) : (
                                            <p className="text-[11px] text-yellow-400">Not connected — <a href="/profile" target="_blank" className="underline hover:text-yellow-300">Connect in Profile →</a></p>
                                        )}
                                    </div>
                                </div>

                                {/* Repo name */}
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5 font-medium">
                                        Repository Name <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={githubRepoName}
                                        onChange={e => setGithubRepoName(e.target.value.replace(/\s+/g, '-').toLowerCase())}
                                        placeholder="my-project"
                                        className="w-full bg-[#0d1117] border border-gray-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 outline-none transition-colors"
                                    />
                                </div>

                                {/* Partner username */}
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1.5 font-medium">
                                        Partner's GitHub Username <span className="text-gray-600">(optional — adds them as collaborator)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={githubPartnerUsername}
                                        onChange={e => setGithubPartnerUsername(e.target.value)}
                                        placeholder="their-github-username"
                                        className="w-full bg-[#0d1117] border border-gray-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 outline-none transition-colors"
                                    />
                                </div>

                                {/* Info */}
                                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                                    <p className="text-[10px] text-blue-300">
                                        ℹ️ A new <strong>public</strong> repo will be created on your GitHub. All project files (except .env) will be pushed as the first commit. Your partner will receive a collaborator invite.
                                    </p>
                                </div>

                                {/* Submit */}
                                <button
                                    onClick={pushToGitHub}
                                    disabled={githubPushing || !githubRepoName.trim()}
                                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                                >
                                    {githubPushing ? (
                                        <>
                                            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Pushing to GitHub...
                                        </>
                                    ) : (
                                        <>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                                            Push to GitHub
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
