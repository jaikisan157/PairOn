import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, FolderOpen, CheckCircle, Clock, Download, ExternalLink, Users, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import JSZip from 'jszip';

interface SavedProject {
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
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    // Load only explicitly-saved projects from localStorage
    const saved = JSON.parse(localStorage.getItem('saved_projects') || '[]') as SavedProject[];
    // Sort newest first
    saved.sort((a, b) => new Date(b.savedAt || b.endsAt).getTime() - new Date(a.savedAt || a.endsAt).getTime());
    setProjects(saved);
  }, []);

  const downloadProject = async (project: SavedProject) => {
    setDownloadingId(project.sessionId);
    try {
      const zip = new JSZip();
      const files = project.files || {};
      const hasFiles = Object.keys(files).length > 0;

      if (hasFiles) {
        // Add all IDE files to the zip
        for (const [path, content] of Object.entries(files)) {
          // Remove leading slash if present
          const cleanPath = path.startsWith('/') ? path.slice(1) : path;
          zip.file(cleanPath, content);
        }
      } else {
        // No files — create a README with project info
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

  const deleteProject = (sessionId: string) => {
    const updated = projects.filter(p => p.sessionId !== sessionId);
    setProjects(updated);
    localStorage.setItem('saved_projects', JSON.stringify(updated));
  };

  return (
    <div className="min-h-screen bg-pairon-bg dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/dashboard')} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <div>
          <h1 className="font-display font-semibold text-gray-900 dark:text-white">My Projects</h1>
          <p className="text-xs text-gray-500">{projects.length} saved project{projects.length !== 1 ? 's' : ''}</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {projects.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <FolderOpen className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="font-display text-lg font-semibold text-gray-900 dark:text-white mb-2">No saved projects yet</h3>
            <p className="text-gray-500 text-sm mb-2">Complete a session and choose to save your project when prompted.</p>
            <p className="text-gray-400 text-xs mb-6">Projects are saved when you click "Save to My Projects" at the end of a session.</p>
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
                          href={project.submissionLink}
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
