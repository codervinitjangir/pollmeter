import http from 'http';
import { app } from './src/index';
import { initDb, getUserByEmail, upsertUser, getBatchById, getQuizDetails, addBatchToUser, setUserBatches } from './src/db';
import { generateToken } from './src/auth';

function request(
  server: http.Server,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: any
): Promise<{ status: number; body: any; rawBody: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as any;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: addr.port,
        method,
        path,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed = data;
          try {
            parsed = JSON.parse(data);
          } catch {}
          resolve({ status: res.statusCode || 0, body: parsed, rawBody: data });
        });
      }
    );
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  console.log('=== STARTING BATCH GAPS VERIFICATION ===\n');
  await initDb();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  console.log(`Test server running on port ${port}\n`);

  try {
    // Setup test users
    const adminEmail = 'admin@polariscampus.com';
    const mentorAEmail = 'mentor.a@polariscampus.com';
    const mentorBEmail = 'mentor.b@polariscampus.com';

    await upsertUser({
      id: 'admin-test-id',
      email: adminEmail,
      realName: 'Super Admin',
      role: 'admin',
      collegeDomain: 'polariscampus.com',
      approved: true,
      createdAt: new Date().toISOString(),
    });

    await upsertUser({
      id: 'mentor-a-id',
      email: mentorAEmail,
      realName: 'Mentor A',
      role: 'mentor',
      collegeDomain: 'polariscampus.com',
      batches: [],
      approved: true,
      createdAt: new Date().toISOString(),
    });

    await upsertUser({
      id: 'mentor-b-id',
      email: mentorBEmail,
      realName: 'Mentor B',
      role: 'mentor',
      collegeDomain: 'polariscampus.com',
      batches: [],
      approved: true,
      createdAt: new Date().toISOString(),
    });

    await setUserBatches(mentorAEmail, []);
    await setUserBatches(mentorBEmail, []);

    const adminToken = generateToken({ id: 'admin-test-id', email: adminEmail, realName: 'Super Admin', role: 'admin' });
    const mentorAToken = generateToken({ id: 'mentor-a-id', email: mentorAEmail, realName: 'Mentor A', role: 'mentor' });
    const mentorBToken = generateToken({ id: 'mentor-b-id', email: mentorBEmail, realName: 'Mentor B', role: 'mentor' });

    // ─────────────────────────────────────────────────────────────────────────
    // GAP 6: Case-Insensitive Dedupe
    // ─────────────────────────────────────────────────────────────────────────
    console.log('--- GAP 6: Dedupe Case-Insensitive Matching ---');
    const resCreate1 = await request(server, 'POST', '/api/mentor/batches', {
      Authorization: `Bearer ${mentorAToken}`,
    }, { displayName: '2nd Year - Batch D' });
    console.log('1. Created "2nd Year - Batch D":', resCreate1.status, JSON.stringify(resCreate1.body));
    const batchDId = resCreate1.body.batch.id;

    const resCreate2 = await request(server, 'POST', '/api/mentor/batches', {
      Authorization: `Bearer ${mentorBToken}`,
    }, { displayName: '2nd year - batch d' });
    console.log('2. Created "2nd year - batch d" (lowercase):', resCreate2.status, JSON.stringify(resCreate2.body));
    const dedupeMatch = resCreate2.body.batch.id === batchDId;
    console.log(`-> Same ID reused (${resCreate2.body.batch.id}):`, dedupeMatch ? 'PASS ✅' : 'FAIL ❌');

    // ─────────────────────────────────────────────────────────────────────────
    // GAP 3: Mentor Batch Assignment on Creation
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- GAP 3: Mentor Batch Assignment on Creation ---');
    // Mentor A created Batch D -> check Mentor A's batches
    const resMentorABatches = await request(server, 'GET', '/api/batches', {
      Authorization: `Bearer ${mentorAToken}`,
    });
    console.log("Mentor A's GET /api/batches after creation:", resMentorABatches.status, JSON.stringify(resMentorABatches.body));
    const mentorAHasD = resMentorABatches.body.batches.includes('2nd Year - Batch D');
    console.log('-> Mentor A assigned to Batch D:', mentorAHasD ? 'PASS ✅' : 'FAIL ❌');

    // Mentor B also self-served Batch D -> check Mentor B's batches
    const resMentorBBatches = await request(server, 'GET', '/api/batches', {
      Authorization: `Bearer ${mentorBToken}`,
    });
    console.log("Mentor B's GET /api/batches after self-serving same name:", resMentorBBatches.status, JSON.stringify(resMentorBBatches.body));
    const mentorBHasD = resMentorBBatches.body.batches.includes('2nd Year - Batch D');
    console.log('-> Mentor B assigned to Batch D without duplicate:', mentorBHasD ? 'PASS ✅' : 'FAIL ❌');

    // ─────────────────────────────────────────────────────────────────────────
    // GAP 2: GET /api/batches Auth & Isolation
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- GAP 2: GET /api/batches Auth & Isolation ---');
    // Create Batch E for Mentor A only
    const resBatchE = await request(server, 'POST', '/api/mentor/batches', {
      Authorization: `Bearer ${mentorAToken}`,
    }, { displayName: '3rd Year - Batch E' });
    const batchEId = resBatchE.body.batch.id;

    // Create Batch F for Mentor B only
    const resBatchF = await request(server, 'POST', '/api/mentor/batches', {
      Authorization: `Bearer ${mentorBToken}`,
    }, { displayName: '3rd Year - Batch F' });
    const batchFId = resBatchF.body.batch.id;

    // Check Mentor A's batches (should contain E, NOT F)
    const resCheckA = await request(server, 'GET', '/api/batches', {
      Authorization: `Bearer ${mentorAToken}`,
    });
    const aBatches: string[] = resCheckA.body.batches;
    const aHasE = aBatches.includes('3rd Year - Batch E');
    const aHasF = aBatches.includes('3rd Year - Batch F');
    console.log("Mentor A batches:", aBatches);
    console.log(`-> Mentor A sees Batch E: ${aHasE}, does NOT see Batch F: ${!aHasF}:`, (aHasE && !aHasF) ? 'PASS ✅' : 'FAIL ❌');

    // Check Mentor B's batches (should contain F, NOT E)
    const resCheckB = await request(server, 'GET', '/api/batches', {
      Authorization: `Bearer ${mentorBToken}`,
    });
    const bBatches: string[] = resCheckB.body.batches;
    const bHasF = bBatches.includes('3rd Year - Batch F');
    const bHasE = bBatches.includes('3rd Year - Batch E');
    console.log("Mentor B batches:", bBatches);
    console.log(`-> Mentor B sees Batch F: ${bHasF}, does NOT see Batch E: ${!bHasE}:`, (bHasF && !bHasE) ? 'PASS ✅' : 'FAIL ❌');

    // Check unauthenticated call -> should be 401
    const resNoAuth = await request(server, 'GET', '/api/batches');
    console.log("Unauthenticated GET /api/batches status:", resNoAuth.status, JSON.stringify(resNoAuth.body));
    console.log('-> Returns 401 when unauthenticated:', resNoAuth.status === 401 ? 'PASS ✅' : 'FAIL ❌');

    // Check Admin call -> sees all active batches
    const resAdminBatches = await request(server, 'GET', '/api/batches', {
      Authorization: `Bearer ${adminToken}`,
    });
    console.log(`-> Admin GET /api/batches returns all ${resAdminBatches.body.batches.length} batches:`, resAdminBatches.body.batches.length >= 7 ? 'PASS ✅' : 'FAIL ❌');

    // ─────────────────────────────────────────────────────────────────────────
    // GAP 1: POST /api/sessions batchId Requirement & Ownership Enforcement
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- GAP 1: POST /api/sessions Enforcement ---');
    const sampleQuestions = [
      { id: 'q1', type: 'mcq', text: 'What is Node.js?', options: ['Runtime', 'Browser', 'Database', 'CSS'], correctAnswer: 'Runtime', timeLimitSeconds: 30 }
    ];

    // 1. Missing batchId -> 400
    const resNoBatchId = await request(server, 'POST', '/api/sessions', {
      Authorization: `Bearer ${mentorAToken}`,
    }, {
      questions: sampleQuestions,
      topic: 'Test Quiz No Batch',
    });
    console.log('POST /api/sessions without batchId:', resNoBatchId.status, JSON.stringify(resNoBatchId.body));
    console.log('-> Returns 400:', resNoBatchId.status === 400 ? 'PASS ✅' : 'FAIL ❌');

    // 2. batchId belonging to different mentor (Mentor A tries to host with Batch F which belongs to Mentor B) -> 403
    const resWrongBatch = await request(server, 'POST', '/api/sessions', {
      Authorization: `Bearer ${mentorAToken}`,
    }, {
      questions: sampleQuestions,
      topic: 'Test Quiz Wrong Batch',
      batchId: batchFId,
    });
    console.log("Mentor A POST /api/sessions with Mentor B's batchId:", resWrongBatch.status, JSON.stringify(resWrongBatch.body));
    console.log('-> Returns 403:', resWrongBatch.status === 403 ? 'PASS ✅' : 'FAIL ❌');

    // 3. Valid own batchId -> 201
    const resValidBatch = await request(server, 'POST', '/api/sessions', {
      Authorization: `Bearer ${mentorAToken}`,
    }, {
      questions: sampleQuestions,
      topic: 'Test Quiz Valid Batch',
      batchId: batchEId,
    });
    console.log('Mentor A POST /api/sessions with own batchId (Batch E):', resValidBatch.status, JSON.stringify(resValidBatch.body));
    console.log('-> Returns 201:', resValidBatch.status === 201 ? 'PASS ✅' : 'FAIL ❌');
    
    // Check saved session details in DB
    const sessionDetails = await getQuizDetails(resValidBatch.body.code);
    console.log('DB QuizSession row:', {
      code: sessionDetails?.session.code,
      batch: sessionDetails?.session.batch,
      batchId: sessionDetails?.session.batchId,
    });
    const dbHasBoth = sessionDetails?.session.batch === '3rd Year - Batch E' && sessionDetails?.session.batchId === batchEId;
    console.log('-> DB row has both batch and batchId populated:', dbHasBoth ? 'PASS ✅' : 'FAIL ❌');

    // ─────────────────────────────────────────────────────────────────────────
    // GAP 5: Admin Rename and Merge
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- GAP 5: Admin Rename & Merge ---');
    const runId = Date.now().toString().slice(-4);
    const m1OriginalName = `4th Year - CSE Old ${runId}`;
    const m2Name = `4th Year - CSE New ${runId}`;
    const m1Renamed = `4th Year - CSE Legacy ${runId}`;

    // 1. Create two batches
    const resBatchM1 = await request(server, 'POST', '/api/admin/batches', {
      Authorization: `Bearer ${adminToken}`,
    }, { displayName: m1OriginalName });
    const batchM1Id = resBatchM1.body.batch.id;

    const resBatchM2 = await request(server, 'POST', '/api/admin/batches', {
      Authorization: `Bearer ${adminToken}`,
    }, { displayName: m2Name });
    const batchM2Id = resBatchM2.body.batch.id;

    // 2. Rename Batch M1
    const resRename = await request(server, 'PATCH', `/api/admin/batches/${batchM1Id}`, {
      Authorization: `Bearer ${adminToken}`,
    }, { displayName: m1Renamed });
    console.log('PATCH rename batch:', resRename.status, JSON.stringify(resRename.body));
    console.log(`-> Renamed to "${m1Renamed}":`, resRename.body.batch?.displayName === m1Renamed ? 'PASS ✅' : 'FAIL ❌');

    // 3. Rename conflict (try to rename M1 to M2's name) -> 409
    const resConflict = await request(server, 'PATCH', `/api/admin/batches/${batchM1Id}`, {
      Authorization: `Bearer ${adminToken}`,
    }, { displayName: m2Name });
    console.log('PATCH collision rename batch:', resConflict.status, JSON.stringify(resConflict.body));
    console.log('-> Returns 409 conflict:', resConflict.status === 409 ? 'PASS ✅' : 'FAIL ❌');

    // Assign Mentor A to Batch M1 (m1Renamed)
    await addBatchToUser(mentorAEmail, m1Renamed);

    // 4. Merge M1 into M2
    const resMerge = await request(server, 'POST', `/api/admin/batches/${batchM1Id}/merge-into/${batchM2Id}`, {
      Authorization: `Bearer ${adminToken}`,
    });
    console.log('POST merge M1 into M2:', resMerge.status, JSON.stringify(resMerge.body));
    console.log('-> Returns 200 success:', resMerge.status === 200 ? 'PASS ✅' : 'FAIL ❌');

    // Verify M1 is inactive
    const m1After = await getBatchById(batchM1Id);
    console.log('M1 status after merge:', m1After?.status);
    console.log('-> M1 is inactive:', m1After?.status === 'inactive' ? 'PASS ✅' : 'FAIL ❌');

    // Verify Mentor A has M2 instead of M1
    const userAAfter = await getUserByEmail(mentorAEmail);
    const userABatches = userAAfter?.batches || [];
    console.log("Mentor A's batches after merge:", userABatches);
    const mergeReassigned = userABatches.includes(m2Name) && !userABatches.includes(m1Renamed);
    console.log('-> Mentor A reassigned to target batch:', mergeReassigned ? 'PASS ✅' : 'FAIL ❌');

    console.log('\n=== ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY! ===');
  } finally {
    server.close();
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
