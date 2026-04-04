import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { Project } from '../models/Project';

const router = Router();

// GET /api/projects — fetch all projects for the logged-in user
router.get('/', authMiddleware, async (req: any, res: any) => {
  try {
    const userId = req.user?.userId;
    const projects = await Project.find({ userId })
      .sort({ savedAt: -1 })
      .lean();

    res.json({
      projects: projects.map((p: any) => ({
        id: p._id.toString(),
        sessionId: p.sessionId,
        partnerName: p.partnerName,
        partnerId: p.partnerId,
        partnerReputation: p.partnerReputation,
        mode: p.mode,
        projectIdea: p.projectIdea,
        status: p.status,
        startedAt: p.startedAt,
        endsAt: p.endsAt,
        tasksTotal: p.tasksTotal,
        tasksDone: p.tasksDone,
        submissionLink: p.submissionLink,
        submissionDesc: p.submissionDesc,
        files: p.files,
        savedAt: p.savedAt,
      })),
    });
  } catch (error) {
    console.error('[Projects] GET error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/projects — save or upsert a project for the logged-in user
router.post('/', authMiddleware, async (req: any, res: any) => {
  try {
    const userId = req.user?.userId;
    const {
      sessionId,
      partnerName,
      partnerId,
      partnerReputation,
      mode,
      projectIdea,
      status,
      startedAt,
      endsAt,
      tasksTotal,
      tasksDone,
      submissionLink,
      submissionDesc,
      files,
    } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId is required' });
    }

    // Upsert: update if exists, insert if not, using userId + sessionId as key
    const project = await Project.findOneAndUpdate(
      { userId, sessionId },
      {
        $set: {
          userId,
          sessionId,
          partnerName: partnerName || 'Partner',
          partnerId: partnerId || '',
          partnerReputation: partnerReputation || 0,
          mode: mode || 'sprint',
          projectIdea: projectIdea || {},
          status: status || 'completed',
          startedAt: startedAt || '',
          endsAt: endsAt || '',
          tasksTotal: tasksTotal || 0,
          tasksDone: tasksDone || 0,
          submissionLink: submissionLink || '',
          submissionDesc: submissionDesc || '',
          files: files || {},
          savedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    res.status(201).json({
      project: {
        id: (project as any)._id.toString(),
        sessionId: project.sessionId,
      },
      message: 'Project saved successfully',
    });
  } catch (error) {
    console.error('[Projects] POST error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/projects/:sessionId — remove a project
router.delete('/:sessionId', authMiddleware, async (req: any, res: any) => {
  try {
    const userId = req.user?.userId;
    const { sessionId } = req.params;
    await Project.findOneAndDelete({ userId, sessionId });
    res.json({ message: 'Project deleted' });
  } catch (error) {
    console.error('[Projects] DELETE error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
