# Prompt for the AI agent: three more Java projects

How to use this file: start a **new agent session per project**. Paste **Part 0** plus **one** of Part A, B or C.
One project per session gives much better quality than one giant session.

Suggested order (change it if a deadline says otherwise):

1. **Part A** – Campus Premier League (course end project)
2. **Part B** – CodeSleuth (complex engineering problem 1)
3. **Part C** – Tatkal Rush (complex engineering problem 2)

---

## Part 0 – Shared brief (paste this first, every time)

You are building a university project for a team of three second-year B.Tech CSE students at Vardhaman College
of Engineering (batch 6): Madhavarapu Saritha (25881A05V7), Chepyala Vishal (25881A05X9) and
Gundu Srijay Krishna (25881A05X0). The course is **Object Oriented Programming through Java (VCE-R25)**.
The students must be able to explain every class in a viva, so the code has to be readable and the syllabus
concepts have to be visible in it.

### The syllabus (what the code should demonstrate)

| Unit | Topics |
|------|--------|
| I | OOP concepts, classes and objects, constructors, overloading, `this`, `static`, arrays, inheritance (all types), `super`, overriding, dynamic method dispatch, abstract classes, `final`, interfaces (define, implement, extend), packages, access protection |
| II | Exceptions (`try`, `catch`, `throw`, `throws`, `finally`, built-in, own subclasses). Multithreading: life cycle, creating threads, priorities, synchronization, inter-thread communication (`wait`, `notify`, `notifyAll`). `String` and `StringBuffer` |
| III | Collections: `ArrayList`, `LinkedList`, `HashSet`, `TreeSet`, `HashMap`, `TreeMap`, `StringTokenizer`, `Arrays`. Streams: `FileInputStream`/`FileOutputStream`, `FileReader`/`FileWriter`, reading and writing files, serialization |
| IV | Swing and AWT event handling: delegation event model, event sources, listeners, adapters, mouse and keyboard events, layout managers (`FlowLayout`, `BorderLayout`, `GridLayout`, `CardLayout`), Swing components (`JFrame`, `JPanel`, `JComponent`, `JLabel`, `JTextField`, `JTabbedPane`, buttons, `JScrollPane`, `JComboBox`, `JTable`) |
| V | JDBC: architecture, driver types, `DriverManager`, `Connection`, `Statement`, `PreparedStatement`, `CallableStatement`, `ResultSet`; CRUD from the console and from a Swing GUI |

Prefer these constructs for the **core logic**. Using `java.util.concurrent` or streams and lambdas is allowed only
where it clearly helps, and then it must be explained in a comment. Lambdas for Swing listeners are fine.
Example: build worker threads with `Thread`, `synchronized` and `wait/notify`, not with `ExecutorService`.
Where a faster library class would be the natural choice, implement the syllabus way and, if useful for the
analysis, add the library version as a clearly labelled comparison baseline.

### A finished reference project is already in this repo

`Course_End_Project_Java_Green_Corridor/` is a completed project from the same team. **Read its `README.md`, its
`app/README.md` and skim `app/src` before you start.** Match its structure, quality, test style and level of
honesty. Do not change it. In particular reuse the ideas of:

- Maven project, `pom.xml` with Java 8 compatibility, shaded runnable jar, MySQL Connector/J, JUnit 5.
- Packages per concern (`model`, `engine`, `db`, `io`, `exception`, `ui`, ...), a `SimConfig`-style constants class.
- A `ScenarioRepository`-style interface with a MySQL implementation **and** an in-memory fallback, so the app
  runs offline.
- `db.properties` for connection settings (git-ignored), a settings dialog with "Test connection",
  `SchemaInstaller` + `SqlScript` that run the bundled `.sql` script from Java.
- Stored procedures called through `CallableStatement`, batch inserts in one transaction, `ON DELETE` rules.
- An invariant checker thread (`SafetyChecker`), a headless benchmark tool (`Experiment`), and a `ScreenshotTour`
  that drives the real window under Xvfb and saves screenshots.
- `README.md` with problem statement, results, and a **syllabus-to-code table**; and a long-form explainer page
  `project-explained.html` (self-contained, inline SVG diagrams, real code excerpts, viva questions).

### Non-negotiable rules

1. **Verify, never claim.** Every number in a README or explainer must come from something you ran. If a test or
   experiment fails, say so and fix it or document it. Do not invent benchmark results. Do not say a feature works
   unless a test or a screenshot shows it.
2. **Runs offline and online.** Without MySQL the app still starts (in-memory data, run logs to files). With MySQL
   (8.0, user and password from `db.properties`) it creates its own tables and procedures on first connect.
3. **No real student data, no network at runtime.** Use generated data only. Nothing may call an external service.
4. **Concurrency discipline.** Document the lock order. Never use `sleep` to make something correct. Always
   re-check conditions in a `while` loop around `wait()`. Add an automatic invariant checker that runs during
   tests and benchmarks and fails loudly.
5. **Tests.** JUnit 5, aim for 25 or more meaningful tests, including at least one multithreaded test and one
   MySQL integration test that skips itself when MySQL is unreachable (use a separate `*_test` database).
   Run `mvn test` after every milestone and before every commit.
6. **UI quality.** Take screenshots with the Xvfb tour, **open and look at every one**, and fix clipped text,
   overlaps and ugly layouts before committing. All Swing changes go through the event dispatch thread. No
   network or database call on the event dispatch thread.
7. **Readable code.** A second-year student must be able to follow it. Small classes, clear names, Javadoc on every
   non-obvious method, and a short comment wherever a syllabus concept is used (for example
   `// Unit II: inter-thread communication`). No clever one-liners, no unused code.
8. **Git.** Work on the branch the session gives you. Commit after every milestone with a clear message. Do not
   commit `target/`, `logs/`, `db.properties`, or generated data sets that are large. Push the branch. **Do not
   open a pull request unless asked.**
9. **The report comes later.** The college will send a report format later (the earlier reports in this repo use
   a LaTeX template, see `CEP_Database_Security/Main.tex`). **Do not write the final report now.** Instead produce
   raw material: a `REPORT_NOTES.md` with a ready-to-paste draft of each section, result tables as CSV and
   markdown, and charts as PNG files.
10. **Do not ask questions you can answer yourself.** If something is ambiguous, choose the sensible default and
    record the decision in `DESIGN.md`.

### Environment notes (they worked for the previous project)

- MySQL: `apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server`, then
  `service mysql start`, then `mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH caching_sha2_password BY 'root123'; FLUSH PRIVILEGES;"`.
- Maven downloads through the sandbox proxy. Use MySQL Connector/J 9.7.0 (`com.mysql:mysql-connector-j`).
- Screenshots: `xvfb-run -a -s "-screen 0 1600x1000x24" java -cp ... <TourClass> <out-dir>` using `java.awt.Robot`.
  Chromium is at `/opt/pw-browsers` if you want to check the HTML explainer.
- `JAVA_TOOL_OPTIONS` prints a harmless "Picked up" line on every Java command.

### Process (follow this order)

1. Write `DESIGN.md` first: architecture, package and class list, thread list with priorities, shared data and
   lock order, database schema and procedures, test plan, and (for CEPs) the experiment plan. Then build.
2. Build in small milestones. After each: `mvn test`, commit.
3. Run the experiments and the invariant checker. Keep the raw outputs.
4. Screenshots, then look at them and fix the UI.
5. Documentation: `README.md`, `app/README.md`, `REPORT_NOTES.md`, `project-explained.html`.
6. Final checklist: clean build with `mvn package`, all tests pass, runs offline, runs with MySQL, README numbers
   match the raw outputs, no secrets or large files committed, a short honest list of known limitations.

### Complex engineering problem (CEP) requirements (applies to Parts B and C only)

A CEP is not just a bigger app. The deliverable must make these attributes visible, because the college assesses
them. Write them up in `CEP_ANALYSIS.md` with these sections:

1. **Problem definition**, in the words of a user, not of the code.
2. **Stakeholders** and what each of them needs (they must conflict somewhere).
3. **Requirements and the conflicts between them** (for example speed against accuracy against memory).
4. **Constraints and applicable standards or rules** (privacy law, institutional policy, hardware limits,
   metrics definitions).
5. **Alternatives considered** (at least three real designs) and a decision matrix.
6. **Method**: what you measured, how, with which controlled variables, how many repeats (at least 5, with the
   same seeds across compared options), and which results could have disproved your design.
7. **Results** with tables and charts, including negative results.
8. **Discussion**: trade-offs, surprises, what you would change.
9. **Limitations and ethics.**

---

## Part A – Course end project: Campus Premier League (CPL)

**One line:** an IPL-style league for campus teams: a live player auction with bidding bots, then a ball-by-ball
T20 match simulator, a points table with net run rate, and player statistics, all stored in MySQL.

**Why this project:** it is fun and instantly relatable, it has a natural object model, natural concurrency
(bidders, parallel matches), and natural SQL (orange cap, net run rate), so every syllabus unit appears without
being forced.

**Folder:** `Course_End_Project_Java_Campus_Premier_League/` with `app/`, `screenshots/`, `README.md`,
`REPORT_NOTES.md`, `DESIGN.md`, `project-explained.html`.

### What it must do

1. **Players and teams.** Generate about 120 fictional players with roles (batter, bowler, all-rounder,
   wicket-keeper), ratings (batting, bowling, fielding), a base price and an overseas flag. Players can also be
   imported from a CSV file (`StringTokenizer` + `FileReader`). Eight teams with a purse, a squad size range
   (for example 11 to 18) and an overseas limit (for example 4).
2. **Live auction.** An auctioneer thread runs one lot at a time: "going once, going twice, sold". Each team can be
   human-controlled (the user clicks Bid) or a **bot thread** with its own strategy (aggressive, budget-minded,
   needs-based, random). Bids are validated atomically (highest bid, purse, squad size, overseas limit) and
   rejected with custom exceptions (`BudgetExceededException`, `SquadFullException`,
   `OverseasLimitException`, `AuctionClosedException`). The countdown restarts when a new bid arrives
   (`wait(timeout)` and `notifyAll`). A sale updates player owner and team purse **in one JDBC transaction**.
   Unsold players go to an accelerated round.
3. **Match engine.** Ball by ball, driven by batter rating against bowler rating, over phase (powerplay, middle,
   death), pitch type, required run rate, and a seeded random generator, so matches are reproducible.
   Produces a full scorecard, fall of wickets, over-by-over runs, extras, partnerships, super over for ties,
   and generated text **commentary** from templates.
4. **Tournament.** Round-robin fixtures, matches in the same round run **in parallel threads**, points table
   (win 2, tie and no-result 1) with **net run rate** from a stored procedure, orange cap and purple cap,
   player-of-the-match, and a knockout (top 4 playoffs).
5. **Swing UI** with tabs: Auction Hall (current lot, bid history, team purses, countdown), Squads, Fixtures,
   **Live Match** (scoreboard, commentary feed, over timeline, a **wagon wheel and run-rate graph drawn with
   `Graphics2D`**, speed control and pause/resume), Standings and Stats (sortable tables), and Settings.
6. **Saving.** Everything in MySQL; league can also be saved to and loaded from a serialized file; scorecards
   export to text files (`FileWriter`); stats export to CSV.

### Design hints (how the syllabus fits, not a rigid design)

- Unit I: abstract `Player` with `Batter`, `Bowler`, `AllRounder`, `WicketKeeper`; abstract `BiddingStrategy` with
  four subclasses (dynamic dispatch); interfaces such as `CommentaryProvider` and `Rateable`;
  enums for roles and dismissal types; packages per concern; static counters; arrays for over-by-over data.
- Unit II: bot bidders and the auctioneer as threads; the lot timer with `wait(timeout)`; parallel matches;
  match pause and resume with `wait/notifyAll`; thread priorities (auctioneer high, statistics writer low);
  synchronized bid handling; custom checked exceptions; `StringBuffer` for commentary and scorecard text.
- Unit III: `LinkedList` auction queue, `ArrayList` squads, `HashSet` unsold, `HashMap` player stats,
  `TreeMap` points table, `TreeSet` with a `Comparator` for rankings, `Arrays.sort`, CSV import,
  serialization of the league, scorecard export.
- Unit IV: `CardLayout` for the tab content, custom painting, mouse hover on the wagon wheel, keyboard shortcuts,
  `JTable` with custom renderers.
- Unit V: tables for team, player, auction_lot, bid, match, innings, ball_event, standings; stored procedures
  (`sp_points_table` with net run rate, `sp_top_scorers`, `sp_close_auction_lot`); transaction around each sale;
  batch insert of ball events; `ResultSetMetaData` for a generic stats viewer.

### Acceptance criteria

- A full season (auction, 56 league matches, playoffs) completes automatically in under 3 minutes at fast speed,
  and a human can play the auction for one team.
- **Plausibility check** over 200 simulated T20 matches: average first-innings score between 140 and 180, wickets
  per innings between 5 and 8, ties in less than 2 percent. Put the real measured distribution in the README.
- **Invariants checked in tests and by a checker:** every scorecard adds up (batter runs + extras = team total,
  bowler wickets = wickets fallen, balls bowled at most 120 per innings), no team ever exceeds its purse, squad
  size or overseas limit, a player is never sold twice, the points table equals a recomputation from match results.
- At least 25 tests, one of them a multithreaded auction test with many competing bots.
- Works offline and with MySQL; screenshots of every tab taken and checked.

---

## Part B – Complex engineering problem 1: CodeSleuth

**One line:** a source-code similarity engine that finds copied Java lab submissions, tuned and evaluated like a real
engineering system (accuracy against speed against memory against fairness and privacy).

**Why this is a CEP:** the requirements genuinely conflict, there is no single right design, the stakeholders
disagree (faculty want to catch everything, students need protection from false accusations, administrators want
an audit trail and data minimisation), and the quality can be measured with precision, recall and runtime.

**Folder:** `CEP_Java_CodeSleuth/` with `app/`, `experiments/` (raw CSV and PNG charts), `screenshots/`,
`DESIGN.md`, `CEP_ANALYSIS.md`, `REPORT_NOTES.md`, `README.md`, `project-explained.html`.

### Problem statement

A lab with 60 to 800 students submits Java programs. A faculty member needs a ranked list of suspicious pairs,
with evidence they can show a student, in seconds, on a lab PC with 4 GB of RAM, without sending any code to an
outside service, without auto-accusing anyone, and while respecting student privacy rules (data minimisation and
retention limits, as in India's Digital Personal Data Protection Act, 2023, and the institution's academic
integrity policy). Starter code supplied by the teacher must not count as copying.

### What it must do

1. **Ingest** a folder or ZIP of `.java` files (one per student, pseudonymised ids), robust to unparsable files.
2. **Normalise**: strip comments and whitespace, replace identifiers with `ID` and literals with `LIT` using your own
   tokenizer (`StringTokenizer`-based and/or hand-written lexer), optionally subtract a teacher-supplied template.
3. **Fingerprint and compare**, with **at least three interchangeable algorithms** behind one interface:
   (a) a text line-diff baseline, (b) token k-gram Jaccard, (c) **winnowing** fingerprints in the style of MOSS,
   and optionally (d) greedy string tiling. Use an inverted index (`HashMap` from fingerprint to submissions) so you
   do not compare every pair in full.
4. **Parallelism:** comparison work is done by worker threads you write yourself (`Thread`, a synchronized work
   queue, `wait/notify`), with progress reporting and cancellation. Thread count is configurable.
5. **Report:** ranked suspect pairs, a similarity **heat map** matrix, clusters of mutually similar submissions
   (union-find), and a **side-by-side diff viewer** that highlights the shared fragments, so a human can judge.
   Every score comes with its evidence. The UI never says "plagiarised"; it says "similarity".
6. **Persistence and privacy:** MySQL tables for course, assignment, submission (stores hashes and metadata, with the
   source text optional and purgeable), comparison_result, evidence, audit_log. A stored procedure purges data older
   than a retention period. Index cache can be serialized to disk.
7. **Swing UI** with tabs: Cases, Import, Analysis (live progress), Heat map, Evidence (diff viewer), Settings
   (k, window size, threshold, algorithm, threads, template subtraction), Audit.

### The evaluation harness (this is the core of the CEP)

- **A mutation engine** generates labelled plagiarism: write about 10 different base solutions each for 6 or more
  typical lab problems (or generate programs), then produce variants with **known ground truth**: exact copy,
  renamed identifiers, changed comments and formatting, reordered methods or statements, dead-code insertion,
  loop rewrites (`for` to `while`), and mixes. Also include **independent solutions to the same problem**
  (the hard negatives, which look similar but are not copied) and **shared boilerplate** (to measure false positives).
- Measure **precision, recall and F1** for every algorithm and parameter setting, with a **threshold sweep** (and a
  PR curve). Report which transformation each algorithm misses.
- Measure **runtime and memory against corpus size** (50, 100, 200, 400, 800 submissions) and
  **speed-up against thread count** (1, 2, 4, 8). Show where the speed-up stops and explain why.
- Measure the effect of the **k-gram size and winnowing window** (accuracy against index size).
- All experiments repeated at least 5 times with fixed seeds; save raw CSV in `experiments/` and generate the charts
  as PNG with a small Java or Python script that is also committed.
- Include at least one **negative or surprising result** in the analysis.

### Design hints

- Unit I: interface `SimilarityAlgorithm` with several implementations (dynamic dispatch), abstract `Tokenizer`,
  packages, enums for mutation types.
- Unit II: custom exceptions (`UnparsableSubmissionException`, `CorpusTooLargeException`), worker threads,
  synchronized queue, progress with `wait/notifyAll`, cancellation via interrupts, priorities.
- Unit III: `HashMap<Long, List<Integer>>` index, `HashSet` of fingerprints, `TreeMap`/`TreeSet` for ranked results,
  `Arrays.sort`, `StringTokenizer`, directory walking with file streams, serialization of the index cache.
- Unit IV: custom-painted heat map (mouse hover shows the pair, click opens the diff), two synchronized
  `JScrollPane`s for the diff, `JTable` with renderers, `CardLayout`.
- Unit V: schema, `PreparedStatement` batches, a purge stored procedure, a top-suspects stored procedure, audit trail.

### Acceptance criteria

- On the generated benchmark, the best configuration reaches at least 0.9 recall on renamed, reformatted and
  reordered copies **while keeping false positives on boilerplate and independent solutions low**; the README shows
  the real numbers, including where each algorithm fails.
- 400 submissions are analysed in under 30 seconds on 4 threads on the development machine (report the real time).
- Tests: tokenizer, normalisation, each algorithm on known pairs, union-find clusters, worker queue under
  contention, persistence round trip, purge procedure.
- `CEP_ANALYSIS.md` completed with all nine sections, and a short section on ethics: what the tool must not be used
  for, and how the design supports a fair process.

---

## Part C – Complex engineering problem 2: Tatkal Rush

**One line:** a ticket-booking system under a 10 AM rush (thousands of simulated users, a few hundred seats), built
with **seven different booking strategies** and compared on correctness, throughput, latency and fairness, so the
students can show a race condition live and then fix it in several ways.

**Why this is a CEP:** correctness (never double-book), performance (many bookings per second), fairness (first
come, first served, no starvation) and robustness (payments fail, users abandon, bots attack) pull in different
directions. The solution space is wide (locks, queues, database transactions), and the answer depends on the load.

**Folder:** `CEP_Java_Tatkal_Rush/` with `app/`, `experiments/`, `screenshots/`, `DESIGN.md`, `CEP_ANALYSIS.md`,
`REPORT_NOTES.md`, `README.md`, `project-explained.html`.

### Problem statement

At 10:00 AM, tens of thousands of people try to book the same few hundred berths. The operator needs a booking
service that never sells a seat twice, serves as many people as possible per second, treats users fairly, releases
seats held by users who do not pay, and resists scripted bots, while running on modest hardware and one database.
Rules to model: a maximum number of tickets per user, a payment window for held seats, refunds on failure.

### What it must do

1. **Domain:** trains and journeys, seats (coach, berth), users, bookings, holds (a seat reserved for 90 seconds while
   the user pays), payments (random delay, configurable failure rate), and an audit log.
2. **Workload generator (users as threads):** configurable number of users (500 to 10,000), arrival pattern
   (burst, ramp, steady), behaviour (picks any seat, or prefers popular seats to create hot spots), payment delay
   and failure, abandonment, and **bot users** with a much higher request rate. Seeded for reproducibility.
3. **Booking strategies** behind one interface (`BookingStrategy`), each implemented the syllabus way:
   - **S0 Naive**: check then book without protection (it must show double bookings).
   - **S1 Global lock**: one `synchronized` method for everything.
   - **S2 Per-seat locks**: fine-grained `synchronized` blocks, with a fixed lock order for multi-seat bookings.
     Include a **deadlock demo mode** that uses an unordered lock order and a detector that reports it.
   - **S3 Waiting room**: a FIFO admission queue with `wait/notifyAll` that lets in a limited number of users at a time.
   - **S4 Database pessimistic**: one transaction with `SELECT ... FOR UPDATE`.
   - **S5 Database optimistic**: a `version` column and retry with back-off.
   - **S6 Hold and confirm**: an in-memory hold with an expiry thread, then a database commit.
   - Optional comparison baselines with `java.util.concurrent` (clearly labelled as beyond the syllabus).
4. **Auditor:** an independent checker, in code and also as a SQL audit after each run, that verifies that no seat has
   more than one confirmed booking, that counts add up, and that no hold outlives its expiry. A `UNIQUE` constraint
   on (journey, seat) is the last line of defence, and the experiments report how often it was needed.
5. **Metrics per run:** confirmed bookings, double-booking violations, throughput, latency p50, p95 and p99,
   retries and aborts, lock timeouts and deadlocks, **fairness** (rank correlation between arrival order and success
   order, and Jain's fairness index over per-user outcomes), starvation (longest wait), and database statistics.
6. **Swing UI:** a live **seat map** (free, held, booked, contested, double-booked in red), live throughput and latency
   charts drawn with `Graphics2D`, a strategy selector, a workload panel, a results table with a comparison bar
   chart, and a **"replay the race"** view that highlights the exact seats that were double-booked by S0.
7. **Database:** schema with constraints, stored procedures (`sp_hold_seat`, `sp_confirm_booking`,
   `sp_expire_holds`, `sp_audit`) called through `CallableStatement`, batch inserts for audit rows, explicit
   transaction handling, and tables for `experiment_run` and `metric` so every run can be compared later.

### The experiments (the core of the CEP)

- Compare **all strategies on the same workloads and seeds**, with at least 5 repeats each.
- Vary the **number of users** (500, 1,000, 2,500, 5,000, 10,000), the **number of seats** (100, 300, 1,000),
  the **hot-spot skew**, the **payment delay** and the **bot share**.
- Compare MySQL **isolation levels** (READ COMMITTED, REPEATABLE READ, SERIALIZABLE) for S4 and S5: anomalies,
  lock waits, deadlocks and throughput.
- Measure **scalability** against thread count and find the point where adding threads stops helping or hurts.
- Show **the cost of correctness**: S0 is fastest and wrong. Quantify how much throughput each correct strategy gives up.
- Find the **load at which the best strategy changes** (for example global lock wins for small loads, per-seat locks
  or the waiting room for large ones) and present it as a decision guide.
- Keep every raw result as CSV in `experiments/` and generate the charts as PNG with a committed script.

### Design hints

- Unit I: interface `BookingStrategy`, abstract `UserBehaviour` with subclasses (casual, hot-spot seeker, bot),
  enums, packages.
- Unit II: user threads, expiry thread, waiting-room `wait/notifyAll`, priorities (auditor and expiry thread high),
  custom exceptions (`SeatTakenException`, `HoldExpiredException`, `PaymentFailedException`,
  `BookingLimitExceededException`), a deadlock demo with detection.
- Unit III: `HashMap` of seats, `LinkedList` waiting queue, `TreeMap` latency buckets for percentiles, `ArrayList`
  of results, `Arrays.sort`, CSV export with `FileWriter`, serialization of an experiment configuration.
- Unit IV: live seat map as a custom `JComponent`, mouse hover shows seat history, `JTable` results, `CardLayout`.
- Unit V: transactions, `SELECT ... FOR UPDATE`, isolation levels, batches, stored procedures, `ResultSetMetaData`.

### Acceptance criteria

- S0 **demonstrably** double-books under contention (report how often), and every other strategy shows **zero**
  violations in every run of the final experiment set, verified by the auditor and the SQL audit.
- The final comparison covers all strategies, all the variations above, and the isolation-level study, with
  real numbers, charts and a written interpretation, including a result that surprised you.
- Tests: each strategy on a small deterministic scenario, the auditor catching a deliberately broken strategy,
  the expiry thread, the waiting room's FIFO order, and MySQL integration for the stored procedures.
- `CEP_ANALYSIS.md` completed with all nine sections, and an honest paragraph on how the simulated load differs
  from a real production system.

---

## Appendix – if a project is rejected, these were the runners-up

- **Campus Stock Exchange** (bot traders as threads, order book in a `TreeMap`, news events, candlestick charts).
- **Reversi Arena** (parallel game-tree search; speed-up and strength against thread count, plus ELO ratings in MySQL).
- **Timetable generator** (conflicting constraints between faculty, rooms and students; backtracking against a
  genetic algorithm; compare solution quality and time).
- **Fire evacuation simulator** (people as threads, doors as shared resources; similar in style to GreenCorridor).
