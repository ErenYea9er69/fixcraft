import './test-env.js';
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import app from '../server/server.js';
import { signToken } from '../server/middleware/auth.js';
import { initDatabase, closeDatabase } from '../server/db.js';
import { uploadLimiter, validateMagicBytes, uploadsDir } from '../server/middleware/upload.js';

describe('Secure Upload Pipeline & Input Boundary Validation', () => {
  let authToken;
  const createdUploadFiles = [];

  const recordCreatedFile = (filename) => {
    if (filename) {
      createdUploadFiles.push(path.resolve(uploadsDir, filename));
    }
  };

  before(() => {
    initDatabase();
    authToken = signToken({ id: 'user-admin', name: 'Admin', role: 'admin' });
  });

  after(() => {
    for (const filePath of createdUploadFiles) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {}
    }

    closeDatabase();
    const dbPath = process.env.DB_PATH;
    if (dbPath && dbPath.includes('test-fixcraft')) {
      try { if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath); } catch {}
      try { if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`); } catch {}
      try { if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`); } catch {}
    }
  });

  beforeEach(() => {
    uploadLimiter.reset();
  });

  test('POST /api/upload requires authentication with 401', async () => {
    const res = await request(app).post('/api/upload');
    assert.equal(res.status, 401);
  });

  test('POST /api/upload rejects disallowed extensions (.exe, .php, .sh, .html)', async () => {
    const disallowed = [
      { name: 'malware.exe', content: 'MZ executable binary', mime: 'application/x-msdownload' },
      { name: 'backdoor.php', content: '<?php echo "pwned"; ?>', mime: 'application/x-php' },
      { name: 'exploit.sh', content: '#!/bin/sh\nrm -rf /', mime: 'application/x-sh' },
      { name: 'phish.html', content: '<html><body>Fake</body></html>', mime: 'text/html' },
    ];

    for (const item of disallowed) {
      const res = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(item.content), {
          filename: item.name,
          contentType: item.mime,
        });

      assert.equal(res.status, 400, `Expected 400 for disallowed file ${item.name}`);
      assert.match(res.body.error, /Only image files/);
    }
  });

  test('POST /api/upload rejects unanchored extension tricks (.jpg.php)', async () => {
    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', Buffer.from('<?php phpinfo(); ?>'), {
        filename: 'payload.jpg.php',
        contentType: 'application/x-php',
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /Only image files/);
  });

  test('POST /api/upload rejects spoofed files and deletes them from disk', async () => {
    const spoofedContent = Buffer.from('<html><script>alert("xss")</script></html>');
    const existingBefore = new Set(fs.readdirSync(uploadsDir));

    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', spoofedContent, {
        filename: 'spoofed.png',
        contentType: 'image/png',
      });

    assert.equal(res.status, 400);
    assert.equal(
      res.body.error,
      'Invalid image content: Magic bytes do not match allowed image formats'
    );

    const existingAfter = new Set(fs.readdirSync(uploadsDir));
    assert.equal(existingAfter.size, existingBefore.size, 'Spoofed file must be deleted from disk');
  });

  test('POST /api/upload rejects spoofed JPEG with text content and deletes file', async () => {
    const textContent = Buffer.from('Plain text masquerading as jpeg image format');
    const existingBefore = new Set(fs.readdirSync(uploadsDir));

    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', textContent, {
        filename: 'spoofed.jpg',
        contentType: 'image/jpeg',
      });

    assert.equal(res.status, 400);
    assert.equal(
      res.body.error,
      'Invalid image content: Magic bytes do not match allowed image formats'
    );

    const existingAfter = new Set(fs.readdirSync(uploadsDir));
    assert.equal(existingAfter.size, existingBefore.size);
  });

  test('POST /api/upload rejects image format mismatch (JPEG bytes in .png)', async () => {
    const jpegBytesInPng = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
    const existingBefore = new Set(fs.readdirSync(uploadsDir));

    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', jpegBytesInPng, {
        filename: 'mismatch.png',
        contentType: 'image/png',
      });

    assert.equal(res.status, 400);
    assert.equal(
      res.body.error,
      'Invalid image content: Magic bytes do not match allowed image formats'
    );

    const existingAfter = new Set(fs.readdirSync(uploadsDir));
    assert.equal(existingAfter.size, existingBefore.size);
  });

  test('POST /api/upload accepts genuine PNG image', async () => {
    const validPng = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89
    ]);

    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', validPng, {
        filename: 'real.png',
        contentType: 'image/png',
      });

    assert.equal(res.status, 200);
    assert.ok(res.body.filename);
    assert.match(res.body.filename, /^img-[0-9a-fA-F-]+\.png$/);
    recordCreatedFile(res.body.filename);
    assert.equal(res.body.url, `/uploads/${res.body.filename}`);
    assert.ok(fs.existsSync(path.join(uploadsDir, res.body.filename)));
  });

  test('POST /api/upload accepts genuine JPEG image', async () => {
    const validJpeg = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
      0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
      0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9
    ]);

    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', validJpeg, {
        filename: 'real.jpg',
        contentType: 'image/jpeg',
      });

    assert.equal(res.status, 200);
    assert.ok(res.body.filename);
    assert.match(res.body.filename, /^img-[0-9a-fA-F-]+\.jpg$/);
    recordCreatedFile(res.body.filename);
    assert.equal(res.body.url, `/uploads/${res.body.filename}`);
    assert.ok(fs.existsSync(path.join(uploadsDir, res.body.filename)));
  });

  test('POST /api/upload accepts genuine WebP image', async () => {
    const validWebp = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x1A, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20
    ]);

    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', validWebp, {
        filename: 'real.webp',
        contentType: 'image/webp',
      });

    assert.equal(res.status, 200);
    assert.match(res.body.filename, /^img-[0-9a-fA-F-]+\.webp$/);
    recordCreatedFile(res.body.filename);
    assert.equal(res.body.url, `/uploads/${res.body.filename}`);
  });

  test('POST /api/upload accepts genuine GIF image', async () => {
    const validGif = Buffer.from(
      'GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b',
      'binary'
    );

    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', validGif, {
        filename: 'real.gif',
        contentType: 'image/gif',
      });

    assert.equal(res.status, 200);
    assert.match(res.body.filename, /^img-[0-9a-fA-F-]+\.gif$/);
    recordCreatedFile(res.body.filename);
    assert.equal(res.body.url, `/uploads/${res.body.filename}`);
  });

  test('POST /api/upload eliminates host header poisoning (returns relative URL)', async () => {
    const validPng = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52
    ]);

    const res = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Host', 'evil-phishing-host.attacker.com')
      .attach('file', validPng, {
        filename: 'test-host.png',
        contentType: 'image/png',
      });

    assert.equal(res.status, 200);
    recordCreatedFile(res.body.filename);
    assert.equal(res.body.url.startsWith('/uploads/'), true);
    assert.equal(res.body.url.includes('evil-phishing-host.attacker.com'), false);
    assert.equal(res.body.url.includes('http://'), false);
    assert.equal(res.body.url.includes('https://'), false);
  });

  test('Upload rate limiting triggers 429 when limit (20) is exceeded', async () => {
    const validPng = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52
    ]);

    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', validPng, {
          filename: `batch-${i}.png`,
          contentType: 'image/png',
        });
      assert.equal(res.status, 200, `Upload ${i + 1} should succeed`);
      recordCreatedFile(res.body.filename);
    }

    const rateLimitedRes = await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', validPng, {
        filename: 'overflow.png',
        contentType: 'image/png',
      });

    assert.equal(rateLimitedRes.status, 429);
    assert.equal(
      rateLimitedRes.body.error,
      'Too many upload requests. Please try again later.'
    );
  });

  test('Static /uploads serving sets X-Content-Type-Options: nosniff and CSP sandbox', async () => {
    const testFileName = `test-static-${Date.now()}.png`;
    const testFilePath = path.join(uploadsDir, testFileName);
    const pngContent = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52
    ]);

    fs.writeFileSync(testFilePath, pngContent);
    recordCreatedFile(testFileName);

    const res = await request(app).get(`/uploads/${testFileName}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(
      res.headers['content-security-policy'],
      "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    );
  });

  test('validateMagicBytes returns false and unlinks missing or truncated files', () => {
    assert.equal(validateMagicBytes('/tmp/non-existent-image-path-999.png'), false);

    const tempShortPath = path.join(uploadsDir, `short-${Date.now()}.png`);
    fs.writeFileSync(tempShortPath, Buffer.from([0x01, 0x02]));
    assert.equal(validateMagicBytes(tempShortPath), false);
    assert.equal(fs.existsSync(tempShortPath), false);
  });
});
