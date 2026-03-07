import { useState, useRef, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { WebContainer } from '@webcontainer/api';
import { Terminal as XTermTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
    FolderOpen,
    File,
    Plus,
    X,
    Play,
    Square,
    ChevronRight,
    ChevronDown,
    RefreshCw,
    Download,
    Maximize2,
    Minimize2,
    Terminal,
} from 'lucide-react';
import { socketService } from '@/lib/socket';

// ===== Types =====
interface FileNode {
    name: string;
    type: 'file' | 'directory';
    content?: string;
    children?: FileNode[];
}

interface CollabIDEProps {
    sessionId: string;
    partnerId: string;
    projectTitle: string;
}

// Language detection
function getLanguage(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
        ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
        css: 'css', html: 'html', json: 'json', md: 'markdown',
        py: 'python', go: 'go', rs: 'rust', yml: 'yaml', yaml: 'yaml',
        sh: 'shell', bash: 'shell', env: 'plaintext', txt: 'plaintext',
    };
    return map[ext] || 'plaintext';
}

// Default starter files for a React+TS project
const DEFAULT_FILES: FileNode[] = [
    {
        name: 'package.json', type: 'file',
        content: JSON.stringify({
            name: 'pairon-project',
            private: true,
            version: '1.0.0',
            type: 'module',
            scripts: {
                dev: 'vite',
                build: 'vite build',
                preview: 'vite preview',
            },
            dependencies: {
                react: '^18.2.0',
                'react-dom': '^18.2.0',
            },
            devDependencies: {
                '@types/react': '^18.2.0',
                '@types/react-dom': '^18.2.0',
                '@vitejs/plugin-react': '^4.2.0',
                typescript: '^5.3.0',
                vite: '^5.0.0',
            },
        }, null, 2),
    },
    {
        name: 'index.html', type: 'file',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PairOn Project</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>`,
    },
    {
        name: 'tsconfig.json', type: 'file',
        content: JSON.stringify({
            compilerOptions: {
                target: 'ES2020', useDefineForClassFields: true, lib: ['ES2020', 'DOM', 'DOM.Iterable'],
                module: 'ESNext', skipLibCheck: true, moduleResolution: 'bundler',
                allowImportingTsExtensions: true, resolveJsonModule: true, isolatedModules: true,
                noEmit: true, jsx: 'react-jsx', strict: true,
            },
            include: ['src'],
        }, null, 2),
    },
    {
        name: 'vite.config.ts', type: 'file',
        content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})`,
    },
    {
        name: 'src', type: 'directory',
        children: [
            {
                name: 'main.tsx', type: 'file',
                content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`,
            },
            {
                name: 'App.tsx', type: 'file',
                content: `import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem', textAlign: 'center' }}>
      <h1>🚀 PairOn Project</h1>
      <p>Start building together!</p>
      <button onClick={() => setCount(c => c + 1)} style={{ padding: '0.5rem 1rem', fontSize: '1rem', cursor: 'pointer' }}>
        Count: {count}
      </button>
    </div>
  )
}

export default App`,
            },
            {
                name: 'index.css', type: 'file',
                content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, -apple-system, sans-serif; background: #0f0f1a; color: #e2e8f0; }
`,
            },
        ],
    },
];

// Flatten files for quick access
function flattenFiles(nodes: FileNode[], prefix = ''): Map<string, string> {
    const map = new Map<string, string>();
    for (const node of nodes) {
        const path = prefix ? `${prefix}/${node.name}` : node.name;
        if (node.type === 'file') {
            map.set(path, node.content || '');
        } else if (node.children) {
            const childMap = flattenFiles(node.children, path);
            childMap.forEach((v, k) => map.set(k, v));
        }
    }
    return map;
}

// Convert flat map to WebContainer file system format
function toWebContainerFS(files: Map<string, string>): Record<string, any> {
    const fs: Record<string, any> = {};
    for (const [path, content] of files) {
        const parts = path.split('/');
        let current = fs;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) {
                current[parts[i]] = { directory: {} };
            }
            current = current[parts[i]].directory;
        }
        current[parts[parts.length - 1]] = { file: { contents: content } };
    }
    return fs;
}

export function CollabIDE({ sessionId, partnerId: _partnerId, projectTitle }: CollabIDEProps) {
    // File state
    const [files, setFiles] = useState<Map<string, string>>(() => flattenFiles(DEFAULT_FILES));
    const [activeFile, setActiveFile] = useState<string>('src/App.tsx');
    const [openTabs, setOpenTabs] = useState<string[]>(['src/App.tsx', 'src/main.tsx']);
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['src']));

    // New file dialog
    const [showNewFile, setShowNewFile] = useState(false);
    const [newFileName, setNewFileName] = useState('');

    // WebContainer & terminal
    const [, setWebcontainer] = useState<WebContainer | null>(null);
    const [isBooting, setIsBooting] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string>('');

    // Layout
    const [terminalHeight, setTerminalHeight] = useState(200);
    const [sidebarWidth] = useState(200);
    const [previewWidth, setPreviewWidth] = useState(350);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Refs
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTermTerminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const webcontainerRef = useRef<WebContainer | null>(null);
    const shellProcessRef = useRef<any>(null);
    const filesRef = useRef(files);

    // Keep ref in sync
    useEffect(() => { filesRef.current = files; }, [files]);

    // ===== Initialize Terminal =====
    useEffect(() => {
        if (!terminalRef.current || xtermRef.current) return;

        const term = new XTermTerminal({
            theme: {
                background: '#0d1117',
                foreground: '#c9d1d9',
                cursor: '#58a6ff',
                cursorAccent: '#0d1117',
                selectionBackground: '#264f78',
            },
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            fontSize: 13,
            cursorBlink: true,
            convertEol: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);

        // Delay fit to ensure container is rendered
        setTimeout(() => {
            try { fitAddon.fit(); } catch { /* ignore */ }
        }, 100);

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        term.writeln('\x1b[1;35m╔══════════════════════════════════╗\x1b[0m');
        term.writeln('\x1b[1;35m║   🚀 PairOn Collaborative IDE   ║\x1b[0m');
        term.writeln('\x1b[1;35m╚══════════════════════════════════╝\x1b[0m');
        term.writeln('');
        term.writeln('\x1b[33mClick "▶ Run" to boot the dev environment.\x1b[0m');
        term.writeln('');

        // Handle resize
        const resizeObserver = new ResizeObserver(() => {
            try { fitAddon.fit(); } catch { /* ignore */ }
        });
        if (terminalRef.current) resizeObserver.observe(terminalRef.current);

        return () => {
            resizeObserver.disconnect();
            term.dispose();
            xtermRef.current = null;
        };
    }, []);

    // ===== Socket: File sync =====
    useEffect(() => {
        const socket = socketService.getSocket();
        if (!socket) return;

        const handleFileChange = (data: { path: string; content: string; senderId: string }) => {
            if (data.senderId === socket.id) return; // Ignore own changes
            setFiles(prev => {
                const next = new Map(prev);
                next.set(data.path, data.content);
                return next;
            });
            // Update WebContainer file too
            if (webcontainerRef.current) {
                webcontainerRef.current.fs.writeFile(data.path, data.content).catch(() => { });
            }
        };

        const handleFileCreate = (data: { path: string; content: string; senderId: string }) => {
            if (data.senderId === socket.id) return;
            setFiles(prev => {
                const next = new Map(prev);
                next.set(data.path, data.content);
                return next;
            });
            if (webcontainerRef.current) {
                const dir = data.path.split('/').slice(0, -1).join('/');
                if (dir) webcontainerRef.current.fs.mkdir(dir, { recursive: true }).catch(() => { });
                webcontainerRef.current.fs.writeFile(data.path, data.content).catch(() => { });
            }
        };

        const handleFileDelete = (data: { path: string; senderId: string }) => {
            if (data.senderId === socket.id) return;
            setFiles(prev => {
                const next = new Map(prev);
                next.delete(data.path);
                return next;
            });
            if (webcontainerRef.current) {
                webcontainerRef.current.fs.rm(data.path).catch(() => { });
            }
        };

        socket.on('code:file-change', handleFileChange);
        socket.on('code:file-create', handleFileCreate);
        socket.on('code:file-delete', handleFileDelete);

        return () => {
            socket.off('code:file-change', handleFileChange);
            socket.off('code:file-create', handleFileCreate);
            socket.off('code:file-delete', handleFileDelete);
        };
    }, []);

    // ===== Boot WebContainer =====
    const bootWebContainer = useCallback(async () => {
        if (webcontainerRef.current || isBooting) return;
        setIsBooting(true);

        const term = xtermRef.current;
        if (term) {
            term.writeln('\x1b[36m⏳ Booting development environment...\x1b[0m');
        }

        try {
            const wc = await WebContainer.boot();
            webcontainerRef.current = wc;
            setWebcontainer(wc);

            // Mount files
            const fsTree = toWebContainerFS(filesRef.current);
            await wc.mount(fsTree);
            if (term) term.writeln('\x1b[32m✓ Files mounted\x1b[0m');

            // Listen for server-ready (Vite dev server)
            wc.on('server-ready', (_port: number, url: string) => {
                setPreviewUrl(url);
                if (term) term.writeln(`\x1b[32m✓ Preview ready at ${url}\x1b[0m`);
            });

            // Install dependencies
            if (term) term.writeln('\x1b[36m📦 Installing dependencies (npm install)...\x1b[0m');
            const installProcess = await wc.spawn('npm', ['install']);

            installProcess.output.pipeTo(new WritableStream({
                write(data) {
                    if (term) term.write(data);
                },
            }));

            const installExitCode = await installProcess.exit;
            if (installExitCode !== 0) {
                if (term) term.writeln('\x1b[31m✗ npm install failed\x1b[0m');
                setIsBooting(false);
                return;
            }
            if (term) term.writeln('\x1b[32m✓ Dependencies installed\x1b[0m');

            // Start dev server
            if (term) term.writeln('\x1b[36m🚀 Starting dev server...\x1b[0m');
            const devProcess = await wc.spawn('npm', ['run', 'dev']);
            shellProcessRef.current = devProcess;
            setIsRunning(true);

            devProcess.output.pipeTo(new WritableStream({
                write(data) {
                    if (term) term.write(data);
                },
            }));

            setIsBooting(false);
        } catch (error: any) {
            console.error('WebContainer boot error:', error);
            if (term) {
                term.writeln(`\x1b[31m✗ Failed to boot: ${error.message}\x1b[0m`);
                term.writeln('\x1b[33mℹ WebContainers require a Chromium browser (Chrome/Edge/Brave)\x1b[0m');
            }
            setIsBooting(false);
        }
    }, [isBooting]);

    // ===== Stop dev server =====
    const stopServer = useCallback(() => {
        if (shellProcessRef.current) {
            shellProcessRef.current.kill();
            shellProcessRef.current = null;
            setIsRunning(false);
            setPreviewUrl('');
            if (xtermRef.current) xtermRef.current.writeln('\n\x1b[33m■ Server stopped\x1b[0m');
        }
    }, []);

    // ===== File operations =====
    const handleEditorChange = useCallback((value: string | undefined) => {
        if (!value || !activeFile) return;
        // Update local state
        setFiles(prev => {
            const next = new Map(prev);
            next.set(activeFile, value);
            return next;
        });
        // Sync to WebContainer
        if (webcontainerRef.current) {
            webcontainerRef.current.fs.writeFile(activeFile, value).catch(() => { });
        }
        // Sync to partner via socket (debounced)
        const socket = socketService.getSocket();
        socket?.emit('code:file-change', {
            sessionId, path: activeFile, content: value, senderId: socket.id,
        });
    }, [activeFile, sessionId]);

    const createFile = useCallback((filename: string) => {
        if (!filename.trim()) return;
        const path = filename.includes('/') ? filename : filename;
        setFiles(prev => {
            const next = new Map(prev);
            next.set(path, '');
            return next;
        });
        setOpenTabs(prev => prev.includes(path) ? prev : [...prev, path]);
        setActiveFile(path);
        // Create in WebContainer
        if (webcontainerRef.current) {
            const dir = path.split('/').slice(0, -1).join('/');
            if (dir) webcontainerRef.current.fs.mkdir(dir, { recursive: true }).catch(() => { });
            webcontainerRef.current.fs.writeFile(path, '').catch(() => { });
        }
        // Sync to partner
        const socket = socketService.getSocket();
        socket?.emit('code:file-create', {
            sessionId, path, content: '', senderId: socket?.id,
        });
        setShowNewFile(false);
        setNewFileName('');
    }, [sessionId]);

    const openFile = useCallback((path: string) => {
        setActiveFile(path);
        if (!openTabs.includes(path)) {
            setOpenTabs(prev => [...prev, path]);
        }
    }, [openTabs]);

    const closeTab = useCallback((path: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setOpenTabs(prev => {
            const next = prev.filter(t => t !== path);
            if (activeFile === path && next.length > 0) {
                setActiveFile(next[next.length - 1]);
            }
            return next;
        });
    }, [activeFile]);

    const toggleDir = useCallback((dir: string) => {
        setExpandedDirs(prev => {
            const next = new Set(prev);
            if (next.has(dir)) next.delete(dir);
            else next.add(dir);
            return next;
        });
    }, []);

    // ===== Download as ZIP =====
    const downloadZip = useCallback(async () => {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        files.forEach((content, path) => {
            zip.file(path, content);
        });
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectTitle.replace(/\s+/g, '-').toLowerCase()}.zip`;
        a.click();
        URL.revokeObjectURL(url);
    }, [files, projectTitle]);

    // ===== Build file tree from flat map =====
    const buildTree = useCallback((): FileNode[] => {
        const root: FileNode[] = [];
        const dirMap = new Map<string, FileNode>();

        // Sort paths so directories come first
        const paths = Array.from(files.keys()).sort();

        for (const path of paths) {
            const parts = path.split('/');
            if (parts.length === 1) {
                root.push({ name: parts[0], type: 'file', content: files.get(path) });
            } else {
                // Ensure all parent directories exist
                for (let i = 0; i < parts.length - 1; i++) {
                    const dirPath = parts.slice(0, i + 1).join('/');
                    if (!dirMap.has(dirPath)) {
                        const dirNode: FileNode = { name: parts[i], type: 'directory', children: [] };
                        dirMap.set(dirPath, dirNode);
                        if (i === 0) {
                            if (!root.find(n => n.name === parts[0])) root.push(dirNode);
                        } else {
                            const parentPath = parts.slice(0, i).join('/');
                            dirMap.get(parentPath)?.children?.push(dirNode);
                        }
                    }
                }
                // Add file to its parent dir
                const parentPath = parts.slice(0, -1).join('/');
                const fileName = parts[parts.length - 1];
                dirMap.get(parentPath)?.children?.push({ name: fileName, type: 'file' });
            }
        }

        return root;
    }, [files]);

    // ===== Render file tree recursively =====
    const renderTree = (nodes: FileNode[], prefix = '') => {
        // Sort: directories first, then files
        const sorted = [...nodes].sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        return sorted.map(node => {
            const fullPath = prefix ? `${prefix}/${node.name}` : node.name;
            if (node.type === 'directory') {
                const isExpanded = expandedDirs.has(fullPath);
                return (
                    <div key={fullPath}>
                        <button
                            onClick={() => toggleDir(fullPath)}
                            className="w-full flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:bg-[#1e2030] hover:text-gray-200 transition-colors rounded"
                        >
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                            <span>{node.name}</span>
                        </button>
                        {isExpanded && node.children && (
                            <div className="ml-3 border-l border-gray-800">
                                {renderTree(node.children, fullPath)}
                            </div>
                        )}
                    </div>
                );
            }
            return (
                <button
                    key={fullPath}
                    onClick={() => openFile(fullPath)}
                    className={`w-full flex items-center gap-1.5 px-2 py-1 text-xs transition-colors rounded ${activeFile === fullPath
                        ? 'bg-[#2d2f3f] text-white'
                        : 'text-gray-500 hover:bg-[#1e2030] hover:text-gray-300'
                        }`}
                >
                    <File className="w-3.5 h-3.5 text-gray-500" />
                    <span className="truncate">{node.name}</span>
                </button>
            );
        });
    };

    // Fit terminal on height change
    useEffect(() => {
        setTimeout(() => {
            try { fitAddonRef.current?.fit(); } catch { /* ignore */ }
        }, 50);
    }, [terminalHeight]);

    const tree = buildTree();

    return (
        <div className={`flex flex-col bg-[#0d1117] text-white ${isFullscreen ? 'fixed inset-0 z-50' : 'h-full'}`}>
            {/* Top bar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-gray-800 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-400">📁 {projectTitle}</span>
                </div>
                <div className="flex items-center gap-1">
                    {!isRunning ? (
                        <button
                            onClick={bootWebContainer}
                            disabled={isBooting}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-md transition-colors"
                        >
                            {isBooting ? (
                                <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Booting...</>
                            ) : (
                                <><Play className="w-3 h-3" /> Run</>
                            )}
                        </button>
                    ) : (
                        <button
                            onClick={stopServer}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                        >
                            <Square className="w-3 h-3" /> Stop
                        </button>
                    )}
                    <button onClick={downloadZip} className="p-1.5 text-gray-400 hover:text-white transition-colors rounded" title="Download ZIP">
                        <Download className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 text-gray-400 hover:text-white transition-colors rounded" title="Toggle fullscreen">
                        {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    </button>
                </div>
            </div>

            {/* Main content */}
            <div className="flex flex-1 overflow-hidden">
                {/* File explorer */}
                <div className="flex-shrink-0 bg-[#0d1117] border-r border-gray-800 overflow-y-auto" style={{ width: sidebarWidth }}>
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Explorer</span>
                        <button
                            onClick={() => setShowNewFile(true)}
                            className="p-0.5 text-gray-500 hover:text-white transition-colors rounded"
                            title="New file"
                        >
                            <Plus className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    {showNewFile && (
                        <div className="px-2 py-1 border-b border-gray-800">
                            <input
                                autoFocus
                                value={newFileName}
                                onChange={(e) => setNewFileName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') createFile(newFileName);
                                    if (e.key === 'Escape') { setShowNewFile(false); setNewFileName(''); }
                                }}
                                placeholder="path/filename.ts"
                                className="w-full bg-[#1e2030] border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder-gray-600 outline-none focus:border-blue-500"
                            />
                        </div>
                    )}
                    <div className="p-1">
                        {renderTree(tree)}
                    </div>
                </div>

                {/* Editor + Terminal area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Tabs */}
                    <div className="flex items-center bg-[#161b22] border-b border-gray-800 overflow-x-auto flex-shrink-0">
                        {openTabs.map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveFile(tab)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-gray-800 whitespace-nowrap transition-colors ${activeFile === tab ? 'bg-[#0d1117] text-white border-t-2 border-t-blue-500' : 'text-gray-500 hover:text-gray-300'
                                    }`}
                            >
                                <span>{tab.split('/').pop()}</span>
                                <span
                                    onClick={(e) => closeTab(tab, e)}
                                    className="p-0.5 rounded hover:bg-gray-700 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Monaco editor */}
                    <div className="flex-1 min-h-0">
                        {activeFile && (
                            <Editor
                                height="100%"
                                language={getLanguage(activeFile)}
                                value={files.get(activeFile) || ''}
                                onChange={handleEditorChange}
                                theme="vs-dark"
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 14,
                                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                    lineNumbers: 'on',
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                    tabSize: 2,
                                    wordWrap: 'on',
                                    bracketPairColorization: { enabled: true },
                                    padding: { top: 8, bottom: 8 },
                                }}
                            />
                        )}
                    </div>

                    {/* Terminal panel */}
                    <div
                        className="flex-shrink-0 border-t border-gray-800 bg-[#0d1117]"
                        style={{ height: terminalHeight }}
                    >
                        <div className="flex items-center justify-between px-3 py-1 bg-[#161b22] border-b border-gray-800">
                            <div className="flex items-center gap-1.5">
                                <Terminal className="w-3 h-3 text-gray-500" />
                                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Terminal</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setTerminalHeight(h => h === 200 ? 350 : 200)}
                                    className="p-0.5 text-gray-500 hover:text-white transition-colors"
                                    title="Toggle terminal size"
                                >
                                    {terminalHeight > 200 ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                                </button>
                            </div>
                        </div>
                        <div ref={terminalRef} className="h-[calc(100%-24px)]" />
                    </div>
                </div>

                {/* Preview panel */}
                <div className="flex-shrink-0 border-l border-gray-800 bg-[#161b22] flex flex-col" style={{ width: previewWidth }}>
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800 flex-shrink-0">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Preview</span>
                        <div className="flex items-center gap-1">
                            {previewUrl && (
                                <button
                                    onClick={() => {
                                        const iframe = document.getElementById('preview-iframe') as HTMLIFrameElement;
                                        if (iframe) iframe.src = previewUrl;
                                    }}
                                    className="p-0.5 text-gray-500 hover:text-white transition-colors"
                                    title="Refresh preview"
                                >
                                    <RefreshCw className="w-3 h-3" />
                                </button>
                            )}
                            <button
                                onClick={() => setPreviewWidth(w => w === 350 ? 500 : 350)}
                                className="p-0.5 text-gray-500 hover:text-white transition-colors"
                            >
                                {previewWidth > 350 ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 bg-white">
                        {previewUrl ? (
                            <iframe
                                id="preview-iframe"
                                src={previewUrl}
                                className="w-full h-full border-0"
                                title="Project Preview"
                                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full bg-[#0d1117]">
                                <div className="text-center">
                                    <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <Play className="w-5 h-5 text-gray-600" />
                                    </div>
                                    <p className="text-xs text-gray-600">Click <strong className="text-green-500">▶ Run</strong> to see the preview</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
