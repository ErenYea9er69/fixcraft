import bcrypt from 'bcryptjs';
import db, { runTransaction } from '../db.js';

// Seeds development database with test accounts, shops, requests, quotes, and timeline events
export function seedDevDatabase(database = db) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to execute devSeed in production environment');
  }

  const existingAdmin = database.prepare("SELECT id FROM users WHERE id = 'user-admin'").get();
  if (existingAdmin) {
    return;
  }

  const passwordHash = bcrypt.hashSync('password123', 10);
  const adminPasswordHash = bcrypt.hashSync('admin123', 10);
  const now = new Date();
  const hoursAgo = (h) => new Date(now.getTime() - h * 3600 * 1000).toISOString();
  const daysAgo = (d) => new Date(now.getTime() - d * 24 * 3600 * 1000).toISOString();

  runTransaction(() => {
    const insertUser = database.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, avatar, phone, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);
    const insertSettings = database.prepare(`
      INSERT INTO user_settings (user_id, default_address, default_city)
      VALUES (?, ?, ?)
    `);

    insertUser.run('user-admin', 'FixCraft Operations Admin', 'admin@fixcraft.local', adminPasswordHash, 'admin', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=120&h=120&q=80', '(415) 555-0100', daysAgo(30));
    insertSettings.run('user-admin', '100 Market St', 'San Francisco, CA');

    insertUser.run('user-alex', 'Alex Morgan', 'alex@example.com', passwordHash, 'customer', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&h=120&q=80', '(415) 555-8290', daysAgo(20));
    insertSettings.run('user-alex', '450 Mission St', 'San Francisco, CA');

    insertUser.run('user-sarah', 'Sarah Jenkins', 'sarah@example.com', passwordHash, 'customer', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&h=120&q=80', '(415) 555-3819', daysAgo(15));
    insertSettings.run('user-sarah', '780 Valencia St', 'San Francisco, CA');

    insertUser.run('user-marcus', 'Marcus Vance', 'marcus@example.com', passwordHash, 'customer', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&h=120&q=80', '(415) 555-9012', daysAgo(10));
    insertSettings.run('user-marcus', '1200 Folsom St', 'San Francisco, CA');

    insertUser.run('user-apex', 'David Vance (Apex MicroLab)', 'apex@fixcraft.local', passwordHash, 'shop', 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=120&h=120&q=80', '(415) 890-4421', daysAgo(40));
    insertSettings.run('user-apex', '742 Market St, Suite 400', 'San Francisco, CA');

    insertUser.run('user-urban', 'Elena Rostova (Urban Appliance)', 'urban@fixcraft.local', passwordHash, 'shop', 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=120&h=120&q=80', '(415) 642-8819', daysAgo(35));
    insertSettings.run('user-urban', '1280 Folsom Street', 'San Francisco, CA');

    insertUser.run('user-silicon', 'Kenji Sato (Silicon Craft)', 'silicon@fixcraft.local', passwordHash, 'shop', 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=120&h=120&q=80', '(415) 551-9032', daysAgo(30));
    insertSettings.run('user-silicon', '390 4th Street', 'San Francisco, CA');

    const insertShop = database.prepare(`
      INSERT INTO shops (
        id, user_id, name, tagline, logo, banner_image, address, city, phone, email,
        verified, specialties, rating, review_count, completed_repairs_count,
        turnaround_avg, warranty_standard, description, certifications, active_tech_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertShop.run(
      'shop-1', 'user-apex', 'Apex MicroSoldering & Lab',
      'Board-level diagnostics & precision hardware restoration',
      'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=200&h=200&q=80',
      'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=1200&h=400&q=80',
      '742 Market St, Suite 400', 'San Francisco, CA', '(415) 890-4421', 'service@apexmicrolab.com',
      1, JSON.stringify(['phone', 'laptop']), 4.96, 184, 1420, '4-6 hours', '12 Months Hassle-Free',
      'Specialized in micro-soldering, damaged trace reconstruction, BGA reballing, and OLED display restorations.',
      JSON.stringify(['IPC-A-610 Certified', 'Apple Independent Repair Provider', 'CompTIA A+ Master']),
      4, daysAgo(40)
    );

    insertShop.run(
      'shop-2', 'user-urban', 'Urban Appliance Masters',
      'Certified on-site & shop restoration for high-end home appliances',
      'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=200&h=200&q=80',
      'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&h=400&q=80',
      '1280 Folsom Street', 'San Francisco, CA', '(415) 642-8819', 'dispatch@urbanappliance.com',
      1, JSON.stringify(['appliance']), 4.92, 238, 2890, '24-48 hours', '18 Months Parts & Labor',
      'Factory-trained technicians for Bosch, Miele, LG, Whirlpool, Dyson, and Sub-Zero.',
      JSON.stringify(['NASTeC Certified Technician', 'EPA Section 608 Universal', 'Bosch Factory Trained']),
      6, daysAgo(35)
    );

    insertShop.run(
      'shop-3', 'user-silicon', 'Silicon Craft Logicworks',
      'Component-level logic board recovery & liquid spill rescue',
      'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=200&h=200&q=80',
      'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1200&h=400&q=80',
      '390 4th Street', 'San Francisco, CA', '(415) 551-9032', 'bench@siliconlogicworks.com',
      1, JSON.stringify(['laptop', 'phone']), 4.88, 112, 840, '1-2 business days', '6 Months Full Coverage',
      'Pioneers in non-invasive schematic probing, power delivery PMIC replacement, and clean ultrasonic spill de-corrosion.',
      JSON.stringify(['Board-Level Schematic Specialist', 'ESD Safe Cleanroom Certified']),
      3, daysAgo(30)
    );

    const insertRequest = database.prepare(`
      INSERT INTO repair_requests (
        id, customer_id, device_category, device_brand, device_model,
        serial_number, device_year, issue_category, issue_title, description,
        photos, urgency, preferred_service, location, status, accepted_quote_id, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
    `);

    insertRequest.run(
      'req-1', 'user-alex', 'phone', 'Apple', 'iPhone 15 Pro Max',
      'F2LXP908MD6R', '2023', 'Screen & Display',
      'Shattered Super Retina OLED & Flickering Vertical Green Line',
      'Dropped from 6ft on asphalt. Glass shattered across corner, display shows vertical neon green artifact line and touch response is dead on right quadrant. Titanium frame undamaged.',
      JSON.stringify(['https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?auto=format&fit=crop&w=800&q=80']),
      'urgent', 'dropoff', 'Downtown / SoMa, SF', 'quote_accepted', null, daysAgo(3), daysAgo(3)
    );

    insertRequest.run(
      'req-2', 'user-alex', 'laptop', 'Apple', 'MacBook Pro 16" (M1 Max)',
      'C02G90PLMD6T', '2021', 'Logic Board & Power',
      'Liquid Spill — Shorted MagSafe 3 Power Rail (PPBUS_G3H)',
      'Coffee spill over trackpad and keyboard. Unit died instantly, zero amber/orange light on MagSafe 3 cable. Ultrasonic board clean and ISL9240 power controller IC reflow completed. Now in 24hr burn-in stress test and sensor calibration.',
      JSON.stringify(['https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=800&q=80']),
      'urgent', 'dropoff', 'Financial District, SF', 'in_repair', null, daysAgo(5), daysAgo(2)
    );

    insertRequest.run(
      'req-completed-1', 'user-alex', 'phone', 'Apple', 'iPad Pro 12.9" (M1)',
      'DMPX908123A', '2021', 'Port & Power',
      'Damaged USB-C Dock Port & Flex Assembly Replacement',
      'Thunderbolt port was bent from sideways cable trip. Replaced modular port assembly and verified 18W fast charging and DisplayPort video output.',
      JSON.stringify(['https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=800&q=80']),
      'standard', 'dropoff', 'Downtown / SoMa, SF', 'completed', daysAgo(13), daysAgo(18), daysAgo(13)
    );

    insertRequest.run(
      'req-inbound-1', 'user-alex', 'laptop', 'Dell', 'XPS 15 9530',
      'DLXPS-9530-99', '2023', 'Motherboard & Power',
      'Burnt USB-C Charging MOSFET & Dual Fan Bearing Rattle',
      'Laptop suddenly popped while connected to 130W USB-C charger and emitted faint electrical burn smell. Machine boots only on remaining 8% battery, will not draw charge. Right cooling fan vibrates heavily at 4000+ RPM.',
      JSON.stringify(['https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=800&q=80']),
      'urgent', 'dropoff', 'Downtown / SoMa, SF', 'open', null, hoursAgo(10), hoursAgo(10)
    );

    insertRequest.run(
      'req-inbound-2', 'user-sarah', 'phone', 'Google', 'Pixel 8 Pro',
      'P8P-US-00912', '2023', 'Camera & Optics',
      'Smashed Telephoto Camera Visor Lens & Moisture Ingress',
      'Rear camera glass visor cracked across 5x periscope telephoto module. Lens elements exposed to humidity, camera app exhibits severe optical flare and focus hunting in low light.',
      JSON.stringify(['https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80']),
      'standard', 'dropoff', 'Marina District, SF', 'open', null, hoursAgo(12), hoursAgo(12)
    );

    insertRequest.run(
      'req-inbound-3', 'user-marcus', 'appliance', 'Breville', 'Barista Touch Espresso BES880BSS',
      'BRV-BES880-771', '2022', 'Heating & Hydraulics',
      'ThermoJet High-Pressure Steam Block Leak & Error 03 Code',
      'Espresso machine displays error 03 during pre-infusion. Steam wand drips scalding water from interior group collar. Internal pump cycles loudly without reaching 9 bar extraction pressure.',
      JSON.stringify(['https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=800&q=80']),
      'flexible', 'dropoff', 'Mission District, SF', 'open', null, hoursAgo(14), hoursAgo(14)
    );

    const insertQuote = database.prepare(`
      INSERT INTO quotes (
        id, request_id, shop_id, parts_cost, labor_cost, diagnostic_fee,
        diagnostic_fee_waived, total_cost, parts_quality, estimated_turnaround,
        turnaround_days, warranty_months, warranty_details, technician_notes, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertQuote.run(
      'q-101', 'req-1', 'shop-1', 280, 85, 30, 1, 280,
      'OEM Genuine', '3-4 hours', 0.2, 12, '12-Month OLED warranty.',
      'Authentic factory-calibrated OLED panels with TrueTone serial programming.',
      'accepted', daysAgo(3)
    );

    insertQuote.run(
      'q-201', 'req-2', 'shop-1', 60, 280, 50, 1, 340,
      'OEM Genuine', '1-2 business days', 1.5, 12, '1 Year coverage on micro-soldered capacitors.',
      'Board extraction, ultrasonic cleaning, and PMIC capacitor replacement.',
      'accepted', daysAgo(4)
    );

    insertQuote.run(
      'q-comp-1', 'req-completed-1', 'shop-1', 45, 135, 30, 1, 180,
      'OEM Genuine', '4 hours', 0.5, 6, '6 Months port replacement warranty.',
      'OEM dock flex replaced, 18W fast charging confirmed.',
      'accepted', daysAgo(17)
    );

    // Relink accepted_quote_id after quotes exist
    database.prepare('UPDATE repair_requests SET accepted_quote_id = ? WHERE id = ?').run('q-101', 'req-1');
    database.prepare('UPDATE repair_requests SET accepted_quote_id = ? WHERE id = ?').run('q-201', 'req-2');
    database.prepare('UPDATE repair_requests SET accepted_quote_id = ? WHERE id = ?').run('q-comp-1', 'req-completed-1');

    const insertEscrow = database.prepare(`
      INSERT INTO escrow_ledger (
        id, request_id, customer_id, shop_id, subtotal, platform_fee,
        total_amount, customer_refund_amount, shop_payout_amount, status, created_at, released_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertEscrow.run(
      'escrow-101', 'req-1', 'user-alex', 'shop-1', 280, 14, 280, 0, 0, 'held_in_escrow', daysAgo(3), null
    );

    insertEscrow.run(
      'escrow-201', 'req-2', 'user-sarah', 'shop-1', 340, 17, 340, 0, 0, 'held_in_escrow', daysAgo(4), null
    );

    insertEscrow.run(
      'escrow-comp-1', 'req-completed-1', 'user-alex', 'shop-1', 180, 9, 180, 0, 171, 'released_to_shop', daysAgo(17), daysAgo(13)
    );

    const insertTimeline = database.prepare(`
      INSERT INTO timeline_events (
        id, request_id, status, title, description, technician_notes, photo_proof, completed, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertTimeline.run('t-101', 'req-1', 'open', 'Repair Request Published', 'Device broadcasted to certified SF Bay workshops.', null, null, 1, daysAgo(3));
    insertTimeline.run('t-102', 'req-1', 'quote_accepted', 'Quote Accepted & Escrow Locked', 'Apex MicroSoldering proposal accepted at $280.00. Funds secured in FixCraft escrow.', null, null, 1, daysAgo(3));

    insertTimeline.run('t-201', 'req-2', 'open', 'Intake Ticket Created', 'Liquid spill intake recorded.', null, null, 1, daysAgo(5));
    insertTimeline.run('t-202', 'req-2', 'quote_accepted', 'Quote Accepted: Apex MicroSoldering', 'Binding quote accepted at $340.00.', null, null, 1, daysAgo(5));
    insertTimeline.run('t-203', 'req-2', 'in_shop', 'Workshop Counter Check-In', 'Laptop received at 742 Market St bench.', null, null, 1, daysAgo(4));
    insertTimeline.run('t-204', 'req-2', 'diagnosing', 'Multimeter Probing & Thermal Cam', 'Short detected on PPBUS_G3H rail near C9102.', 'Short located.', null, 1, daysAgo(3));
    insertTimeline.run('t-205', 'req-2', 'in_repair', 'Ultrasonic Wash & Component Soldering', 'Replaced 0402 ceramic capacitor bank and reflowed ISL9240 controller.', 'Power rail 12.6V nominal restored.', null, 1, daysAgo(2));

    insertTimeline.run('t-c1-1', 'req-completed-1', 'open', 'Request Created', 'Intake recorded.', null, null, 1, daysAgo(18));
    insertTimeline.run('t-c1-2', 'req-completed-1', 'ready_for_pickup', 'Ready for Collection', 'Completed bench testing.', null, null, 1, daysAgo(14));
    insertTimeline.run('t-c1-3', 'req-completed-1', 'completed', 'Handover Certified & Escrow Released', 'Customer confirmed device operation. Payout released to workshop.', null, null, 1, daysAgo(13));
  });
}
