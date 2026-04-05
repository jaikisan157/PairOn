import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, FolderOpen, CheckCircle, Clock, Download, ExternalLink, Users, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import JSZip from 'jszip';

interface SavedProject {
  id?: string;
  sessionId: string;
  partnerName: string;
  partnerReputation: number;
  mode: string;
  projectIdea?: { title?: string; description?: string };
  status: string;
  startedAt: string;
  endsAt: string;
  tasksTotal: number;
  tasksDone: number;
  submissionLink?: string;
  submissionDesc?: string;
  savedAt?: string;
  files?: Record<string, string>;
}

const MODE_LABEL: Record<string, string> = {
  sprint: 'Sprint (3h)',
  challenge: 'Challenge (24h)',
  build: 'Build Week (7d)',
};

export function ProjectsPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      // ── Primary: fetch from DB ──
      const { projects: dbProjects } = await api.getProjects();
      setProjects(dbProjects);

      // Also merge any local-only projects (saved offline / before DB migration)
      // into the DB so they're persisted going forward.
      try {
        const local = JSON.parse(localStorage.getItem('saved_projects') || '[]') as SavedProject[];
        const dbSessionIds = new Set(dbProjects.map((p: SavedProject) => p.sessionId));
        const missingLocally = local.filter(lp => !dbSessionIds.has(lp.sessionId));
        for (const lp of missingLocally) {
          await api.saveProject(lp).catch(() => { /* non-critical */ });
        }
        if (missingLocally.length > 0) {
          // Re-fetch to include the newly migrated projects
          const { projects: refreshed } = await api.getProjects();
          setProjects(refreshed);
          refreshUser(); // Sync any earned reputation from these delayed submissions
          // Clear localStorage now that everything is in the DB
          localStorage.removeItem('saved_projects');
        }
      } catch { /* ignore local migration errors */ }
    } catch (err) {
      // ── Fallback: load from localStorage if API fails ──
      console.warn('[ProjectsPage] DB fetch failed, using localStorage fallback:', err);
      setError('Could not load from server. Showing locally cached projects.');
      const saved = JSON.parse(localStorage.getItem('saved_projects') || '[]') as SavedProject[];
      saved.sort((a, b) => new Date(b.savedAt || b.endsAt).getTime() - new Date(a.savedAt || a.endsAt).getTime());
      setProjects(saved);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const downloadProject = async (project: SavedProject) => {
    setDownloadingId(project.sessionId);
    try {
      const zip = new JSZip();
      const files = project.files || {};
      const hasFiles = Object.keys(files).length > 0;

      if (hasFiles) {
        for (const [path, content] of Object.entries(files)) {
          const cleanPath = path.startsWith('/') ? path.slice(1) : path;
          zip.file(cleanPath, content);
        }
      } else {
        const readme = [
          `# ${project.projectIdea?.title || 'Untitled Project'}`,
          '',
          `> ${project.projectIdea?.description || 'No description'}`,
          '',
          '## Session Info',
          `- **Mode**: ${MODE_LABEL[project.mode] || project.mode}`,
          `- **Partner**: ${project.partnerName}`,
          `- **Started**: ${new Date(project.startedAt).toLocaleString()}`,
          `- **Completed**: ${new Date(project.endsAt).toLocaleString()}`,
          `- **Tasks**: ${project.tasksDone}/${project.tasksTotal} done`,
          project.submissionLink ? `- **Submission**: ${project.submissionLink}` : '',
          project.submissionDesc ? `- **Notes**: ${project.submissionDesc}` : '',
          '',
          '_No project files were captured. Files are only available if saved immediately after session._',
        ].filter(Boolean).join('\n');
        zip.file('README.md', readme);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(project.projectIdea?.title || 'project').replace(/\s+/g, '_')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingId(null);
    }
  };

  const deleteProject = async (sessionId: string) => {
    // Optimistic update
    setProjects(prev => prev.filter(p => p.sessionId !== sessionId));
    try {
      await api.deleteProject(sessionId);
      // Also remove from localStorage cache
      try {
        const local = JSON.parse(localStorage.getItem('saved_projects') || '[]');
        localStorage.setItem('saved_projects', JSON.stringify(local.filter((p: any) => p.sessionId !== sessionId)));
      } catch { /* ignore */ }
    } catch (err) {
      console.error('[ProjectsPage] Delete failed:', err);
      // Revert on failure
      loadProjects();
    }
  };

  return (
    <div className="min-h-screen bg-pairon-bg dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/dashboard')} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <div className="flex-1">
          <h1 className="font-display font-semibold text-gray-900 dark:text-white">My Projects</h1>
          <p className="text-xs text-gray-500">
            {loading ? 'Loading…' : `${projects.length} saved project${projects.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={loadProjects}
          disabled={loading}
          className="p-2 text-gray-400 hover:text-pairon-accent rounded-lg hover:bg-pairon-accent/10 transition-colors disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-4 px-4 py-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl text-sm text-yellow-700 dark:text-yellow-400">
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-pairon-accent/30 border-t-pairon-accent rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <FolderOpen className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="font-display text-lg font-semibold text-gray-900 dark:text-white mb-2">No saved projects yet</h3>
            <p className="text-gray-500 text-sm mb-2">Complete a session and submit your project to save it here.</p>
            <p className="text-gray-400 text-xs mb-6">Projects are stored in the cloud and accessible from any device.</p>
            <Button onClick={() => navigate('/dashboard')} className="bg-pairon-accent hover:bg-pairon-accent/90 text-white rounded-xl">
              Find a Partner
            </Button>
          </motion.div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {projects.map((project, i) => (
                <motion.div
                  key={project.sessionId}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: i * 0.06 }}
                  className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                          {project.projectIdea?.title || 'Untitled Project'}
                        </h3>
                        {project.files && Object.keys(project.files).length > 0 && (
                          <span className="flex-shrink-0 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full font-medium">
                            {Object.keys(project.files).length} files
                          </span>
                        )}
                      </div>
                      {project.projectIdea?.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{project.projectIdea.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          w/ {project.partnerName}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {MODE_LABEL[project.mode] || project.mode}
                        </span>
                        <span>{new Date(project.startedAt).toLocaleDateString()}</span>
                        {project.tasksTotal > 0 && (
                          <span className="text-green-600 dark:text-green-400 font-medium">
                            {project.tasksDone}/{project.tasksTotal} tasks
                          </span>
                        )}
                        {project.savedAt && (
                          <span className="text-gray-300 dark:text-gray-600">
                            Saved {new Date(project.savedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {project.submissionLink && (
                        <a
                          href={project.submissionLink?.match(/^https?:\/\//i) ? project.submissionLink : `https://${project.submissionLink}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-gray-400 hover:text-pairon-accent rounded-lg hover:bg-pairon-accent/10 transition-colors"
                          title="Open submission"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        onClick={() => downloadProject(project)}
                        disabled={downloadingId === project.sessionId}
                        className="p-2 text-gray-400 hover:text-pairon-accent rounded-lg hover:bg-pairon-accent/10 transition-colors disabled:opacity-50"
                        title={project.files && Object.keys(project.files).length > 0 ? 'Download project ZIP' : 'Download project summary'}
                      >
                        {downloadingId === project.sessionId ? (
                          <span className="inline-block w-4 h-4 border-2 border-pairon-accent/30 border-t-pairon-accent rounded-full animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => deleteProject(project.sessionId)}
                        className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Remove from projects"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}
