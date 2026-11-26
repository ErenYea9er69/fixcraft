import express from 'express';
import fs from 'fs';
import { upload, validateMagicBytes, uploadLimiter } from '../middleware/upload.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Uploads a single image validating MIME, extension, and binary magic bytes
router.post('/', authenticateToken, uploadLimiter, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    if (!validateMagicBytes(req.file.path, req.file.mimetype)) {
      if (fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
      }
      return res.status(400).json({
        error: 'Invalid image content: Magic bytes do not match allowed image formats',
      });
    }

    const fileUrl = `/uploads/${req.file.filename}`;

    res.json({
      url: fileUrl,
      filename: req.file.filename,
      size: req.file.size,
    });
  });
});

export { uploadLimiter };
export default router;
