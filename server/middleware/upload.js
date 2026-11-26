import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// Configures disk storage with random UUID filenames to prevent collision and path traversal
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const uniqueName = `img-${crypto.randomUUID()}${ext}`;
    cb(null, uniqueName);
  },
});

// Multer upload middleware enforcing 10MB limit and image extension filtering
export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();

    if (ALLOWED_EXTENSIONS.has(ext) && ALLOWED_MIME_TYPES.has(mime)) {
      return cb(null, true);
    }

    cb(new Error('Only image files (JPG, PNG, WebP, GIF) are allowed'));
  },
});

// Safely deletes file from disk ignoring missing file errors
function deleteFileSafe(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {}
}

// Inspects binary magic header bytes to verify the file content matches allowed image formats
export function validateMagicBytes(filePath, declaredMime = null) {
  let fd;
  const buffer = Buffer.alloc(16);
  let bytesRead = 0;
  let readSuccess = false;

  try {
    fd = fs.openSync(filePath, 'r');
    bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
    readSuccess = true;
  } catch {
    readSuccess = false;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }

  if (!readSuccess) {
    deleteFileSafe(filePath);
    return false;
  }

  let detectedFormat = null;
  if (bytesRead >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    detectedFormat = 'jpeg';
  } else if (bytesRead >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    detectedFormat = 'png';
  } else if (
    bytesRead >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    detectedFormat = 'webp';
  } else if (
    bytesRead >= 6 &&
    buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38 &&
    ((buffer[4] === 0x37 && buffer[5] === 0x61) || (buffer[4] === 0x39 && buffer[5] === 0x61))
  ) {
    detectedFormat = 'gif';
  }

  if (!detectedFormat) {
    deleteFileSafe(filePath);
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  const extMap = {
    '.jpg': 'jpeg',
    '.jpeg': 'jpeg',
    '.png': 'png',
    '.webp': 'webp',
    '.gif': 'gif',
  };

  if (ext) {
    const expectedFromExt = extMap[ext];
    if (!expectedFromExt || expectedFromExt !== detectedFormat) {
      deleteFileSafe(filePath);
      return false;
    }
  }

  if (declaredMime) {
    const mimeMap = {
      'image/jpeg': 'jpeg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    const expectedFromMime = mimeMap[declaredMime.toLowerCase()];
    if (!expectedFromMime || expectedFromMime !== detectedFormat) {
      deleteFileSafe(filePath);
      return false;
    }
  }

  return true;
}

// In-memory sliding-window rate limiter for file upload endpoints
export function createUploadLimiter(options = {}) {
  const windowMs = options.windowMs || 15 * 60 * 1000;
  const max = options.max !== undefined ? options.max : 20;
  const records = new Map();

  const limiter = (req, res, next) => {
    const now = Date.now();
    const identifier = (req.user && req.user.id)
      ? `user:${req.user.id}`
      : `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;

    const userRecords = records.get(identifier) || [];
    const validRecords = userRecords.filter((timestamp) => now - timestamp < windowMs);

    if (validRecords.length >= max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({
        error: 'Too many upload requests. Please try again later.',
      });
    }

    validRecords.push(now);
    records.set(identifier, validRecords);
    next();
  };

  limiter.reset = () => {
    records.clear();
  };

  return limiter;
}

export const uploadLimiter = createUploadLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
});
