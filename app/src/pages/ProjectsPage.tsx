import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, FolderOpen, CheckCircle, Clock, Download, ExternalLink, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { socketService } from '@/lib/socket';

interface Project {
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
}

const MODE_LABEL: Record<string, string> = {
  sprint: 'Sprint (3h)',
  challenge: 'Challenge (24h)',
  build: 'Build Week (7d)',
};

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) { setLoading(false); return; }

    socket.emit('dashboard:get-history');
    socket.once('dashboard:history', (history: any[]) => {
      // Only show completed sessions with a project title
      const completed = history
        .filter((s: any) => s.status === 'completed' || s.status === 'partner_skipped')
        .map((s: any) => ({
          sessionId: s.sessionId,
          partnerName: s.partnerName,
          partnerReputation: s.partnerReputation,
          mode: s.mode,
          projectIdea: s.projectIdea,
          status: s.status,
          startedAt: s.startedAt,
          endsAt: s.endsAt,
          tasksTotal: s.tasksTotal || 0,
          tasksDone: s.tasksDone || 0,
          submissionLink: s.submissionLink || '',
          submissionDesc: s.submissionDesc || '',
        }));
      setProjects(completed);
      setLoading(false);
    });
    // Timeout fallback
    const t = setTimeout(() => setLoading(false), 4000);
    return () => clearTimeout(t);
  }, []);

  const downloadProject = (project: Project) => {
    const content = `
PROJECT: ${project.projectIdea?.title || 'Untitled'}
=====================================================
Description: ${project.projectIdea?.description || 'No description'}
Mode: ${MODE_LABEL[project.mode] || project.mode}
Partner: ${project.partnerName}
Started: ${new Date(project.startedAt).toLocaleString()}
Completed: ${new Date(project.endsAt).toLocaleString()}
Tasks: ${project.tasksDone}/${project.tasksTotal} done
${project.submissionLink ? `Submission: ${project.submissionLink}` : ''}
${project.submissionDesc ? `Notes: ${project.submissionDesc}` : ''}
`.trim();
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(project.projectIdea?.title || 'project').replace(/\s+/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-pairon-bg dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/dashboard')} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <div>
          <h1 className="font-display font-semibold text-gray-900 dark:text-white">My Projects</h1>
          <p className="text-xs text-gray-500">{projects.length} completed project{projects.length !== 1 ? 's' : ''}</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-pairon-accent/30 border-t-pairon-accent rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <FolderOpen className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="font-display text-lg font-semibold text-gray-900 dark:text-white mb-2">No completed projects yet</h3>
            <p className="text-gray-500 text-sm mb-6">Start a collaboration and submit a project to see it here.</p>
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
                        className="p-2 text-gray-400 hover:text-pairon-accent rounded-lg hover:bg-pairon-accent/10 transition-colors"
                        title="Download project summary"
                      >
                        <Download className="w-4 h-4" />
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
