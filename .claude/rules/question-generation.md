# Question Generation Rules for fsa-agent

## Core Requirement: Every Question Must Be Standalone

All questions generated for `objective_practice` and `chapter_quiz` types must be fully self-contained. A student who has never opened the course material must be able to read and answer the question using only general Power Engineering knowledge and what is stated in the question itself.

**Self-test before finalizing any question:**
> *Could a student who has never opened this lesson read this question and understand exactly what is being asked, using only the text of the question and their general Power Engineering knowledge?*

If the answer is no — rewrite or exclude it.

---

## Rule 1: Never Reference Lesson Content by Location

Do not use phrases that point to something the student must have seen. The following patterns are banned:

| Banned pattern | Example of what NOT to write |
|---|---|
| "as described/defined/outlined/identified/discussed in the lesson" | "Which of the following is correct, as described in the lesson?" |
| "from the lesson" / "in the lesson" | "Using the formula from the lesson…" |
| "as shown" / "shown in" | "As shown in the diagram, what happens when…" |
| "refer to" / "referring to" | "Referring to the temperature-entropy diagram in the lesson…" |
| "presented in" / "seen in" | "Using the values presented in the example…" |

**Fix:** Remove the phrase and rephrase so the question tests the concept directly. In most cases the phrase adds nothing and can simply be deleted.

---

## Rule 2: Never Reference a Numbered Example, Figure, or Table

Do not write:
- "If the values in Example 8 were changed to…"
- "According to Table 1 from the lesson…"
- "Refer to Figure 41…"
- "Using the data from Example 2…"
- "According to the log sheet example in the lesson…"

**Fix:** Embed the necessary values directly in the question stem, or reframe as a general scenario that does not require the source material.

**Bad:**
> Using the test data from the lesson, what is the calculated specific work done by the turbine?

**Good:**
> A turbine receives steam at 3,500 kPa and 400°C and exhausts at 10 kPa. The measured enthalpy drop is 820 kJ/kg and the isentropic enthalpy drop is 950 kJ/kg. What is the isentropic efficiency of the turbine?

---

## Rule 3: All Data Needed to Answer Must Live in the Question Stem

Calculation questions must embed every required value in the question itself. Never assume the student has access to a worksheet, worked example, log sheet, or any reference that was part of the lesson content.

---

## Rule 4: Do Not Imply a Diagram or Figure the Student Cannot See

Do not write questions that only make sense if the student is looking at a specific diagram, schematic, or figure. Either describe the configuration in words within the question stem, or test the underlying concept without the visual.

**Bad:**
> In the two-unit series RO system described in the lesson, what is the purpose of the booster pump located between the two units?

**Good:**
> In a two-unit series reverse osmosis system, what is the primary purpose of a booster pump located between the first and second RO unit?

---

## Rule 5: Calculation Questions — Use Staged Multiple Choice

Calculation questions (e.g. "Find the MAWP of a tube given these parameters") must NOT be stored as open-ended free-text questions with empty options arrays. The fsa-agent's practice question display requires at least one MCQ step to render correctly.

Break every calculation question into 2–4 staged steps, where **each step is its own multiple choice question**:

1. **Formula selection** — "Which formula applies here?" → 4 options (correct formula vs. plausible alternatives)
2. **Unit check** — "Do any values need converting before substituting?" → Yes/No or 4 options describing what to convert
3. **Substitution / setup** — "Which of these correctly substitutes the values into the formula?" → 4 expressions to choose from
4. **Final answer** — "What is the result?" → 4 numeric answers (correct + three distractors within a plausible range)

Repeat the word problem or a variant that retains the data the student needs to answer the quesiton. Never assume the questions are delivered in series and the student remembers the original context. (See **Core Requirement: Every Question Must Be Standalone**)

---

## Rule 6: Database Schema Requirements

The `questions` table in fsa-agent requires:
- `options`: a JSONB array of strings — **must never be empty or null** for any question served in practice mode
- `step_data`: a JSONB object with a `steps` array for staged/multi-step problems
- `question_type`: use `'objective_practice'` for per-lesson practice, `'chapter_quiz'` for end-of-chapter
- `standalone`: must be `TRUE` for all newly generated questions — questions that cannot satisfy Rule 1–4 should not be generated at all

Questions with `options = []` or `options IS NULL` are filtered out by the orchestrator and will never be shown to students.

---

## Step Data Format (for staged problems)

```json
{
  "steps": [
    {
      "type": "formula_choice",
      "context": "Brief setup paragraph shown to student before the question",
      "formula_options": ["Formula A", "Formula B", "Formula C", "Formula D"],
      "correct": "Formula B"
    },
    {
      "type": "unit_check",
      "question": "Do any of the given values need unit conversion?",
      "answer": "yes"
    },
    {
      "type": "substitution",
      "expected_setup": "P = 2 × 88.3 × 4.75 / (75 − 0.005 × 75 − 4.75)"
    },
    {
      "type": "final_answer",
      "correct_answer": "12640 kPa",
      "tolerance": "± 50 kPa"
    }
  ]
}
```

The `options` column at the top-level question row should contain the 4 answer choices for the **first step** (or most representative step) so the display panel always has something to render.

---

## Note on "Which of the following"

Phrases like "which of the following," "which statement is correct," and "which of the following is NOT" are acceptable and expected. These refer to the answer options provided, not to unseen material, and are not subject to the banned-phrase rules above.
