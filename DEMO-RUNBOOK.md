# Demo Day Runbook

Written for the live session in front of ~100 students. Everything here was
verified against production (`https://pollmeter.onrender.com` +
`https://pollmeter.pages.dev`) rather than reasoned about from the source.

---

## Do not push anything while the demo is running

Auto-deploy is on, and there is no `render.yaml` — Render rebuilds from the
dashboard on every push to `main`. A rebuild restarts the backend, and **live
quiz rooms exist only in memory**, so a push mid-demo ends whatever quiz is in
progress and drops every connected student. A rebuild takes roughly 5–10
minutes to come back.

If something must be changed during the day, do it before the session starts
and wait for `/api/health` to report a low `uptimeSeconds` before relying on it.

## Leave the login code banner alone

SMTP is not configured (`RESEND_API_KEY` / `SMTP_HOST` are unset), so the
backend returns the one-time code in the API response and the login dialog shows
it as a "click to autofill" banner. **This is currently the only way anyone can
log in.**

Do not configure SMTP today. If real email delivery is switched on, the code
stops being returned, and any student whose address does not have a real mailbox
behind it can no longer sign in at all.

The trade-off to be aware of: while the banner is on, anyone who can reach the
API can obtain a code for any address on an allowed domain, including
`admin@polariscampus.com`. That is acceptable for a classroom demo and should be
closed afterwards — see *After the demo* below.

## What was verified working

| Area | Check | Result |
|---|---|---|
| Student login at scale | 8 students, one shared IP | all 8 accepted |
| Per-address abuse limit | same address 7 times | capped at 5 |
| Batch selection | hosted on all 14 dropdown batches | 14/14 succeeded |
| Session delete | removed all 14 afterwards | 14/14 removed |
| Access isolation | one mentor deleting another's session | refused |
| Frontend build | live bundle vs. local build hash | identical |
| Database | `/api/health` | `postgresql` |

## Known limits, in plain terms

- **A backend restart ends any quiz in progress.** Rooms are in-memory by
  design. UptimeRobot prevents idle sleep, which is the usual cause; a platform
  recycle is still possible and cannot be defended against without persisting
  room state, which is too large a change to make on demo day.
- **Logins now survive a restart.** They did not until today: with `JWT_SECRET`
  unset, every boot generated a fresh random secret and signed everyone out.
  The secret is now derived from an environment value that does not change, so
  a restart no longer logs the room out even though it does end a running quiz.
- **A mentor claims a batch the first time they host on it.** The dropdown
  offers every active batch; selecting one now assigns it rather than refusing,
  and the assignment is written to the audit log.

## Before the session starts

1. Open `https://pollmeter.pages.dev` and confirm it loads.
2. Run one throwaway quiz end to end with two phones. This confirms the
   mentor's own account, and the account's history can be cleared afterwards
   from the same screen.
3. Check `https://pollmeter.onrender.com/api/health` returns `ok: true` and
   `database: "postgresql"`.

## After the demo

In priority order:

1. **Set `JWT_SECRET`** in the Render dashboard to any long random string. The
   derived fallback works, but it ties logins to the database credentials —
   rotating the database URL would sign everyone out.
2. **Configure `RESEND_API_KEY` or SMTP**, then confirm the login code stops
   appearing in the API response. This closes the "anyone can obtain a code for
   any address" hole.
3. **Gate or remove `POST /api/auth/demo`.** It is unauthenticated and issues a
   token for any address on an allowed domain. The client no longer calls it —
   `loginWithCollegeDemo` has no callers — so it can be removed outright.
4. **Review the faculty list.** An earlier migration approved every
   `@polariscampus.com` account that existed at the time. Also note that one
   mentor holds an assignment to `4th Year - CSE Legacy`, which is inactive and
   therefore does nothing.
5. **Consider persisting live rooms** so a restart no longer ends a quiz. This
   is the only remaining single point of failure during a class.
