import { useState, useRef, useEffect, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { Terminal as XTermTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
    FolderOpen, Folder, File, Plus, X, Square, ChevronRight, ChevronDown,
    RefreshCw, Terminal, MessageCircle, Send,
    Trash2, Globe, Code2, FolderInput,
    ChevronUp, Settings2, RotateCcw,
} from 'lucide-react';
import { WebContainer } from '@webcontainer/api';
import { useToasts, ToastContainer } from './CollabIDEHelpers';

// ===== Types (shared with CollabIDE) =====
interface ChatMessage { id: string; senderId: string; content: string; timestamp: Date; type: 'text' | 'system' | 'ai'; }
interface FileNode { name: string; type: 'file' | 'directory'; children?: FileNode[]; }

interface CollabIDEMobileProps {
    sessionId: string;
    partnerId: string;
    projectTitle: string;
    userId: string;
    userName: string;
    messages: ChatMessage[];
    onSendMessage: (msg: string) => void;
    lastSeenMessageCount: number;
    onMessagesSeen: (count: number) => void;
    files: Record<string, string>;
    activeFile: string;
    onFileChange: (path: string, content: string) => void;
    onSwitchFile: (path: string) => void;
    webcontainerRef: React.MutableRefObject<WebContainer | null>;
    previewUrl: string;
}

// ===== Tab types =====
type MobileTab = 'files' | 'code' | 'terminal' | 'preview' | 'chat';

function getLanguage(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
        css: 'css', scss: 'scss', html: 'html', json: 'json',
        md: 'markdown', yml: 'yaml', yaml: 'yaml', sh: 'shell', py: 'python',
    };
    return map[ext] || 'plaintext';
}

function getFileIcon(name: string) {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'tsx' || ext === 'jsx') return <span className="text-blue-400 text-[10px] font-bold mr-1">⚛</span>;
    if (ext === 'ts' || ext === 'js') return <span className="text-yellow-400 text-[10px] font-bold mr-1">JS</span>;
    if (ext === 'css' || ext === 'scss') return <span className="text-pink-400 text-[10px] font-bold mr-1">CSS</span>;
    if (ext === 'json') return <span className="text-orange-400 text-[10px] font-bold mr-1">{}</span>;
    if (ext === 'md') return <span className="text-gray-400 text-[10px] font-bold mr-1">MD</span>;
    if (ext === 'html') return <span className="text-orange-500 text-[10px] font-bold mr-1">H</span>;
    return <File className="w-3 h-3 mr-1 text-gray-500 flex-shrink-0" />;
}

// ===== Mobile File Tree =====
function MobileFileTree({
    files, activeFile, onSelectFile, onDeleteFile,
}: {
    files: Record<string, string>;
    activeFile: string;
    onSelectFile: (path: string) => void;
    onDeleteFile: (path: string) => void;
}) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set(['src']));
    const [longPressPath, setLongPressPath] = useState<string | null>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Build tree from flat file paths
    const buildTree = (files: Record<string, string>): FileNode[] => {
        const root: FileNode[] = [];
        const dirMap: Record<string, FileNode> = {};
        const sortedPaths = Object.keys(files).sort();
        for (const path of sortedPaths) {
            const parts = path.split('/');
            let current = root;
            for (let i = 0; i < parts.length - 1; i++) {
                const dirPath = parts.slice(0, i + 1).join('/');
                if (!dirMap[dirPath]) {
                    const node: FileNode = { name: parts[i], type: 'directory', children: [] };
                    dirMap[dirPath] = node;
                    current.push(node);
                }
                current = dirMap[dirPath].children!;
            }
            current.push({ name: parts[parts.length - 1], type: 'file' });
        }
        return root;
    };

    const tree = buildTree(files);

    const getFullPath = (node: FileNode, parentPath = ''): string => {
        return parentPath ? `${parentPath}/${node.name}` : node.name;
    };

    const renderNode = (node: FileNode, parentPath = '', depth = 0): React.ReactNode => {
        const fullPath = getFullPath(node, parentPath);
        const isExpanded = expanded.has(fullPath);
        const isActive = activeFile === fullPath;
        const indent = depth * 12;

        if (node.type === 'directory') {
            return (
                <div key={fullPath}>
                    <button
                        className={`w-full flex items-center gap-1.5 px-2 py-2 text-xs text-left transition-colors active:bg-gray-700 ${isExpanded ? 'text-gray-200' : 'text-gray-400'}`}
                        style={{ paddingLeft: `${8 + indent}px` }}
                        onClick={() => {
                            setExpanded(prev => {
                                const n = new Set(prev);
                                if (n.has(fullPath)) n.delete(fullPath); else n.add(fullPath);
                                return n;
                            });
                        }}
                    >
                        {isExpanded
                            ? <ChevronDown className="w-3 h-3 flex-shrink-0 text-gray-500" />
                            : <ChevronRight className="w-3 h-3 flex-shrink-0 text-gray-500" />
                        }
                        {isExpanded
                            ? <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-yellow-400" />
                            : <Folder className="w-3.5 h-3.5 flex-shrink-0 text-yellow-400" />
                        }
                        <span className="truncate font-medium">{node.name}</span>
                    </button>
                    {isExpanded && node.children?.map(child => renderNode(child, fullPath, depth + 1))}
                </div>
            );
        }

        return (
            <div key={fullPath} className="relative">
                <button
                    className={`w-full flex items-center px-2 py-2 text-xs text-left transition-colors ${isActive ? 'bg-blue-600/20 text-blue-300 border-l-2 border-blue-500' : 'text-gray-400 active:bg-gray-700'}`}
                    style={{ paddingLeft: `${8 + indent}px` }}
                    onClick={() => {
                        onSelectFile(fullPath);
                        if (longPressPath === fullPath) setLongPressPath(null);
                    }}
                    onTouchStart={() => {
                        longPressTimer.current = setTimeout(() => setLongPressPath(fullPath), 600);
                    }}
                    onTouchEnd={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }}
                >
                    {getFileIcon(node.name)}
                    <span className="truncate">{node.name}</span>
                </button>
                {/* Long-press context menu */}
                {longPressPath === fullPath && (
                    <div className="absolute right-2 top-0 z-50 bg-[#1e2030] border border-gray-700 rounded-lg shadow-xl overflow-hidden">
                        <button
                            className="flex items-center gap-2 px-3 py-2 text-xs text-red-400 active:bg-red-500/20 w-full"
                            onClick={(e) => { e.stopPropagation(); onDeleteFile(fullPath); setLongPressPath(null); }}
                        >
                            <Trash2 className="w-3 h-3" /> Delete
                        </button>
                        <button
                            className="flex items-center gap-2 px-3 py-2 text-xs text-gray-300 active:bg-gray-700 w-full"
                            onClick={() => setLongPressPath(null)}
                        >
                            <X className="w-3 h-3" /> Cancel
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex-1 overflow-y-auto">
            {tree.map(node => renderNode(node, '', 0))}
        </div>
    );
}

// ===== Main Mobile IDE =====
export function CollabIDEMobile({
    sessionId: _sessionId, projectTitle, userId, userName: _userName,
    messages, onSendMessage, lastSeenMessageCount, onMessagesSeen,
    files, activeFile, onFileChange, onSwitchFile,
    webcontainerRef, previewUrl,
}: CollabIDEMobileProps) {
    const [activeTab, setActiveTab] = useState<MobileTab>('code');
    const [chatInput, setChatInput] = useState('');
    const [isLandscape, setIsLandscape] = useState(
        window.innerWidth > window.innerHeight && window.innerWidth > 480
    );
    const [terminalRunning, setTerminalRunning] = useState(false);
    const [showNewFileInput, setShowNewFileInput] = useState(false);
    const [newFileName, setNewFileName] = useState('');
    const [editorTheme, setEditorTheme] = useState<'vs-dark' | 'light'>('vs-dark');

    const terminalRef = useRef<HTMLDivElement | null>(null);
    const termRef = useRef<XTermTerminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const shellWriterRef = useRef<WritableStreamDefaultWriter | null>(null);
    const chatEndRef = useRef<HTMLDivElement | null>(null);
    const { toasts, addToast } = useToasts();
    const unreadCount = messages.length - lastSeenMessageCount;

    // Orientation detection
    useEffect(() => {
        const onResize = () => {
            setIsLandscape(window.innerWidth > window.innerHeight && window.innerWidth > 480);
        };
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', () => setTimeout(onResize, 150));
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize as EventListener);
        };
    }, []);

    // Auto-mark chat as seen when chat tab is active
    useEffect(() => {
        if (activeTab === 'chat') {
            onMessagesSeen(messages.length);
        }
    }, [activeTab, messages.length, onMessagesSeen]);

    // Scroll chat to bottom
    useEffect(() => {
        if (activeTab === 'chat') {
            setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
    }, [messages, activeTab]);

    // Switch to chat tab on new message
    useEffect(() => {
        if (unreadCount > 0 && activeTab !== 'chat') {
            // Just badge — don't auto-switch, let user decide
        }
    }, [unreadCount, activeTab]);

    // Init xterm on terminal tab mount
    const initTerminal = useCallback(() => {
        if (termRef.current || !terminalRef.current) return;
        const term = new XTermTerminal({
            theme: {
                background: '#0d1117', foreground: '#c9d1d9',
                cursor: '#58a6ff', selectionBackground: '#264f78',
            },
            fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
            fontSize: 12,
            cursorBlink: true,
            convertEol: true,
            allowProposedApi: true,
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        setTimeout(() => { try { fitAddon.fit(); } catch { /**/ } }, 100);
        termRef.current = term;
        fitAddonRef.current = fitAddon;

        // Boot shell if WC available
        if (webcontainerRef.current) {
            bootShell(term);
        } else {
            term.writeln('\x1b[33mInitializing WebContainer...\x1b[0m');
        }
    }, [webcontainerRef]);

    const bootShell = async (term: XTermTerminal) => {
        try {
            const shell = await webcontainerRef.current!.spawn('jsh', {
                terminal: { cols: term.cols || 40, rows: term.rows || 20 },
            });
            const writer = shell.input.getWriter();
            shellWriterRef.current = writer;
            shell.output.pipeTo(new WritableStream({ write(data) { term.write(data); } }));
            term.onData((data: string) => writer.write(data));
            setTerminalRunning(true);
        } catch { /**/ }
    };

    useEffect(() => {
        if (activeTab === 'terminal') {
            setTimeout(() => {
                initTerminal();
                if (fitAddonRef.current) { try { fitAddonRef.current.fit(); } catch { /**/ } }
            }, 100);
        }
    }, [activeTab, initTerminal]);

    // Refit terminal on orientation change
    useEffect(() => {
        if (activeTab === 'terminal' && fitAddonRef.current) {
            setTimeout(() => { try { fitAddonRef.current!.fit(); } catch { /**/ } }, 200);
        }
    }, [isLandscape, activeTab]);

    const handleEditorMount: OnMount = (editor) => {
        editor.updateOptions({ fontSize: 12, wordWrap: 'on' });
    };

    const handleEditorChange = (value: string | undefined) => {
        if (value !== undefined) onFileChange(activeFile, value);
    };

    const createFile = () => {
        if (!newFileName.trim()) return;
        const path = newFileName.trim().includes('/') ? newFileName.trim() : newFileName.trim();
        onFileChange(path, '');
        onSwitchFile(path);
        setNewFileName('');
        setShowNewFileInput(false);
        setActiveTab('code');
        addToast(`Created ${path}`, 'success');
    };

    const deleteFile = (path: string) => {
        // Signal parent to remove file
        const event = new CustomEvent('mobile:deleteFile', { detail: { path } });
        window.dispatchEvent(event);
        if (activeFile === path) {
            const remaining = Object.keys(files).filter(f => f !== path);
            if (remaining.length > 0) onSwitchFile(remaining[0]);
        }
        addToast(`Deleted ${path.split('/').pop()}`, 'info');
    };

    const sendChat = () => {
        if (!chatInput.trim()) return;
        onSendMessage(chatInput.trim());
        setChatInput('');
    };

    const tabItems: { id: MobileTab; icon: React.ReactNode; label: string }[] = [
        { id: 'files', icon: <FolderInput className="w-5 h-5" />, label: 'Files' },
        { id: 'code', icon: <Code2 className="w-5 h-5" />, label: 'Code' },
        { id: 'terminal', icon: <Terminal className="w-5 h-5" />, label: 'Term' },
        { id: 'preview', icon: <Globe className="w-5 h-5" />, label: 'Preview' },
        { id: 'chat', icon: <MessageCircle className="w-5 h-5" />, label: 'Chat' },
    ];

    // ===== Landscape 2-Panel Layout =====
    if (isLandscape) {
        return (
            <div className="flex flex-col w-full h-full bg-[#0d1117] overflow-hidden">
                {/* Top bar */}
                <div className="flex items-center justify-between px-3 py-1 bg-[#161b22] border-b border-gray-800 flex-shrink-0" style={{ minHeight: 36 }}>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate max-w-[120px]">
                        {projectTitle || 'PairOn'}
                    </span>
                    <span className="text-[10px] text-gray-500 truncate max-w-[120px]">{activeFile}</span>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setActiveTab(t => t === 'preview' ? 'code' : 'preview')}
                            className={`p-1 rounded ${activeTab === 'preview' ? 'text-blue-400 bg-blue-400/10' : 'text-gray-500 hover:text-white'}`}>
                            <Globe className="w-4 h-4" />
                        </button>
                        <button onClick={() => setActiveTab(t => t === 'chat' ? 'code' : 'chat')}
                            className={`p-1 rounded relative ${activeTab === 'chat' ? 'text-blue-400 bg-blue-400/10' : 'text-gray-500 hover:text-white'}`}>
                            <MessageCircle className="w-4 h-4" />
                            {unreadCount > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 text-[7px] font-bold text-white rounded-full flex items-center justify-center">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                            )}
                        </button>
                        <button onClick={() => setEditorTheme(t => t === 'vs-dark' ? 'light' : 'vs-dark')}
                            className="p-1 text-gray-500 hover:text-white rounded">
                            <Settings2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* 2-column body */}
                <div className="flex flex-1 min-h-0 overflow-hidden">
                    {/* Left: File tree (180px) */}
                    <div className="w-[180px] flex-shrink-0 border-r border-gray-800 bg-[#161b22] flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-2 py-1 border-b border-gray-800 flex-shrink-0">
                            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Explorer</span>
                            <button onClick={() => setShowNewFileInput(v => !v)}
                                className="p-0.5 text-gray-500 hover:text-blue-400 rounded">
                                <Plus className="w-3 h-3" />
                            </button>
                        </div>
                        {showNewFileInput && (
                            <div className="px-2 py-1 border-b border-gray-800 flex-shrink-0">
                                <input
                                    autoFocus value={newFileName}
                                    onChange={e => setNewFileName(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') createFile(); if (e.key === 'Escape') setShowNewFileInput(false); }}
                                    placeholder="filename.tsx"
                                    className="w-full bg-[#0d1117] border border-blue-500 rounded px-1.5 py-1 text-[10px] text-white placeholder-gray-600 outline-none"
                                />
                            </div>
                        )}
                        <MobileFileTree files={files} activeFile={activeFile}
                            onSelectFile={p => { onSwitchFile(p); }}
                            onDeleteFile={deleteFile} />
                    </div>

                    {/* Right: Active panel */}
                    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                        {activeTab === 'code' && (
                            <Editor
                                height="100%" theme={editorTheme}
                                language={getLanguage(activeFile)}
                                value={files[activeFile] || ''}
                                onChange={handleEditorChange}
                                onMount={handleEditorMount}
                                options={{
                                    fontSize: 12, wordWrap: 'on',
                                    minimap: { enabled: false },
                                    lineNumbers: 'on', scrollBeyondLastLine: false,
                                    automaticLayout: true, tabSize: 2,
                                    folding: false, glyphMargin: false,
                                    lineDecorationsWidth: 4,
                                    lineNumbersMinChars: 3,
                                    padding: { top: 4, bottom: 4 },
                                    scrollbar: { verticalScrollbarSize: 4, horizontalScrollbarSize: 4 },
                                }}
                            />
                        )}
                        {activeTab === 'terminal' && (
                            <div ref={terminalRef} className="flex-1 w-full" />
                        )}
                        {activeTab === 'preview' && (
                            <div className="flex-1 flex flex-col">
                                <div className="flex items-center gap-1.5 px-2 py-1 bg-[#161b22] border-b border-gray-800 flex-shrink-0">
                                    <Globe className="w-3 h-3 text-green-400" />
                                    <span className="text-[10px] text-gray-400 truncate flex-1">{previewUrl || 'Starting...'}</span>
                                    {previewUrl && (
                                        <button onClick={() => {
                                            const el = document.getElementById('m-preview-iframe') as HTMLIFrameElement;
                                            if (el) el.src = previewUrl;
                                        }} className="p-0.5 text-gray-500 hover:text-white">
                                            <RefreshCw className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                                {previewUrl
                                    ? <iframe id="m-preview-iframe" src={previewUrl} className="flex-1 w-full border-0" title="Preview" sandbox="allow-scripts allow-same-origin allow-forms" />
                                    : <div className="flex-1 flex items-center justify-center bg-[#0d1117]">
                                        <div className="text-center text-gray-600">
                                            <RotateCcw className="w-6 h-6 mx-auto mb-2 animate-spin opacity-50" />
                                            <p className="text-xs">Starting preview...</p>
                                        </div>
                                    </div>
                                }
                            </div>
                        )}
                        {activeTab === 'chat' && (
                            <ChatPanel
                                messages={messages} userId={userId} chatInput={chatInput}
                                setChatInput={setChatInput} onSend={sendChat} chatEndRef={chatEndRef}
                            />
                        )}
                        {/* Bottom terminal strip when in code mode */}
                        {activeTab === 'code' && (
                            <button onClick={() => setActiveTab('terminal')}
                                className="flex-shrink-0 border-t border-gray-800 bg-[#161b22] flex items-center px-3 py-1 hover:bg-[#1e2030] transition-colors"
                                style={{ height: 24 }}>
                                <ChevronUp className="w-3 h-3 text-gray-500 mr-1" />
                                <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">Terminal</span>
                                {terminalRunning && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-500" />}
                            </button>
                        )}
                    </div>
                </div>

                <ToastContainer toasts={toasts} />
            </div>
        );
    }

    // ===== Portrait / Small Screen Layout =====
    return (
        <div className="flex flex-col w-full bg-[#0d1117] overflow-hidden" style={{ height: '100%' }}>
            {/* ── Top Header (32px) ── */}
            <header className="flex items-center gap-2 px-3 bg-[#161b22] border-b border-gray-800 flex-shrink-0" style={{ height: 40 }}>
                <span className="text-[10px] font-bold text-blue-400 truncate max-w-[80px]">
                    {projectTitle || 'PairOn'}
                </span>
                <div className="flex-1 overflow-x-auto flex items-center gap-0.5 scrollbar-hide">
                    {/* File tabs — horizontal scroll */}
                    {Object.keys(files).slice(0, 8).map(path => {
                        const name = path.split('/').pop() || path;
                        const isActive = activeFile === path;
                        return (
                            <button key={path}
                                onClick={() => { onSwitchFile(path); setActiveTab('code'); }}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] whitespace-nowrap flex-shrink-0 transition-colors ${isActive ? 'bg-blue-600/30 text-blue-300' : 'text-gray-500 hover:text-gray-300'}`}>
                                {name}
                                {isActive && <span className="w-1 h-1 rounded-full bg-blue-400" />}
                            </button>
                        );
                    })}
                </div>
                <button onClick={() => setEditorTheme(t => t === 'vs-dark' ? 'light' : 'vs-dark')}
                    className="p-1 text-gray-600 hover:text-gray-300 flex-shrink-0">
                    <Settings2 className="w-3.5 h-3.5" />
                </button>
            </header>

            {/* ── Active Panel (flex-1) ── */}
            <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {/* FILES TAB */}
                {activeTab === 'files' && (
                    <div className="flex-1 flex flex-col overflow-hidden bg-[#161b22]">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 flex-shrink-0">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Explorer</span>
                            <button onClick={() => setShowNewFileInput(v => !v)}
                                className="p-1 text-gray-500 hover:text-blue-400 rounded transition-colors">
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                        {showNewFileInput && (
                            <div className="px-3 py-2 border-b border-gray-800 flex gap-2 flex-shrink-0">
                                <input
                                    autoFocus value={newFileName}
                                    onChange={e => setNewFileName(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') createFile(); if (e.key === 'Escape') setShowNewFileInput(false); }}
                                    placeholder="filename.tsx or src/file.tsx"
                                    className="flex-1 bg-[#0d1117] border border-blue-500 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 outline-none"
                                />
                                <button onClick={createFile}
                                    className="px-2.5 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-500 transition-colors">
                                    Add
                                </button>
                            </div>
                        )}
                        <MobileFileTree files={files} activeFile={activeFile}
                            onSelectFile={p => { onSwitchFile(p); setActiveTab('code'); }}
                            onDeleteFile={deleteFile} />
                        <div className="px-3 py-2 border-t border-gray-800 flex-shrink-0">
                            <p className="text-[9px] text-gray-600 text-center">Long-press a file to delete</p>
                        </div>
                    </div>
                )}

                {/* CODE TAB */}
                {activeTab === 'code' && (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        {/* Sub-header: active file path */}
                        <div className="flex items-center gap-2 px-2 py-1 bg-[#0d1117] border-b border-gray-800 flex-shrink-0">
                            <Code2 className="w-3 h-3 text-blue-400 flex-shrink-0" />
                            <span className="text-[10px] text-gray-400 truncate flex-1">{activeFile}</span>
                        </div>
                        <div className="flex-1 min-h-0">
                            <Editor
                                height="100%" theme={editorTheme}
                                language={getLanguage(activeFile)}
                                value={files[activeFile] || ''}
                                onChange={handleEditorChange}
                                onMount={handleEditorMount}
                                options={{
                                    fontSize: 12,
                                    wordWrap: 'on',
                                    minimap: { enabled: false },
                                    lineNumbers: 'on',
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                    tabSize: 2,
                                    folding: false,
                                    glyphMargin: false,
                                    lineDecorationsWidth: 2,
                                    lineNumbersMinChars: 3,
                                    padding: { top: 4, bottom: 80 }, // bottom pad for keyboard
                                    scrollbar: {
                                        verticalScrollbarSize: 4,
                                        horizontalScrollbarSize: 4,
                                    },
                                    overviewRulerLanes: 0,
                                    renderLineHighlight: 'line',
                                    suggestFontSize: 11,
                                    suggestLineHeight: 20,
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* TERMINAL TAB */}
                {activeTab === 'terminal' && (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#0d1117]">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-gray-800 flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <Terminal className="w-3.5 h-3.5 text-green-400" />
                                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Terminal</span>
                                {terminalRunning && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                            </div>
                            <button onClick={() => {
                                if (termRef.current && shellWriterRef.current) {
                                    shellWriterRef.current.write('\x03'); // Ctrl+C
                                }
                            }} className="p-1 text-gray-500 hover:text-red-400 rounded transition-colors">
                                <Square className="w-3 h-3" />
                            </button>
                        </div>
                        <div ref={terminalRef} className="flex-1 w-full overflow-hidden" />
                    </div>
                )}

                {/* PREVIEW TAB */}
                {activeTab === 'preview' && (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#161b22] border-b border-gray-800 flex-shrink-0">
                            <Globe className="w-3.5 h-3.5 text-green-400" />
                            <span className="text-[10px] text-gray-400 truncate flex-1">
                                {previewUrl || 'Waiting for dev server...'}
                            </span>
                            {previewUrl && (
                                <button onClick={() => {
                                    const el = document.getElementById('m-preview-iframe') as HTMLIFrameElement;
                                    if (el) el.src = previewUrl;
                                }} className="p-1 text-gray-500 hover:text-white rounded">
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                        {previewUrl
                            ? <iframe
                                id="m-preview-iframe"
                                src={previewUrl}
                                className="flex-1 w-full border-0"
                                title="App Preview"
                                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                            />
                            : (
                                <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-[#0d1117]">
                                    <RotateCcw className="w-8 h-8 text-gray-700 animate-spin" />
                                    <div className="text-center">
                                        <p className="text-sm text-gray-500 font-medium">Starting preview…</p>
                                        <p className="text-[11px] text-gray-700 mt-1">Run npm run dev in terminal first</p>
                                    </div>
                                    <button onClick={() => setActiveTab('terminal')}
                                        className="px-4 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-500 transition-colors font-semibold">
                                        Open Terminal
                                    </button>
                                </div>
                            )
                        }
                    </div>
                )}

                {/* CHAT TAB */}
                {activeTab === 'chat' && (
                    <ChatPanel
                        messages={messages} userId={userId} chatInput={chatInput}
                        setChatInput={setChatInput} onSend={sendChat} chatEndRef={chatEndRef}
                    />
                )}
            </main>

            {/* ── Bottom Nav (48px) ── */}
            <nav className="flex-shrink-0 bg-[#161b22] border-t border-gray-800 flex items-stretch" style={{ height: 52 }}>
                {tabItems.map(tab => {
                    const isActive = activeTab === tab.id;
                    const badge = tab.id === 'chat' && unreadCount > 0;
                    return (
                        <button key={tab.id}
                            onClick={() => {
                                setActiveTab(tab.id);
                                if (tab.id === 'chat') onMessagesSeen(messages.length);
                            }}
                            className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors ${isActive ? 'text-blue-400' : 'text-gray-600 active:text-gray-400'}`}
                        >
                            {/* Active indicator bar */}
                            {isActive && (
                                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-blue-500 rounded-full" />
                            )}
                            {/* Badge */}
                            {badge && (
                                <span className="absolute top-1.5 right-[calc(50%-14px)] w-4 h-4 bg-red-500 text-[7px] font-bold text-white rounded-full flex items-center justify-center z-10">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                            )}
                            {tab.icon}
                            <span className="text-[9px] font-semibold tracking-wide">{tab.label}</span>
                        </button>
                    );
                })}
            </nav>

            <ToastContainer toasts={toasts} />
        </div>
    );
}

// ===== Reusable Chat Panel =====
function ChatPanel({
    messages, userId, chatInput, setChatInput, onSend, chatEndRef,
}: {
    messages: ChatMessage[];
    userId: string;
    chatInput: string;
    setChatInput: (v: string) => void;
    onSend: () => void;
    chatEndRef: React.RefObject<HTMLDivElement | null>;
}) {
    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#0d1117]">
            {/* Message list */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
                        <MessageCircle className="w-10 h-10 text-gray-700" />
                        <div>
                            <p className="text-sm text-gray-500 font-medium">No messages yet</p>
                            <p className="text-xs text-gray-700 mt-1">Say hi to your partner!</p>
                        </div>
                    </div>
                )}
                {messages.map(msg => {
                    const isMe = msg.senderId === userId;
                    if (msg.type === 'system' || msg.type === 'ai') {
                        return (
                            <div key={msg.id} className="flex justify-center">
                                <span className="text-[10px] text-gray-600 bg-gray-800/50 px-2.5 py-1 rounded-full">
                                    {msg.content}
                                </span>
                            </div>
                        );
                    }
                    return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${isMe
                                ? 'bg-blue-600 text-white rounded-br-sm'
                                : 'bg-[#1e2030] text-gray-200 border border-gray-800 rounded-bl-sm'
                            }`}>
                                {msg.content}
                                <div className={`text-[9px] mt-0.5 ${isMe ? 'text-blue-200' : 'text-gray-600'}`}>
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="flex-shrink-0 px-3 py-2 border-t border-gray-800 bg-[#161b22] flex items-end gap-2">
                <textarea
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
                    }}
                    placeholder="Message your partner..."
                    rows={1}
                    className="flex-1 bg-[#0d1117] border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500 resize-none leading-relaxed"
                    style={{ maxHeight: 100, minHeight: 40 }}
                    onInput={e => {
                        const el = e.currentTarget;
                        el.style.height = 'auto';
                        el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
                    }}
                />
                <button
                    onClick={onSend}
                    disabled={!chatInput.trim()}
                    className="w-10 h-10 flex-shrink-0 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-colors"
                >
                    <Send className="w-4 h-4 text-white" />
                </button>
            </div>
        </div>
    );
}
