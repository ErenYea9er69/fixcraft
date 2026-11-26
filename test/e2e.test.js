import './test-env.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';
import app from '../server/server.js';
import db, { initDatabase, closeDatabase } from '../server/db.js';

describe('FixCraft End-to-End Lifecycle', () => {
  before(() => {
    initDatabase();
  });

  after(() => {
    closeDatabase();
    const dbPath = process.env.DB_PATH;
    if (dbPath && dbPath.includes('test-fixcraft')) {
      try { if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath); } catch {}
      try { if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`); } catch {}
      try { if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`); } catch {}
    }
  });

  test('Full repair lifecycle: Customer submits ticket -> Shop quotes -> Customer accepts -> Shop advances -> Customer collects -> Escrow released', async () => {
    // 1. Customer logs in
    const custLogin = await request(app).post('/api/auth/login').send({
      email: 'alex@example.com',
      password: 'password123'
    });
    assert.equal(custLogin.status, 200);
    const custToken = custLogin.body.token;

    // 2. Shop logs in
    const shopLogin = await request(app).post('/api/auth/login').send({
      email: 'apex@fixcraft.local',
      password: 'password123'
    });
    assert.equal(shopLogin.status, 200);
    const shopToken = shopLogin.body.token;

    // 3. Customer posts ticket
    const ticketRes = await request(app)
      .post('/api/client/requests')
      .set('Authorization', `Bearer ${custToken}`)
      .send({
        deviceCategory: 'laptop',
        deviceBrand: 'Dell',
        deviceModel: 'XPS 15 9520',
        issueCategory: 'Power',
        issueTitle: 'Burnt charging MOSFET',
        description: 'No power when plugging in 130W USB-C charger',
        location: 'San Francisco, CA'
      });
    assert.equal(ticketRes.status, 201);
    const requestId = ticketRes.body.id;

    // 4. Shop submits quote
    const quoteRes = await request(app)
      .post('/api/shop/quotes')
      .set('Authorization', `Bearer ${shopToken}`)
      .send({
        requestId,
        partsCost: 35,
        laborCost: 145,
        totalCost: 180,
        partsQuality: 'OEM Genuine',
        estimatedTurnaround: '24 hours',
        warrantyMonths: 6
      });
    assert.equal(quoteRes.status, 201);
    const quoteId = quoteRes.body.id;

    // 5. Customer accepts quote (Escrow funded)
    const acceptRes = await request(app)
      .post(`/api/client/quotes/${quoteId}/accept`)
      .set('Authorization', `Bearer ${custToken}`);
    assert.equal(acceptRes.status, 200);
    assert.equal(acceptRes.body.escrow.status, 'held_in_escrow');

    // 6. Shop sequentially advances stages to ready_for_pickup
    for (const nextStage of ['in_shop', 'diagnosing', 'in_repair', 'quality_check', 'ready_for_pickup']) {
      const benchRes = await request(app)
        .patch(`/api/shop/requests/${requestId}/advance-stage`)
        .set('Authorization', `Bearer ${shopToken}`)
        .send({ status: nextStage, technicianNotes: `Stage: ${nextStage} complete.` });
      assert.equal(benchRes.status, 200);
      assert.equal(benchRes.body.status, nextStage);
    }

    // 7. Customer confirms handover (Escrow released)
    const handoverRes = await request(app)
      .post(`/api/client/requests/${requestId}/confirm-handover`)
      .set('Authorization', `Bearer ${custToken}`);
    assert.equal(handoverRes.status, 200);
    assert.equal(handoverRes.body.request.status, 'completed');
    assert.equal(handoverRes.body.escrow.status, 'released_to_shop');
    assert.equal(handoverRes.body.escrow.shop_payout_amount, 180 - 180 * 0.05); // 171
  });
});

