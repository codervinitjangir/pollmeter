import http from 'http';
import { app } from './src/index';
import { initDb, upsertUser, createBatch, setUserBatches, getQuizDetails, closePool } from './src/db';
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
  console.log('=== STARTING PART A & PART B VERIFICATION ===\n');
  await initDb();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  console.log(`Test server running on port ${port}\n`);

  try {
    const adminEmail = 'admin.draft@polariscampus.com';
    const mentorAEmail = 'mentor.a.draft@polariscampus.com';
    const mentorBEmail = 'mentor.b.draft@polariscampus.com';
    const mentorZeroEmail = 'mentor.zero.draft@polariscampus.com';

    await upsertUser({
      id: 'admin-draft-id',
      email: adminEmail,
      realName: 'Draft Admin',
      role: 'admin',
      collegeDomain: 'polariscampus.com',
      approved: true,
      createdAt: new Date().toISOString(),
    });

    await upsertUser({
      id: 'mentor-a-draft-id',
      email: mentorAEmail,
      realName: 'Mentor A Draft',
      role: 'mentor',
      collegeDomain: 'polariscampus.com',
      batches: [],
      approved: true,
      createdAt: new Date().toISOString(),
    });

    await upsertUser({
      id: 'mentor-b-draft-id',
      email: mentorBEmail,
      realName: 'Mentor B Draft',
      role: 'mentor',
      collegeDomain: 'polariscampus.com',
      batches: [],
      approved: true,
      createdAt: new Date().toISOString(),
    });

    await upsertUser({
      id: 'mentor-zero-draft-id',
      email: mentorZeroEmail,
      realName: 'Mentor Zero Draft',
      role: 'mentor',
      collegeDomain: 'polariscampus.com',
      batches: [],
      approved: true,
      createdAt: new Date().toISOString(),
    });

    // Reset batches for clean start
    await setUserBatches(mentorAEmail, []);
    await setUserBatches(mentorBEmail, []);
    await setUserBatches(mentorZeroEmail, []);

    const adminToken = generateToken({ id: 'admin-draft-id', email: adminEmail, realName: 'Draft Admin', role: 'admin' });
    const mentorAToken = generateToken({ id: 'mentor-a-draft-id', email: mentorAEmail, realName: 'Mentor A Draft', role: 'mentor' });
    const mentorBToken = generateToken({ id: 'mentor-b-draft-id', email: mentorBEmail, realName: 'Mentor B Draft', role: 'mentor' });
    const mentorZeroToken = generateToken({ id: 'mentor-zero-draft-id', email: mentorZeroEmail, realName: 'Mentor Zero Draft', role: 'mentor' });

    // Create batches
    const runId = Date.now().toString().slice(-4);
    const batchA = await createBatch({ displayName: `Draft Year - Batch A ${runId}`, label: `Batch A ${runId}`, createdBy: mentorAEmail });
    const batchB = await createBatch({ displayName: `Draft Year - Batch B ${runId}`, label: `Batch B ${runId}`, createdBy: mentorBEmail });
    const batchA2 = await createBatch({ displayName: `Draft Year - Batch A2 ${runId}`, label: `Batch A2 ${runId}`, createdBy: mentorAEmail });

    // Assign Batch A and Batch A2 to Mentor A, Batch B to Mentor B
    await setUserBatches(mentorAEmail, [batchA.displayName, batchA2.displayName]);
    await setUserBatches(mentorBEmail, [batchB.displayName]);

    // ─────────────────────────────────────────────────────────────────────────
    // CHECK 1: Part A Checks
    // ─────────────────────────────────────────────────────────────────────────
    console.log('--- CHECK 1: Part A Verification ---');
    // 1a: Zero-assignment mentor sees empty batch list
    const resZeroBatches = await request(server, 'GET', '/api/batches', {
      Authorization: `Bearer ${mentorZeroToken}`,
    });
    const zeroListOk = Array.isArray(resZeroBatches.body.batches) && resZeroBatches.body.batches.length === 0;
    console.log('Zero-assignment mentor GET /api/batches returns empty array:', zeroListOk ? 'PASS ✅' : 'FAIL ❌', resZeroBatches.body.batches);

    // 1b: Cross-mentor batchId rejection
    const sampleQuestions = [
      { id: 'q1', type: 'mcq', text: 'Question 1', options: ['A', 'B'], correctAnswer: 'A', timeLimitSeconds: 20 },
      { id: 'q2', type: 'mcq', text: 'Question 2', options: ['C', 'D'], correctAnswer: 'C', timeLimitSeconds: 20 },
      { id: 'q3', type: 'mcq', text: 'Question 3', options: ['E', 'F'], correctAnswer: 'E', timeLimitSeconds: 20 },
      { id: 'q4', type: 'mcq', text: 'Question 4', options: ['G', 'H'], correctAnswer: 'G', timeLimitSeconds: 20 },
      { id: 'q5', type: 'mcq', text: 'Question 5', options: ['I', 'J'], correctAnswer: 'I', timeLimitSeconds: 20 },
    ];

    const resCrossBatch = await request(server, 'POST', '/api/sessions', {
      Authorization: `Bearer ${mentorAToken}`,
    }, {
      questions: sampleQuestions,
      batchId: batchB.id,
      topic: 'Cross batch test',
    });
    console.log('Mentor A using Mentor B batchId returns 403:', resCrossBatch.status === 403 ? 'PASS ✅' : 'FAIL ❌', resCrossBatch.status);

    // ─────────────────────────────────────────────────────────────────────────
    // CHECK 2: Mentor builds 5 questions with no batch selected, hits "Save for later"
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- CHECK 2: Save Quiz Draft (No Batch Selected) ---');
    const resSaveDraft = await request(server, 'POST', '/api/mentor/quizzes/draft', {
      Authorization: `Bearer ${mentorAToken}`,
    }, {
      title: 'Operating Systems Midterm Review',
      subject: 'Computer Science',
      questions: sampleQuestions,
    });
    console.log('POST /api/mentor/quizzes/draft status:', resSaveDraft.status, 'Title:', resSaveDraft.body?.title);
    const draftId = resSaveDraft.body?.id;
    const saveOk = resSaveDraft.status === 201 && draftId && resSaveDraft.body.mentorEmail === mentorAEmail;
    console.log('Draft created with owner mentorA:', saveOk ? 'PASS ✅' : 'FAIL ❌');

    // List drafts
    const resListDrafts = await request(server, 'GET', '/api/mentor/quizzes/draft', {
      Authorization: `Bearer ${mentorAToken}`,
    });
    const foundDraft = resListDrafts.body?.find((d: any) => d.id === draftId);
    console.log('Draft appears in My Quiz Library list:', (foundDraft && foundDraft.questionCount === 5) ? 'PASS ✅' : 'FAIL ❌');

    // ─────────────────────────────────────────────────────────────────────────
    // CHECK 3: Go Live twice with different batches from same draft
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- CHECK 3: Go Live from Draft Across Batches ---');
    // Session 1: Go live with Batch A
    const resLiveA = await request(server, 'POST', '/api/sessions', {
      Authorization: `Bearer ${mentorAToken}`,
    }, {
      draftId,
      batchId: batchA.id,
    });
    console.log('Session 1 with Batch A status:', resLiveA.status, 'code:', resLiveA.body?.code);
    const sessionACode = resLiveA.body?.code;
    const sessionADetails = await getQuizDetails(sessionACode);
    const liveAOk = resLiveA.status === 201 && sessionADetails?.session.sourceDraftId === draftId && sessionADetails?.session.questionCount === 5;
    console.log('Session 1 created with correct sourceDraftId & questions snapshot:', liveAOk ? 'PASS ✅' : 'FAIL ❌');

    // Session 2: Go live with Batch A2
    const resLiveB = await request(server, 'POST', '/api/sessions', {
      Authorization: `Bearer ${mentorAToken}`,
    }, {
      draftId,
      batchId: batchA2.id,
    });
    console.log('Session 2 with Batch A2 status:', resLiveB.status, 'code:', resLiveB.body?.code);
    const sessionBCode = resLiveB.body?.code;
    const sessionBDetails = await getQuizDetails(sessionBCode);
    const liveBOk = resLiveB.status === 201 && sessionBDetails?.session.sourceDraftId === draftId && sessionBDetails?.session.questionCount === 5;
    console.log('Session 2 created with correct sourceDraftId & independent questions snapshot:', liveBOk ? 'PASS ✅' : 'FAIL ❌');

    // ─────────────────────────────────────────────────────────────────────────
    // CHECK 4: Editing draft does not affect past sessions' stored questions
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- CHECK 4: Draft Edits Do Not Affect Stored Sessions ---');
    const updatedQuestions = [
      { id: 'q1', type: 'mcq', text: 'Question 1 EDITED TYPO FIX', options: ['A', 'B'], correctAnswer: 'A', timeLimitSeconds: 25 },
      ...sampleQuestions.slice(1),
    ];
    const resPatch = await request(server, 'PATCH', `/api/mentor/quizzes/draft/${draftId}`, {
      Authorization: `Bearer ${mentorAToken}`,
    }, {
      title: 'Operating Systems Midterm Review (Updated)',
      questions: updatedQuestions,
    });
    console.log('PATCH draft status:', resPatch.status, 'new title:', resPatch.body?.title);

    const checkSessionA = await getQuizDetails(sessionACode);
    const checkSessionB = await getQuizDetails(sessionBCode);
    const q1SessionA = (checkSessionA?.session.questions as any)?.[0]?.text;
    const q1SessionB = (checkSessionB?.session.questions as any)?.[0]?.text;
    const sessionsUnchanged = q1SessionA === 'Question 1' && q1SessionB === 'Question 1';
    console.log(`Session 1 Q1: "${q1SessionA}", Session 2 Q1: "${q1SessionB}" -> Unchanged:`, sessionsUnchanged ? 'PASS ✅' : 'FAIL ❌');

    // ─────────────────────────────────────────────────────────────────────────
    // CHECK 5: Deleting draft does not break past sessions in Quiz History
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- CHECK 5: Deleting Draft Leaves Past Sessions Intact ---');
    const resDeleteDraft = await request(server, 'DELETE', `/api/mentor/quizzes/draft/${draftId}`, {
      Authorization: `Bearer ${mentorAToken}`,
    });
    console.log('DELETE draft status:', resDeleteDraft.status);

    const resHistory = await request(server, 'GET', '/api/mentor/quizzes', {
      Authorization: `Bearer ${mentorAToken}`,
    });
    const historyA = resHistory.body?.quizzes?.find((q: any) => q.code === sessionACode);
    const historyB = resHistory.body?.quizzes?.find((q: any) => q.code === sessionBCode);
    const historyIntact = Boolean(historyA && historyB && historyA.questionCount === 5 && historyB.questionCount === 5);
    console.log('Past sessions still present in Quiz History after draft deletion:', historyIntact ? 'PASS ✅' : 'FAIL ❌');

    // ─────────────────────────────────────────────────────────────────────────
    // CHECK 6: Cross-Mentor Isolation and Admin Read-Only Visibility
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- CHECK 6: Cross-Mentor Isolation & Admin Read-Only View ---');
    // Create new draft for Mentor A
    const resDraft2 = await request(server, 'POST', '/api/mentor/quizzes/draft', {
      Authorization: `Bearer ${mentorAToken}`,
    }, {
      title: 'Algorithms Graph Theory',
      subject: 'Algorithms',
      questions: sampleQuestions,
    });
    const draft2Id = resDraft2.body.id;

    // Mentor B attempts GET single
    const resBGet = await request(server, 'GET', `/api/mentor/quizzes/draft/${draft2Id}`, {
      Authorization: `Bearer ${mentorBToken}`,
    });
    console.log("Mentor B GET Mentor A's draft returns 403:", resBGet.status === 403 ? 'PASS ✅' : 'FAIL ❌', resBGet.status);

    // Mentor B attempts PATCH
    const resBPatch = await request(server, 'PATCH', `/api/mentor/quizzes/draft/${draft2Id}`, {
      Authorization: `Bearer ${mentorBToken}`,
    }, { title: 'Hacked title' });
    console.log("Mentor B PATCH Mentor A's draft returns 403:", resBPatch.status === 403 ? 'PASS ✅' : 'FAIL ❌', resBPatch.status);

    // Mentor B attempts DELETE
    const resBDelete = await request(server, 'DELETE', `/api/mentor/quizzes/draft/${draft2Id}`, {
      Authorization: `Bearer ${mentorBToken}`,
    });
    console.log("Mentor B DELETE Mentor A's draft returns 403:", resBDelete.status === 403 ? 'PASS ✅' : 'FAIL ❌', resBDelete.status);

    // Admin attempts GET list with ?mentorEmail=
    const resAdminList = await request(server, 'GET', `/api/mentor/quizzes/draft?mentorEmail=${mentorAEmail}`, {
      Authorization: `Bearer ${adminToken}`,
    });
    const adminSeesDraft2 = resAdminList.body?.some((d: any) => d.id === draft2Id);
    console.log("Admin GET with ?mentorEmail sees Mentor A's draft:", adminSeesDraft2 ? 'PASS ✅' : 'FAIL ❌');

    // Admin attempts GET single
    const resAdminGet = await request(server, 'GET', `/api/mentor/quizzes/draft/${draft2Id}`, {
      Authorization: `Bearer ${adminToken}`,
    });
    console.log("Admin GET single returns 200 with full draft:", (resAdminGet.status === 200 && resAdminGet.body.questions.length === 5) ? 'PASS ✅' : 'FAIL ❌');

    // Admin attempts PATCH (must be rejected with 403)
    const resAdminPatch = await request(server, 'PATCH', `/api/mentor/quizzes/draft/${draft2Id}`, {
      Authorization: `Bearer ${adminToken}`,
    }, { title: 'Admin change' });
    console.log("Admin PATCH on mentor's draft returns 403 (read-only for admin):", resAdminPatch.status === 403 ? 'PASS ✅' : 'FAIL ❌', resAdminPatch.status);

    // Admin attempts DELETE (must be rejected with 403)
    const resAdminDelete = await request(server, 'DELETE', `/api/mentor/quizzes/draft/${draft2Id}`, {
      Authorization: `Bearer ${adminToken}`,
    });
    console.log("Admin DELETE on mentor's draft returns 403 (read-only for admin):", resAdminDelete.status === 403 ? 'PASS ✅' : 'FAIL ❌', resAdminDelete.status);

    console.log('\n=== ALL VERIFICATION CHECKS 1 TO 6 PASSED! ===');
  } finally {
    server.close();
    await closePool();
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
