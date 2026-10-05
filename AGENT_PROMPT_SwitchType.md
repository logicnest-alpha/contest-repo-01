# Agent prompt: SwitchType (complex engineering problem)

Paste this whole file into a new agent session. It is self-contained. Build **only** this project in this session.

---

## 1. Mission

Build **SwitchType**: a Java Swing on-screen keyboard that a person can use with **one button** (the Space bar),
plus a **simulation and experiment framework** that finds out which scanning settings work best for which kind of
user. This is a university **complex engineering problem (CEP)** for the course *Object Oriented Programming through
Java (VCE-R25)*, so the result must show engineering judgement, measured evidence and honest limits, not only a
working app.

Team (put in READMEs): Madhavarapu Saritha (25881A05V7), Chepyala Vishal (25881A05X9), Gundu Srijay Krishna
(25881A05X0), second-year B.Tech CSE, Vardhaman College of Engineering, batch 6.

### The idea in one paragraph

People who cannot use a normal keyboard (for example because of cerebral palsy, ALS, spinal injury) often use a
**single switch**. The screen shows a keyboard and a highlight moves by itself ("scanning"): first through rows, then
through the keys of the chosen row. The user presses the switch when the highlight is on what they want. This is slow
and tiring, so the design choices matter a lot: how fast the highlight moves, how keys are arranged, whether the
system predicts words, and how it recovers from mistakes.

### The engineering problem (this is the heart of the CEP)

Four things pull against each other:

- **Scan speed.** Slower scanning means fewer mistakes but slow typing. Faster scanning types quicker but people
  miss the moment and select the wrong key.
- **Errors.** Every wrong selection costs time to detect and correct.
- **Tiredness.** Every press costs effort, and effort builds up. Fewer presses per character is better for the user.
- **Typing speed.** The system should be as fast as the user's body allows, not as slow as the safest setting.

Layout order and word prediction can reduce the number of presses, but prediction also adds extra things to scan.
There is no single best setting. It depends on the user, so the project must **measure** it and **help choose**.

---

## 2. Context and rules

### The syllabus (the code should visibly use it)

| Unit | Topics |
|------|--------|
| I | OOP concepts, classes and objects, constructors, overloading, `this`, `static`, arrays, inheritance (all types), `super`, overriding, dynamic method dispatch, abstract classes, `final`, interfaces (define, implement, extend), packages, access protection |
| II | Exceptions (`try`, `catch`, `throw`, `throws`, `finally`, built-in, own subclasses). Multithreading: life cycle, creating threads, priorities, synchronization, inter-thread communication (`wait`, `notify`, `notifyAll`). `String` and `StringBuffer` |
| III | Collections: `ArrayList`, `LinkedList`, `HashSet`, `TreeSet`, `HashMap`, `TreeMap`, `StringTokenizer`, `Arrays`. Streams: `FileInputStream`/`FileOutputStream`, `FileReader`/`FileWriter`, reading and writing files, serialization |
| IV | Swing and AWT event handling: delegation event model, event sources, listeners, adapters, mouse and keyboard events, layout managers (`FlowLayout`, `BorderLayout`, `GridLayout`, `CardLayout`), Swing components (`JFrame`, `JPanel`, `JComponent`, `JLabel`, `JTextField`, `JTabbedPane`, buttons, `JScrollPane`, `JComboBox`, `JTable`) |
| V | JDBC: architecture, driver types, `DriverManager`, `Connection`, `Statement`, `PreparedStatement`, `CallableStatement`, `ResultSet`; CRUD from the console and from a Swing GUI |

Prefer these constructs for the **core logic** because the students must explain every class in a viva.
`java.util.concurrent` and streams are allowed only where clearly useful and explained in a comment.
Lambdas for Swing listeners are fine.

### A finished reference project is in this repo

`Course_End_Project_Java_Green_Corridor/` is a completed project from the same team. **Before writing code, read its
`README.md` and `app/README.md`, and skim `app/src` and `app/src/test`.** Match its structure, quality, test style
and honesty. Do not modify it. Reuse its ideas:

- Maven project, Java 8 compatible source (`maven.compiler.release` 8 profile), shaded runnable jar,
  MySQL Connector/J 9.7.0, JUnit 5. No other libraries.
- A constants class like `SimConfig`, packages per concern, custom exception hierarchy.
- A repository interface with a MySQL implementation **and** an in-memory fallback, so the app runs offline.
- `db.properties` (git-ignored), a settings dialog with "Test connection", `SqlScript` + `SchemaInstaller`
  that run the bundled `.sql` script from Java.
- Stored procedures with `CallableStatement`, batch inserts inside one transaction.
- A checker class for invariants, a headless `Experiment` tool, and a `ScreenshotTour` that drives the real window
  under Xvfb and saves screenshots.
- `README.md` with problem statement, results and a **syllabus-to-code table**, and a long-form explainer
  `project-explained.html` (self-contained, inline SVG diagrams, real code excerpts, viva questions).
- The deserialization allow-list idea in `ScenarioFiles`, if you serialize anything read from disk.

### Non-negotiable rules

1. **Verify, never claim.** Every number in a README, the analysis or the explainer comes from something you ran.
   If a test or experiment fails, say so and fix it or document it. Do not invent results, citations or measurements.
   Parameters of the simulated users are **assumptions** and must be labelled as such everywhere.
2. **Runs offline and online.** Without MySQL the app starts and works (in-memory profiles, files for logs).
   With MySQL 8 (credentials from `db.properties`) it creates its own tables and procedures on first connect.
3. **No real people's data, no network at runtime.** Use generated and self-written data only. Do not download
   corpora or word lists. Do not copy text from books, websites or datasets.
4. **Concurrency discipline.** Document lock order. Never use `sleep` to make something correct. Always re-check
   conditions in a `while` loop around `wait()`. All Swing changes happen on the event dispatch thread. No database
   or file I/O on the event dispatch thread.
5. **Tests.** JUnit 5, at least 25 meaningful tests, including a multithreaded test and a MySQL integration test that
   skips itself when MySQL is unreachable (use a separate `*_test` database). Run `mvn test` after every milestone
   and before every commit.
6. **UI quality.** Take screenshots with the Xvfb tour, **open and look at every one**, and fix clipped text,
   overlaps and ugly layouts before committing.
7. **Readable code.** A second-year student must be able to follow it. Small classes, clear names, Javadoc on every
   non-obvious method, and a short comment where a syllabus concept is used, for example
   `// Unit II: inter-thread communication`. No clever one-liners, no unused code.
8. **Git.** Work on the branch the session gives you. Commit after every milestone with a clear message. Do not
   commit `target/`, `logs/`, `db.properties` or large generated files. Push the branch. **Do not open a pull
   request unless asked.**
9. **The report comes later.** The college will send a report format later (earlier reports in this repo use a
   LaTeX template, see `CEP_Database_Security/Main.tex`). **Do not write the final report now.** Produce raw
   material: `REPORT_NOTES.md` with a ready-to-paste draft of each section, result tables as CSV and markdown,
   charts as PNG.
10. **Do not ask questions you can answer yourself.** Choose a sensible default and write the decision into
    `DESIGN.md`.
11. **Stay small.** The goal is a focused, explainable project of roughly **2,500 to 4,000 lines of main Java**,
    not a giant one. Do the must-haves first and well. Skip a stretch goal rather than do it badly.

### Environment notes (they worked for the previous project)

- MySQL: `apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server`, then `service mysql start`,
  then `mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH caching_sha2_password BY 'root123'; FLUSH PRIVILEGES;"`.
- Maven downloads work through the sandbox proxy.
- Screenshots: `xvfb-run -a -s "-screen 0 1600x1000x24" java -cp ... <TourClass> <out-dir>` using `java.awt.Robot`.
  Chromium is at `/opt/pw-browsers` if you want to check the HTML explainer.
- Java prints a harmless "Picked up JAVA_TOOL_OPTIONS" line on every command.

### Process (follow this order)

1. Write `DESIGN.md` first: architecture, packages and classes, the thread list with priorities, shared data and
   lock order, database schema and procedures, the user-model equations, the experiment plan, the test plan.
2. Build in small milestones (suggested order in section 11). After each: `mvn test`, commit.
3. Run the experiments. Keep the raw outputs.
4. Screenshots, then look at them and fix the UI.
5. Documentation: `README.md`, `app/README.md`, `CEP_ANALYSIS.md`, `REPORT_NOTES.md`, `project-explained.html`.
6. Final checklist: clean `mvn package`, all tests pass, runs offline and with MySQL, README numbers match the raw
   outputs, nothing secret or large committed, an honest list of known limitations.

---

## 3. What to build: the product

Folder: **`CEP_Java_SwitchType/`**. Maven project in `app/`.

### Must-have

1. **On-screen keyboard** (custom-painted `JComponent` or a grid of components) with: letters, digits 0 to 9, space,
   backspace, period, comma, question mark, newline, and a **prediction row** at the top. Plus control keys:
   *Pause scanning*, *Undo last word*, *Settings*.
2. **Single-switch operation.** The Space bar is the switch (via key bindings or a `KeyListener`). A setting also
   allows Enter or a mouse click as the switch. Nothing else is needed to type. Holding the key must not repeat
   (ignore auto-repeat events).
3. **Auto-scanning** with at least these **scan styles**, all behind one abstract type so they are interchangeable:
   - **Linear:** the highlight visits every key in order, one by one.
   - **Row-column:** the highlight visits rows. A press picks a row, then the highlight visits the keys in that row.
     A press picks the key. If the user lets the whole row cycle pass without pressing, it returns to row scanning
     (configurable number of cycles).
   - **Group-binary** (recommended, count as must-have if time allows, otherwise stretch): the keys are split into
     two groups, the highlight shows one group at a time, a press means "yes, it is in this group", no press means
     "no". Repeat until one key is left. Build the split tree from key frequencies (a Huffman-style tree) so common
     letters take fewer steps.
4. **Layouts** (also interchangeable): alphabetical, QWERTY, and **frequency-ordered** (most common letters first
   in the scan order, based on your corpus).
5. **Word prediction** with three modes: off, unigram (word frequency by prefix), bigram (uses the previous word).
   Predictions appear in the top row (3 to 5 words) and the scanner visits that row first. Selecting a prediction
   completes the word and adds a space. The model **learns from what the user accepts** (on this device only) and can
   load an extra vocabulary file.
6. **Settings** (dialog, saved per user): scan interval (200 to 2000 ms), extra delay on the first item of a row
   or group (0 to 100 percent), scan style, layout, prediction mode, number of row cycles, switch choice,
   **adaptive speed** on or off, high-contrast theme, font and key size.
7. **Adaptive scan speed (the innovation).** The system tunes the scan interval while the person types:
   after *N* correct selections in a row (default 5) it speeds up by about 10 percent; after a selection that the
   user immediately corrects with backspace or undo it slows down by about 20 percent; always within a minimum and a
   maximum. Document exactly how "correct" is decided from the user's behaviour, because the system does not know
   the target.
8. **Calibration wizard.** A short reaction-time test (about 10 trials: press when a box changes colour) that
   estimates the user's reaction time and spread, then **recommends settings using the results of your experiments**
   (see section 6, a stored procedure or a lookup table built from experiment output). The user can accept or edit.
9. **Practice mode.** Shows a target phrase from a built-in phrase list. The user types it with the switch. At the
   end it shows characters per minute, errors and presses per character. This is what the examiner will try.
10. **Session logging and history.** Each session stores summary figures (CPM, errors, presses per character) in
    MySQL, with a history tab showing a simple chart drawn with `Graphics2D`. See privacy rules in section 7.

### Should-have

- An audio cue per scan step (a short tone generated with `javax.sound.sampled`, no sound files), on or off.
- Custom vocabulary import from a text file (`FileReader`, `StringTokenizer`).
- Export of session history as CSV.
- A "rest reminder" after a configurable number of minutes of continuous use (tiredness feature).

### Stretch (only if everything above is done and verified)

- Inverse scanning (hold to scan, release to select) as another scan style.
- Telugu-English (romanised) everyday phrases in the phrase list, only if you are confident they are natural.
- Text-to-speech is **not** required (the standard library has none).

### Not in scope

Networking, real eye tracking, machine learning libraries, mobile or web versions, speech recognition.

---

## 4. Architecture requirements

### One engine, two drivers (this is mandatory)

All scanning logic lives in one **pure, deterministic class** (for example `ScanEngine`) that knows nothing about
threads, Swing or wall-clock time. It is a state machine:

- `start(...)`, `onStep()`, `onPress()`, `reset()`.
- It tells its driver how long to wait before the next step (`nextDelayMs()`), because the first item of a row can
  have an extra delay.
- `onPress()` returns an outcome object: *entered a row or group*, *selected key X*, *selected prediction Y*,
  *nothing happened*.

Two drivers use the same engine:

1. **Real-time driver** (`ScannerThread`, a `Thread` or `Runnable`): runs the live app. It uses `System.nanoTime()`,
   waits with `wait(timeout)` and is woken early by `notifyAll()` when the switch is pressed or settings change
   (Unit II: inter-thread communication). It has a higher priority than ordinary threads. It passes highlight
   updates to the Swing thread with `SwingUtilities.invokeLater`. The key event arrives on the Swing thread and is
   handed to the scanner thread through a synchronized method.
2. **Virtual-time driver** (`SimulationDriver`): runs the experiments with no sleeping at all. It steps the engine
   through simulated time, applies a simulated user's presses, and finishes thousands of typing sessions in
   seconds. Results are exactly reproducible from a seed.

The experiments must run the **same engine code** that the live app runs. Say so in the analysis, and test it.

### Suggested packages (adapt as needed)

`model` (key, layout, settings, outcome records, enums) · `scan` (engine, strategies, layouts, adaptive controller) ·
`predict` (language model, corpus loader, predictor) · `sim` (user profiles, simulated user, typing task, metrics,
experiment runner) · `live` (scanner thread, session controller) · `db` · `io` · `exception` · `ui` · `Main`.

### Required design features by unit

- Unit I: abstract `ScanStrategy` with `LinearScan`, `RowColumnScan`, `GroupBinaryScan`; abstract or interface
  `KeyboardLayout` with three implementations; interface `WordPredictor` with `NoPredictor`, `UnigramPredictor`,
  `BigramPredictor`; interface `UserModel` with `SimulatedUser`; enums for style, layout, mode; the key grid as a
  two-dimensional array; static constants; packages; dynamic dispatch everywhere a strategy is chosen.
- Unit II: scanner thread, `wait/notifyAll`, a priority choice that you justify, `StringBuffer` for the text being
  composed, custom exceptions (`InvalidSettingsException`, `CorpusFormatException`, `ProfileStoreException`),
  `finally` to release resources, a clean shutdown with interrupts.
- Unit III: `HashMap` for word counts, `TreeMap` for ordered prefix lookup, `ArrayList` and `LinkedList` for scan
  order and history, `HashSet` for known words, `StringTokenizer` to split the corpus, `Arrays.sort`, file streams to
  read the corpus and vocabulary, `FileWriter` for CSV, serialization of the trained language model and of user
  profiles (with a class allow-list on reading).
- Unit IV: `KeyListener` or key bindings for the switch, `MouseAdapter` for the mouse switch, `Graphics2D` custom
  painting with highlight states, `BorderLayout`, `GridLayout`, `CardLayout`, `JTabbedPane`, `JTable`, `JComboBox`,
  dialogs.
- Unit V: described in section 8.

---

## 5. The simulated-user model (specify exactly, then test it)

The experiments depend on a **simulated person**. It must be simple, documented and visibly an assumption.

### What a simulated user does

For each character to type, the user knows the target key. The engine highlights items at known times. The user:

1. waits **think time** at the start of each word and after each error,
2. presses the switch after the highlight reaches the target, with a **delay** drawn for each press:
   `delay = reaction * (1 - compensation) + jitter`, where `reaction` is drawn from a truncated distribution (never
   below 150 ms), `jitter` is zero-mean noise, and `compensation` between 0 and 1 says how well the user anticipates
   the highlight (skilled users aim before it arrives),
3. the press **lands on whatever item is highlighted at that moment**. If the delay is longer than the scan
   interval, the press lands on a later item and a wrong selection happens. This single rule produces the whole
   speed-versus-error trade-off, so implement it carefully,
4. with a small **miss probability** the user does not press in time and the target comes round again,
5. with a small **spurious probability** per step the user presses by accident,
6. with **detect probability** notices a wrong selection and corrects it (backspace or undo, which must themselves
   be scanned), otherwise the error stays in the text,
7. gets **tired**: every 100 presses the reaction time and the error probabilities grow by a profile-specific
   percentage.

### Profiles (starting values, all are assumptions, keep them in an editable file, for example `profiles.properties`)

| Profile | Reaction mean / spread (ms) | Jitter (ms) | Miss | Spurious | Compensation | Fatigue per 100 presses |
|---------|------------------------------|-------------|------|----------|--------------|--------------------------|
| Quick | 350 / 60 | 40 | 1% | 0.2% | 0.6 | 1% |
| Typical | 500 / 100 | 60 | 2% | 0.5% | 0.5 | 2% |
| Slow | 800 / 180 | 100 | 4% | 0.5% | 0.4 | 3% |
| Tremor | 600 / 120 | 220 | 5% | 3% | 0.4 | 3% |
| Fatigue-prone | 600 / 100 | 80 | 2% | 0.5% | 0.5 | 8% |

State clearly in the docs that these are **not measured from real people** and that real validation (with consent and
ethical approval) is future work. Never claim clinical validity.

### Validate the model before using it

- With **zero noise** (no jitter, no misses, perfect compensation), the simulated number of scan steps per character
  must match the **analytic expectation** within 1 percent. Derive the formulas yourself, for example for linear
  scan the expected steps for a key at position *i* is *i*, so the average over a text is the frequency-weighted mean
  position, and for row-column it is the row index plus the column index (plus any extra first-item delay).
- With a very long interval (several times the reaction time), the error rate must be near zero.
- With a very short interval and no compensation, the error rate must be high.
- The same seed must give identical results, and different seeds must give different but close results.

---

## 6. The experiments (the core of the CEP)

All experiments use the virtual-time driver, fixed seeds, **at least 5 repeats per configuration**, and the **same
seeds across the options being compared**. Typing tasks use a built-in set of **at least 40 original phrases**
(everyday communication, 15 to 40 characters each), written by you. For prediction, use a **train/test split of
the phrases** so that the predictor is evaluated on phrases it never saw. Reporting prediction results on training
phrases is a serious mistake. Keep a small original corpus (several hundred sentences) for the language model, kept
separate from the evaluation phrases.

### Metrics (define each precisely in the analysis)

- **Characters per minute** (CPM) of *correct* text, and words per minute (CPM divided by 5).
- **Error rate**: report the uncorrected error rate and a total error rate that also counts errors that were made
  and corrected. Define the formula you use.
- **Presses per character** (the effort and tiredness measure) and **scan steps per character**.
- **Keystroke savings** from prediction, compared with no prediction.
- **Fatigue effect**: CPM in the last quarter of a 30-minute simulated session against the first quarter.

### Experiments to run

1. **Interval sweep.** For each profile, scan style and layout: CPM and error rate against scan interval
   (200 to 2000 ms in steps of 100). Show the **sweet spot** and where it breaks down on both sides.
2. **Best settings with a constraint.** For each profile: the setting with the highest CPM **subject to an error
   rate of at most 5 percent**. Show this as a table and a **Pareto plot** of speed against error.
3. **Scan styles and layouts compared** at each profile's best interval.
4. **Prediction.** Off, unigram and bigram: keystroke savings, CPM change, and how many words are hit in the top 1,
   3 and 5. Find **where prediction hurts** (for example slow users, or when the predictions row adds more scanning
   than it saves). Report that honestly.
5. **Adaptive speed against fixed.** Compare: the best fixed interval (which a real system would not know), a badly
   chosen fixed interval (too fast and too slow), and the adaptive controller. Plot the interval over time. Show how
   quickly it converges and how close it gets to the best fixed value, for every profile.
6. **Tiredness.** A 30-minute simulated session for every profile. Show CPM over time. Test a **rest policy**
   (a break after *N* minutes) and show whether it helps overall.
7. **Sensitivity of the conclusions.** Change the user-model parameters by plus and minus 20 percent (each
   parameter in turn, then all together). Report which conclusions survive and which do not. This is the most
   important honesty check, because the model is an assumption.
8. **Model validation** (section 5): analytic expectation against simulation.
9. **Real-time accuracy of the scanner thread.** Run the real-time driver headless for 60 s at 200 ms, 500 ms and
   1000 ms and measure how far each step is from its ideal time (mean and 99th percentile of the error). Repeat
   **under CPU load** (several busy threads) and with the scanner thread at **different priorities**. This ties
   the scanning accuracy requirement to thread scheduling (Unit II) and tells you whether the live app is accurate
   enough for the fastest scan speeds you allow.

Save raw results as CSV under `experiments/`, and generate all charts as PNG with a small committed script
(Java in the test tree, or Python if available). Include at least **one surprising or negative result** in the
analysis, and say what you expected instead.

---

## 7. Accessibility, privacy and ethics (design constraints, also assessed)

### Accessibility (WCAG as a design benchmark)

The Web Content Accessibility Guidelines are written for web content, so here they are used as a **design
benchmark, not a formal conformance claim**. Check these, and write a table in the README showing which are met and
how it was verified:

- **Contrast** of text and key labels at least 4.5:1, and of the highlight, key borders and focus indicators at
  least 3:1 (WCAG 1.4.3 and 1.4.11). Write a **unit test** that computes WCAG contrast ratios for every colour pair
  in every theme.
- **Not colour alone** (1.4.1): the highlight must also use a thick border or shape, not only a colour change.
- **Keyboard operable** (2.1.1): the whole app must be usable with the switch key alone, including opening settings
  (provide a scanned *Settings* key) and leaving practice mode.
- **Timing adjustable** (2.2.1) and **pause** (2.2.2): scan speed is adjustable and scanning can be paused at any time.
- **Target size** (2.5.5 enhanced): keys at least 44 by 44 pixels at default size, scalable.
- **Resizable text** (1.4.4): font and key size can be increased.
- **Flashing** (2.3.1): nothing flashes. Test that the highlight never lights the same key more than three times
  per second at the fastest allowed interval.
- **Visible focus** (2.4.7).

### Privacy

Typed text from a person using an assistive device can be very personal (health, family, needs). Therefore:

- **Nothing about the typed text is stored by default.** Session summaries store only counts and timings.
- **Event-level logging** (which key was selected when) lets someone reconstruct the text, so it is **off by default**,
  needs an explicit on-screen consent notice, and stays on the local machine.
- **Data minimisation and retention:** a stored procedure purges old events, and a **"delete all my data"** action
  removes a user's data from every table.
- The learned vocabulary stays on the device and can be reset.
- Refer to India's Digital Personal Data Protection Act, 2023 and the Rights of Persons with Disabilities Act, 2016 as
  **context only**. Do not quote clauses you cannot verify.

### Ethics (a section in the analysis)

- The simulated users are models, not people. Do not present results as if real users were tested.
- Classmates trying the app with one key are **not** a substitute for real switch users.
- Say what real validation would need: consent, ethical review, involvement of users and therapists.

---

## 8. Database (MySQL, optional at runtime, required for the JDBC unit)

Suggested tables: `user_profile` (settings per user), `typing_session` (summary per session),
`selection_event` (event-level log, opt-in only, batch inserted), `experiment_run` and `experiment_result` (every
configuration and its metrics), `recommended_settings` (best settings per user type, derived from experiments).

Suggested stored procedures, called with `CallableStatement`:

- `sp_start_session` (IN profile, OUT session id).
- `sp_finish_session` (IN id and counts, OUT cpm, error rate, presses per character, computed inside MySQL).
- `sp_recommend_settings` (IN reaction time and spread, returns the settings from `recommended_settings` for the
  closest user type). **The calibration wizard calls this**, which is how the experiments feed the product.
- `sp_purge_events` (IN retention days) and `sp_delete_user_data` (IN user id, in one transaction).

Also: foreign keys with sensible `ON DELETE` rules, `ENUM` columns, a batch insert of experiment results inside a
transaction, `ResultSetMetaData` in a generic results viewer, and the console `Experiment` tool able to write its
results into MySQL (this covers "CRUD from the console"). The Swing app covers CRUD from a GUI (profiles and
sessions).

---

## 9. CEP analysis (`CEP_ANALYSIS.md`)

The college assesses the attributes of a complex engineering problem. Write these sections, grounded in your
measured results:

1. **Problem definition**, in the words of a user, not of the code.
2. **Stakeholders** and what each needs, where they conflict: people who use a switch, their caregivers and
   therapists, the people who build and maintain the system, the college evaluators. Include privacy-minded and
   speed-minded views.
3. **Requirements and conflicts**: speed against accuracy against tiredness against privacy against simplicity of
   setup. Say which pairs conflict and how the design chooses.
4. **Constraints and standards**: the WCAG benchmark table, privacy rules, hardware limits (a normal laptop),
   timing accuracy limits found in experiment 9.
5. **Alternatives considered**: at least three real designs (for example fixed scan only; row-column with static
   layout; row-column with prediction; adaptive tuning; group-binary) with a **decision matrix** that uses your
   measured numbers.
6. **Method**: the user model and its assumptions, the metrics, the controlled variables, the repeats, the train/test
   split, and what result would have **disproved** your design.
7. **Results**: tables and charts for all nine experiments, including negative results.
8. **Discussion**: trade-offs, surprises, how sensitive the conclusions are, what you would change.
9. **Limitations and ethics**: the user model is an assumption, no real users, the language corpus is small, and
   what real validation would need.

---

## 10. Deliverables and folder layout

```
CEP_Java_SwitchType/
  README.md                problem, how to run, architecture, results, WCAG table, syllabus-to-code table
  DESIGN.md                written first, kept up to date
  CEP_ANALYSIS.md          the nine sections above
  REPORT_NOTES.md          ready-to-paste draft text per report section
  project-explained.html   long-form explainer, same style as the GreenCorridor one
  experiments/             raw CSV, charts (PNG), the script that makes the charts, profiles.properties
  screenshots/             taken by the Xvfb tour, every one checked by you
  app/                     Maven project (README.md, pom.xml, src/main, src/main/resources/sql, src/test)
```

The `app/README.md` must say how to install, build (`mvn package`), run (`java -jar target/SwitchType.jar`), set up
MySQL, run the experiments from the console, and troubleshoot.

Also add one short section to the **root `README.md`** of the repo pointing to this folder.

---

## 11. Suggested milestones

1. Skeleton: Maven, `DESIGN.md`, packages, constants, exceptions.
2. `ScanEngine` with the three strategies and three layouts, plus unit tests of every key's step count against the
   analytic formula.
3. Language model, corpus, predictors and held-out evaluation, plus tests.
4. Simulated user, typing task, metrics, virtual-time driver, model validation tests.
5. Adaptive controller and its tests.
6. Live app: keyboard painting, `ScannerThread`, Space-bar switch, settings, practice mode.
7. Calibration wizard, profiles and persistence (files and in-memory first).
8. MySQL: schema, procedures, DAO, session history, privacy actions, integration test.
9. Experiments 1 to 9, CSV and charts.
10. Screenshots (including a tour that types a word with `Robot` pressing Space at the right moments).
11. Documentation, explainer page, final checklist.

---

## 12. Acceptance criteria

**Live app**

- With **only the Space bar**, a person can type a word in each scan style and layout, and can open settings and leave
  practice mode. An automated test (virtual time) types a whole phrase with a perfect simulated user in every
  combination of style, layout and prediction mode.
- The scanner thread is accurate: report the measured step error, and make sure the **fastest allowed interval** is
  one the real-time driver can actually keep.
- Holding the switch does not repeat. Settings changes take effect immediately without restarting.
- Contrast tests, the target-size check and the no-flashing check all pass.

**Simulation and experiments**

- Zero-noise validation within 1 percent of the analytic expectation, and the sanity checks in section 5 pass.
- Identical results for the same seed, and a test that proves it.
- All nine experiments completed with at least 5 repeats each and the same seeds across compared options, raw CSV
  saved, charts generated by a committed script.
- The prediction results use held-out phrases, and the README says so.
- Sensitivity analysis done, with a clear statement of which conclusions are robust.
- At least one result that surprised you, written up honestly.

**Code and docs**

- At least 25 tests, one multithreaded, one MySQL integration (skipping itself if MySQL is down). Every strategy,
  layout, predictor and the adaptive controller has direct tests.
- Works offline and with MySQL. Screenshots of every tab taken and checked.
- README numbers match the raw outputs. `CEP_ANALYSIS.md` has all nine sections. The explainer page exists and
  renders without errors.
- An honest list of limitations. No fabricated measurements, no unverified citations, no committed secrets.

---

## 13. What to avoid

- Building a general keyboard framework. Build exactly what is described, small and clear.
- Presenting simulated results as proof about real users.
- Evaluating word prediction on the same phrases used to train it.
- Letting the live app and the simulator use different scanning code.
- Spending effort on decoration before the engine, the model and the experiments are correct.
