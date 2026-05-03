# fsa-agent PostgreSQL Database Reference

This project generates questions that are inserted into the `fsa-agent` PostgreSQL database.
This document describes how to connect, the full schema, and the exact format required to insert questions correctly.

---

## Connection Details

The database runs in a Docker container named `fsa-postgres` on the host machine.

| Parameter | Value |
|-----------|-------|
| Container | `fsa-postgres` |
| Database  | `fsa_agent` |
| User      | `postgres` |
| Password  | `fsa_dev_password` |
| Port      | `5432` (internal to Docker network `fsa-network`) |

### How to connect from the host (for inserts/migrations)

The container is **not** exposed to localhost directly. Use `docker exec` to run psql inside it:

```bash
# Run a single SQL statement
docker exec fsa-postgres psql -U postgres -d fsa_agent -c "SELECT * FROM lessons;"

# Run a .sql file (copy it into the container first)
docker cp my_questions.sql fsa-postgres:/tmp/my_questions.sql
docker exec fsa-postgres psql -U postgres -d fsa_agent -f /tmp/my_questions.sql
```

There is no direct TCP access from outside the Docker network — always go through `docker exec`.

---

## Schema Overview

```
lessons          — one row per learning objective (e.g. 2A1-1-1)
questions        — multiple rows per lesson; the questions used by the tutor agent
lesson_chunks    — one row per slide within a lesson (used for focused retrieval)
users            — student records (email + name)
user_progress    — per-student, per-lesson progress tracking
chat_history     — transcript of agent conversations per session
```

---

## `lessons` Table

Each lesson maps to one learning objective. Questions reference this table via `lesson_id` and `lesson_code`.

```sql
CREATE TABLE lessons (
    id              SERIAL PRIMARY KEY,
    lesson_code     VARCHAR(20) UNIQUE,          -- e.g. '2A1-1-1' (course-chapter-objective)
    title           VARCHAR(255) NOT NULL,
    video_transcript TEXT,
    summary         TEXT,
    narration_text  TEXT,                        -- slide narration scripts concatenated in order
    source_content  TEXT,                        -- full LaTeX/markdown source (tutor reference)
    key_points      JSONB,                       -- [{title, content}] — one per slide
    practice_questions JSONB,                    -- legacy; DO NOT USE for new questions
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Key point: `lesson_code` format

```
{COURSE_CODE}-{CHAPTER}-{OBJECTIVE}
```
Examples: `2A1-1-1`, `2A1-1-2`, `2B1-3-4`

This is the same code that the LMS appends as a query parameter to the iframe URL.
You MUST use the correct `lesson_code` when inserting questions.

### Finding the `lesson_id` for a lesson_code

```sql
SELECT id, lesson_code, title FROM lessons ORDER BY lesson_code;
```

---

## `questions` Table — Primary Target for This Project

This is the table you will populate with generated questions.

```sql
CREATE TABLE questions (
    id             SERIAL PRIMARY KEY,
    lesson_id      INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
    lesson_code    VARCHAR(20),                  -- denormalized for query convenience; keep in sync with lesson_id
    chapter_id     VARCHAR(50),                  -- e.g. '2A1-1'  (course + chapter, no objective)
    course_id      VARCHAR(50),                  -- e.g. '2A1'
    question_text  TEXT NOT NULL,
    options        JSONB NOT NULL,               -- array of strings — NEVER empty or null
    correct_answer INTEGER NOT NULL,             -- 0-based index into options array
    explanation    TEXT,                         -- shown after student answers; include worked solution
    difficulty     INTEGER NOT NULL DEFAULT 3    -- 1 (easiest) to 5 (hardest); CHECK (difficulty BETWEEN 1 AND 5)
                   CHECK (difficulty BETWEEN 1 AND 5),
    topic          VARCHAR(100),                 -- short slug, e.g. 'thickness_formula'
    question_type  VARCHAR(30) NOT NULL DEFAULT 'objective_practice'
                   CHECK (question_type IN ('objective_practice', 'chapter_quiz')),
    step_data      JSONB,                        -- null for simple MCQ; see staged format below
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Field-by-field rules

| Field | Rule |
|-------|------|
| `lesson_id` | Integer FK to `lessons.id` — look it up first |
| `lesson_code` | Copy of `lessons.lesson_code` — keep in sync |
| `chapter_id` | `{COURSE_CODE}-{CHAPTER}` — e.g. `'2A1-1'` |
| `course_id` | Just the course code — e.g. `'2A1'` |
| `options` | JSONB array of 4 strings. **Never `[]` or `null`** — questions with empty options are silently skipped by the agent |
| `correct_answer` | 0-based index of the correct option |
| `explanation` | Required for chapter_quiz; strongly recommended for objective_practice. Include the worked calculation if applicable |
| `difficulty` | 1–5 integer. Typical: concept questions = 1–2, calculation questions = 3–5 |
| `topic` | snake_case slug — used for grouping and struggle tracking |
| `question_type` | `'objective_practice'` = shown during the lesson; `'chapter_quiz'` = drawn at end of chapter mixed with other objectives |
| `step_data` | Only for staged calculation problems — see below |

### `question_type` usage

- **`objective_practice`** — the agent picks up to 2 of these per session to test the student mid-lesson. Keep difficulty 1–3.
- **`chapter_quiz`** — drawn at end of the chapter, mixed across objectives. Use for full worked calculations, difficulty 3–5.

---

## Simple MCQ Insert Example

```sql
INSERT INTO questions (
    lesson_id, lesson_code, chapter_id, course_id,
    question_text, options, correct_answer, explanation,
    difficulty, topic, question_type
)
VALUES (
    1, '2A1-1-1', '2A1-1', '2A1',
    'If the allowable stress S increases while P and D remain constant, what happens to required wall thickness t?',
    '["Thickness increases", "Thickness decreases", "Thickness stays the same", "Thickness doubles"]',
    1,
    'A higher S means the denominator (2S + P) grows while PD stays constant, so t decreases — a stronger material needs less metal.',
    2, 'stress_relationship', 'objective_practice'
);
```

---

## Staged Calculation Questions

Calculation questions MUST be broken into 2–4 steps, each as its own MCQ step. The top-level `options` column must still contain 4 strings (for the first step), and `step_data` contains the full step sequence.

### `step_data` format

```json
{
  "steps": [
    {
      "type": "formula_choice",
      "context": "A tube is 75 mm O.D. with wall thickness 4.75 mm, S = 102 MPa, e = 0.",
      "question": "Which equation do you use to find the MAWP?",
      "options": ["Equation 1.1 — solves for t", "Equation 1.2 — solves for P", "Equation 1.3 — thin-wall hoop", "Equation 1.7 — thick-wall"],
      "correct": 1,
      "explanation": "Equation 1.2 is the rearrangement that solves directly for P given known t."
    },
    {
      "type": "substitution",
      "context": "Using Eq. 1.2: P = S × [(2t − 0.01D − 2e) / (D − (t − 0.005D − e))]",
      "question": "Which expression correctly substitutes the values?",
      "options": [
        "102 × [(2×4.75 − 0.01×75) / (75 − (4.75 − 0.005×75))]",
        "102 × [(4.75 − 0.01×75) / 75]",
        "102 × [4.75 / (75 − 4.75)]",
        "4.75 × [(2×102 − 0.01×75) / (75 + 4.75)]"
      ],
      "correct": 0,
      "explanation": "Numerator = 2(4.75) − 0.01(75) = 8.75. Denominator = 75 − (4.75 − 0.375) = 70.625."
    },
    {
      "type": "final_answer",
      "context": "P = 102 × (8.75 / 70.625)",
      "question": "What is the approximate MAWP?",
      "options": ["8,750 kPa", "12,640 kPa", "15,200 kPa", "10,200 kPa"],
      "correct": 1,
      "explanation": "102 × 8.75 / 70.625 = 12.64 MPa = 12,640 kPa."
    }
  ]
}
```

### Staged question insert example

The top-level `options` must match the first step's options so the display panel always has something to render.

```sql
INSERT INTO questions (
    lesson_id, lesson_code, chapter_id, course_id,
    question_text, options, correct_answer, explanation,
    difficulty, topic, question_type, step_data
)
VALUES (
    1, '2A1-1-1', '2A1-1', '2A1',
    'A superheater tube is 75 mm O.D. with wall thickness 4.75 mm, S = 102 MPa, e = 0. Find the MAWP.',
    '["Equation 1.1 — solves for t", "Equation 1.2 — solves for P", "Equation 1.3 — thin-wall hoop", "Equation 1.7 — thick-wall"]',
    1,
    'Full worked solution: using Eq. 1.2, P = 102 × [(2×4.75 − 0.75) / (75 − 4.375)] = 12.64 MPa.',
    3, 'mawp_calculation', 'chapter_quiz',
    '{
      "steps": [
        { "type": "formula_choice", "options": ["Equation 1.1 — solves for t", "Equation 1.2 — solves for P", "Equation 1.3 — thin-wall hoop", "Equation 1.7 — thick-wall"], "correct": 1, "explanation": "Equation 1.2 solves for P directly." },
        { "type": "final_answer", "options": ["8,750 kPa", "12,640 kPa", "15,200 kPa", "10,200 kPa"], "correct": 1, "explanation": "P = 102 × 8.75/70.625 = 12.64 MPa." }
      ]
    }'
);
```

---

## `lesson_chunks` Table (read-only reference)

One row per slide. The tutor agent queries this for focused content retrieval. You should not need to insert here — this is populated from the source lesson content.

```sql
CREATE TABLE lesson_chunks (
    id             SERIAL PRIMARY KEY,
    lesson_code    VARCHAR(20) NOT NULL,
    slide_number   INTEGER NOT NULL,
    chunk_type     VARCHAR(30),        -- e.g. 'heading', 'body', 'formula'
    title          TEXT,
    body           TEXT,               -- slide display text
    narration      TEXT,               -- narration script for this slide
    source_content TEXT,               -- full LaTeX source for this slide
    CONSTRAINT uq_lesson_chunk UNIQUE (lesson_code, slide_number)
);
```

---

## Indexes Already in Place

```
idx_questions_lesson     ON questions(lesson_id)
idx_questions_chapter    ON questions(chapter_id)
idx_questions_type       ON questions(question_type)
idx_questions_difficulty ON questions(difficulty)
idx_questions_code       ON questions(lesson_code)
idx_lessons_code         ON lessons(lesson_code)
idx_chunks_lesson        ON lesson_chunks(lesson_code)
idx_chunks_fts           GIN full-text search on lesson_chunks(title, body, narration)
```

---

## Quick Reference — Lookup Queries

```sql
-- List all lessons
SELECT id, lesson_code, title FROM lessons ORDER BY lesson_code;

-- Count questions per lesson
SELECT lesson_code, question_type, COUNT(*) FROM questions
GROUP BY lesson_code, question_type ORDER BY lesson_code, question_type;

-- Preview questions for a lesson
SELECT id, difficulty, topic, question_type, LEFT(question_text, 80)
FROM questions WHERE lesson_code = '2A1-1-1' ORDER BY difficulty;

-- Check for bad options (empty arrays — these are skipped by the agent)
SELECT id, lesson_code, question_text FROM questions
WHERE options = '[]'::jsonb OR options IS NULL;
```
