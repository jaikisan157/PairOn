import express from 'express';
import { authMiddleware } from '../middleware/auth';
import { Feedback } from '../models';
import mongoose from 'mongoose';

const router = express.Router();

// Get all feedback, sorted by likes descending
router.get('/', authMiddleware, async (req, res) => {
  try {
    const feedbacks = await Feedback.find()
      .populate('author', 'name email reputation avatar')
      .lean();

    // Sort by likes array length in memory (since mongoose doesn't support easy array length sort without aggregation)
    feedbacks.sort((a, b) => b.likes.length - a.likes.length || b.createdAt.getTime() - a.createdAt.getTime());

    res.json(feedbacks);
  } catch (err) {
    console.error('Fetch feedback error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create new feedback
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, category } = req.body;
    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    const feedback = new Feedback({
      title,
      description,
      category: category || 'general',
      author: req.user!.userId,
      likes: []
    });

    await feedback.save();
    res.status(201).json(feedback);
  } catch (err) {
    console.error('Create feedback error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Toggle like
router.post('/:id/like', authMiddleware, async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) {
      return res.status(404).json({ message: 'Feedback not found' });
    }

    const userId = req.user!.userId;
    const index = feedback.likes.findIndex(id => id.toString() === userId);

    const isLiked = index > -1;
    if (isLiked) {
      feedback.likes.splice(index, 1);
    } else {
      feedback.likes.push(new mongoose.Types.ObjectId(userId));
    }

    await feedback.save();
    
    // Return updated likes list
    res.json({ isLiked: !isLiked, likes: feedback.likes });
  } catch (err) {
    console.error('Toggle like error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete feedback (only author can delete)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) {
      return res.status(404).json({ message: 'Feedback not found' });
    }

    if (feedback.author.toString() !== req.user!.userId && req.user!.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete' });
    }

    await feedback.deleteOne();
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    console.error('Delete feedback error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
