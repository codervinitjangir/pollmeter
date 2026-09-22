# Mentimeter-Style Classroom Quiz App — AI Agent Brief

## Exact use-case

Build a **simple Mentimeter-style classroom quiz platform** for a mentor/teacher.

Main use:
- mentor creates questions from **syllabus / topic list**
- students join using **QR code or join code**
- around **50 students** may join from **mobile or laptop**
- mentor’s laptop is connected to a **big screen / projector**
- everyone should see the **live leaderboard**, question progress, and result flow in real time

The app should feel like a **clean classroom quiz tool**, not a game, not a social app, and not a flashy dashboard.

---

## Core goal

The platform should help a mentor:
1. generate or add questions from topics/syllabus
2. start a live session in class
3. let students join fast through QR or code
4. show questions on students’ devices
5. update the live leaderboard on the big screen
6. rank students by **speed + correctness**
7. keep the interface simple and readable
8. show leatherboard after every que for 5 sec, like if 3rd position student become 1st then cut 1st student name put that name to 2nd and 3rd student name to 1st like this.
9. no need to click submit button, just click on btn then auto submit and after timer and will get correct or wrong

---

## Must keep

These features must stay:

- QR-based joining
- code-based joining
- mentor/host session creation
- live question display
- live answer submission
- AI question generation from topic/syllabus
- leaderboard
- speed-based scoring
- projector / big-screen host view
- mobile and laptop support
- student rejoin / recovery if they refresh or reconnect

---

## Do not add unnecessary things

Avoid or remove:
- social feeds
- chat system
- profile system
- badges / achievements / levels
- complex animations
- confetti-heavy UI
- unnecessary admin panels
- unrelated analytics dashboards
- multi-room social features
- any feature that is not useful in a classroom quiz

Keep only what helps the class run smoothly.

---

## How scoring should work

Scoring must reward both:
- **correctness**
- **speed**

Suggested logic:
- correct answer gets base points
- faster correct answers get higher bonus
- slower correct answers get less bonus
- wrong answer gets zero
- leaderboard sorts by total score

Example:
- correct answer = 1000 base points
- early answer bonus = up to 500 points
- wrong answer = 0

Tie handling:
- same score should share rank or use a simple tie-breaker
- leaderboard should still feel fair and easy to understand

---

## Question flow

The mentor can:
- type a topic
- paste syllabus points
- generate questions with AI
- manually edit generated questions
- choose question type:
  - MCQ
  - short text / open answer if needed

For classroom use, MCQ should be the default because it is easiest for live scoring.

---

## AI generation rules

AI should generate questions only from the given topic or syllabus.

The AI should return structured output like:
- question text
- answer options
- correct answer
- difficulty
- time limit
- topic tag

The AI should not add random unrelated questions.

The mentor should be able to review and edit the generated questions before starting the class.

---

## Student experience

Students should be able to:
- scan QR code
- enter join code
- enter their name
- join instantly
- answer from phone or laptop
- see whether their answer was received
- wait for the next question
- see leaderboard when the mentor reveals it

Students should not need accounts or sign-up.

---

## Host / mentor experience

The mentor should be able to:
- create a session in one click
- generate questions from syllabus or topic input
- show QR code on screen
- see who has joined
- start / pause / move to next question
- end the session
- display leaderboard live on projector

The host screen should be very readable from a distance.

---

## UI direction

The UI should be:

- clean
- minimal
- classroom-friendly
- easy on the eyes
- readable on projector
- responsive on phone and laptop

Good visual style:
- white or light background
- strong typography
- simple cards
- clear buttons
- big session code
- easy-to-read leaderboard rows
- no clutter

---

## Screens that should exist

### 1. Join screen
- enter code
- enter name
- join session
- QR scan friendly

### 2. Mentor host screen
- session code
- QR code
- start session button
- add/generate questions
- live participant count
- current question
- next / end controls

### 3. Student question screen
- question text
- options
- timer
- submit button
- waiting state

### 4. Results screen
- correct answer
- response summary
- leaderboard
- next question button

### 5. Final screen
- final leaderboard
- session summary

---

## Real-time behavior

Use real-time updates for:
- participant joining
- question changes
- timer updates
- answer submission
- live scoring
- leaderboard refresh
- session end

The projector screen should update instantly when students answer.

---

## Data model direction

### Participant
- id
- name
- sessionId
- score
- answersSubmitted
- correctCount
- reconnectToken

### Question
- id
- topic
- text
- type
- options
- correctAnswer
- timeLimit
- order

### Session
- id
- code
- mentorId
- questions
- currentQuestionIndex
- status
- participants

### Response
- participantId
- questionId
- selectedAnswer
- submittedAt
- correctness
- scoreAwarded

---

## Important behavior rules

- one student should only submit once per question
- late answers should be blocked after time ends
- rejoin should preserve student identity if possible
- mentor should be able to reset session cleanly
- leaderboard should update live after each answer or after reveal
- correct answer should remain hidden until reveal time

---

## Best implementation approach

### Phase 1
- host session creation
- join by QR/code
- live question answering
- leaderboard
- speed scoring

### Phase 2
- AI question generation from syllabus/topics
- edit generated questions
- rejoin support
- better projector view

### Phase 3
- polish UI
- smooth transitions
- deployment ready version

---

## Final instruction for the AI agent

Build a **clean, simple classroom quiz platform** like Mentimeter for a mentor teaching 50 students. Keep QR/code join, AI question generation from syllabus, live leaderboard, and speed-based scoring. Make the host screen projector-friendly and the student experience fast on mobile/laptop. Do not add unrelated or unusual features. Keep it minimal, readable, and reliable.

---

## Success checklist

- [ ] Mentor can create a live session
- [ ] Students can join with QR or code
- [ ] 50 students can join smoothly
- [ ] Mentor can generate questions from syllabus/topics
- [ ] Questions can be reviewed before going live
- [ ] Students can answer on mobile or laptop
- [ ] Speed-based scoring works
- [ ] Leaderboard updates live on projector
- [ ] Rejoin works after refresh/reconnect
- [ ] UI stays simple and classroom-friendly
- [ ] No unnecessary extra features









## Extra guardrails for the agent

* Keep the app **classroom-first**. Every feature must help a mentor run a live session with students.
* Do **not** add login/signup, profiles, badges, friends, chat, or social features.
* Keep the session flow extremely fast: **create session → show QR/code → students join → ask question → submit → show leaderboard**.
* Use the server as the source of truth for:

  * timer
  * current question
  * answer lock
  * leaderboard
  * session status
* Ensure the leaderboard is visible and readable on a projector.
* Make mobile join and answer screens simple enough for first-time users.
* AI-generated questions must be editable before publishing.
* If AI output is invalid, auto-fix it or fall back to a manual question form.
* Keep the UI minimal, but do not remove leaderboard, QR join, speed scoring, or AI question generation.
* Prefer fewer screens and fewer buttons over fancy interactions.
* Build for smooth class use with around 50 students joining at once.
* If something is not useful in a live classroom quiz, do not implement it.

### Non-negotiable flow

1. Mentor enters topic/syllabus
2. AI generates questions
3. Mentor reviews and starts session
4. Students join by QR/code
5. Students answer quickly
6. Scores update by correctness + speed
7. Live leaderboard updates on projector
8. Session ends with final ranking

### One-line product statement

A clean Mentimeter-style classroom quiz app where a mentor can generate questions from syllabus, let students join by QR or code, and show a live speed-based leaderboard on a projector.


  ## Extra notes

* Handle weak or unstable internet safely.
* Prevent duplicate answers from the same student on the same question.
* Auto-lock answers when the timer ends.
* Support fast joining for around 50 students.
* Keep host/projector view large, clean, and readable.
* Allow AI-generated questions to be edited before going live.
* If AI generation fails, allow manual question creation.
* Keep clear app states: joining, waiting, answering, submitted, result, leaderboard.
* Add a simple export of final results if possible.
* Avoid unnecessary dependencies and overengineering.
