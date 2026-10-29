# RESEARCH PROJECT: LLM-BASED PERSONALIZED MEAL PLANNING AGENT

## 0. DEADLINE
- Submission deadline: 15/08/2026
- Current date: 13/08/2026
- Priority: finish a valid research paper first, optimize system later

## 1. CURRENT RESEARCH CONTEXT

Original topic:
"Ứng dụng AI trong đề xuất xây dựng thực đơn cá nhân hóa"

Original proposed goals:
- Build a website integrated with an AI chatbot for nutrition meal planning.
- Evaluate usability and effectiveness through student experience.

Original target:
- Students and lecturers at the university.
- Planned collected variables: age, gender, height, weight, recent meals, favorite foods, fast-food frequency, chatbot satisfaction, website interface evaluation, intention to reuse.

Main reviewer concerns:
- Specify WHICH AI/model is used.
- Narrow down the study population.
- Clarify research design.
- Specify sample size and sampling method.
- Specify usability evaluation tool.
- Clarify scientific novelty/contribution.
- Avoid describing "students eat unhealthily" as novelty.
- Focus on scientific value, not merely building an application.

SOURCE:
- Research feedback: "Phiếu nhận xét VNM,VKP,NBD.docx"
- Research proposal: "BM.V.1.NCKH_.QT01.DEXUAT_Sinh vien.docx"
- IEEE conference template: "conference-template-a4.docx"

## 2. RECOMMENDED PAPER TITLE

Vietnamese:
"Thiết kế và đánh giá AI Agent dựa trên mô hình ngôn ngữ lớn trong xây dựng thực đơn cá nhân hóa cho sinh viên"

English:
"Design and Evaluation of an LLM-Based Personalized Meal Planning Agent for University Students"

Avoid broad title:
"Ứng dụng AI trong đề xuất xây dựng thực đơn cá nhân hóa"

Reason:
The paper must explicitly identify the AI technology and research population.

## 3. MAIN RESEARCH IDEA

Do NOT build:
LLM -> directly generate meal plan

Build:
User Profile
    ->
Nutrition Requirement Calculator
    ->
LLM-based Meal Planning Agent
    ->
Nutrition/Food Database
    ->
Constraint Validator
    ->
If FAIL: regenerate
If PASS: final personalized meal plan

Core concept:
LLM = language/reasoning component
Database = nutrition facts
Calculator = nutritional requirements
Validator = correctness/constraint checking
Agent = planning + tool use + regeneration

## 4. RESEARCH QUESTIONS

RQ1:
Can an LLM-based AI Agent generate meal plans that satisfy individual nutritional needs and food preferences of university students?

RQ2:
How well do the generated meal plans satisfy nutritional and personalization constraints?

RQ3:
How usable and acceptable is the proposed system to university students?

## 5. SCIENTIFIC CONTRIBUTIONS

Contribution 1:
Design an LLM-based personalized meal planning Agent.

Contribution 2:
Integrate structured nutrition data and user-specific constraints into meal generation.

Contribution 3:
Add a validation/regeneration mechanism to improve compliance.

Contribution 4:
Evaluate the system using quantitative nutrition metrics and user usability/acceptance measures.

Important:
Website is NOT the main scientific contribution.
Website = implementation/interface.
Main contribution = AI Agent architecture + nutrition constraints + evaluation.

## 6. PAPER STRUCTURE

### I. INTRODUCTION
Write 4-6 paragraphs:
1. Problem: students have limited time and difficulty planning balanced meals.
2. Personalized nutrition requires considering individual characteristics/preferences.
3. LLMs can understand natural-language user requirements.
4. LLM-only generation may produce inconsistent nutritional information.
5. Proposed solution: LLM Agent + nutrition database + constraints + validator.
6. Contributions.

End Introduction with 3-4 explicit contributions.

### II. RELATED WORK
A. Personalized Nutrition
B. AI-based Meal Planning
C. LLM-based Nutrition/Meal Planning
D. Research Gap

Research gap:
LLM can improve natural-language interaction and personalization, but should be combined with structured nutrition data and constraint validation.

### III. METHODOLOGY

A. Study Population
- Recommended scope: university students only.
- Do not keep students + lecturers unless there is a strong reason.

B. User Data
Collect:
- Age
- Gender
- Height
- Weight
- Physical activity
- Nutrition goal
- Favorite foods
- Disliked foods
- Allergies/foods to avoid
- Meals per day
- Budget
- Cooking time

C. System Architecture
Required Figure 1:

User Profile
    ->
Profile Processing
    ->
Nutrition Requirement Calculator
    ->
LLM Meal Planning Agent
    ->
Food/Nutrition Database
    ->
Constraint Validator
    -> PASS -> Final Meal Plan
    -> FAIL -> Regenerate

D. AI MODEL
MUST explicitly identify:
- LLM provider
- Exact model name
- API
- Prompting method
- Temperature/settings if applicable

Do NOT write only:
"AI was used."

Use actual model used in experiment.

E. Nutrition Engine
Calculate:
- Energy requirement
- Protein
- Carbohydrate
- Fat
- Potentially fiber

F. Nutrition Database
Structured food information:
- Food name
- Portion
- Calories
- Protein
- Carbohydrate
- Fat
- Other nutrients if available

G. Constraint Validator
Check:
- Calorie target
- Macronutrient target
- Food exclusions
- Allergies
- User preferences
- Number of meals
- Budget if implemented

If constraints fail:
Meal plan -> regenerate -> validate again

## 7. EXPERIMENT DESIGN

### Experiment 1: Meal Plan Quality

For each participant/profile:
1. Build profile.
2. Generate personalized meal plan.
3. Validate nutritional content.
4. Record metrics.

Metrics:

1. Calorie Error
|Generated Calories - Target Calories|

2. Protein Error
|Generated Protein - Target Protein|

3. Macronutrient Compliance
Percentage of plans satisfying predefined macro ranges.

4. Constraint Satisfaction
Percentage satisfying:
- no prohibited foods
- preferences
- meal count
- budget
- other constraints

5. Personalization Score
Use 1-5 Likert items such as:
"The meal plan matches my food preferences."

DO NOT invent final results before actual testing.

### Experiment 2: Usability / Acceptance

Recommended tool:
SUS (System Usability Scale)

Also measure:
- Satisfaction
- Perceived usefulness
- Intention to reuse
- Perceived personalization

Use 5-point Likert for custom items.

## 8. SAMPLE

Recommended:
- Narrow population to university students.
- Sample size must be stated from the actual study design/data.

IMPORTANT:
Do not fabricate N.
If data has not been collected yet, write:
"Sample size will be determined based on the final recruitment plan."

If actual sample exists:
replace with real N and sampling method.

## 9. RESULTS

Prepare 3 main tables.

TABLE I:
Participant characteristics
- Age
- Gender
- BMI
- Activity level
- Goal

TABLE II:
Nutrition performance
- Calorie error
- Protein error
- Macro compliance
- Constraint satisfaction

TABLE III:
User evaluation
- SUS
- Satisfaction
- Personalization
- Intention to reuse

DO NOT fabricate numerical results.

## 10. DISCUSSION

Answer:
1. What did the results show?
2. Why did the system perform that way?
3. How does it compare with previous studies?
4. What does the combination of LLM + database + validation contribute?

Avoid generic statements such as:
"AI is useful."

Use evidence from measured results.

## 11. LIMITATIONS

Mention:
- Student-only sample.
- Limited sample size if applicable.
- Short evaluation period.
- No long-term health outcome validation.
- Possible LLM hallucination/inconsistency.
- System is not a replacement for professional nutrition advice.

## 12. CONCLUSION

Summarize:
- Proposed LLM-based Agent.
- Personalized meal planning capability.
- Nutrition + constraint validation.
- Evaluation outcome.
- Future work.

## 13. ABSTRACT

Write LAST.

Structure:
Background
Objective
Methods
Results
Conclusion

Target:
~150-250 words.

Keywords:
Large Language Model; AI Agent; Personalized Nutrition; Meal Planning; Food Recommendation; Usability

## 14. IEEE TEMPLATE RULES

Use provided:
conference-template-a4.docx

Important:
- A4 template.
- Two-column IEEE format.
- Do NOT modify preset margins/columns/line spacing/fonts.
- Do NOT manually add page numbers.
- Do NOT number headings manually.
- Figure caption BELOW figure.
- Table title ABOVE table.
- Cite figures/tables before they appear.
- Remove ALL template instructional text before submission.
- Abstract/title should not contain unnecessary special symbols or formulas.
- References use IEEE numbering [1], [2], [3]...

## 15. REQUIRED FIGURES

Minimum recommended:

FIG. 1
System architecture of the proposed personalized meal planning Agent.

Optional:
FIG. 2
Agent workflow: profile -> planning -> validation -> regeneration.

## 16. REQUIRED TABLES

TABLE I
Participant characteristics.

TABLE II
Nutritional compliance of generated meal plans.

TABLE III
Usability and user acceptance.

## 17. TWO-DAY EXECUTION PLAN

### 13/08
Priority:
1. Finalize title.
2. Finalize RQs.
3. Finalize scientific contributions.
4. Choose exact LLM.
5. Design architecture.
6. Define user variables.
7. Define nutrition metrics.
8. Define SUS/usability evaluation.
9. Write Introduction.
10. Write Related Work.
11. Write Methodology.

### 14/08
Priority:
1. Implement minimum viable Agent.
2. Prepare nutrition database.
3. Generate test meal plans.
4. Collect real evaluation data.
5. Calculate metrics.
6. Create Tables I-III.
7. Write Results.
8. Write Discussion.
9. Write Limitations.
10. Write Conclusion.
11. Write Abstract.
12. Add References.

### 15/08
Final check:
1. IEEE formatting.
2. Remove all template text.
3. Verify figures/tables.
4. Verify citations.
5. Verify references.
6. Grammar check.
7. Final PDF.
8. Submit.

## 18. CLI WORKFLOW

Suggested project structure:

research/
├── README.md
├── paper/
│   ├── introduction.md
│   ├── related_work.md
│   ├── methodology.md
│   ├── results.md
│   ├── discussion.md
│   ├── limitations.md
│   ├── conclusion.md
│   └── abstract.md
├── data/
│   ├── user_profiles.csv
│   ├── food_database.csv
│   └── evaluation.csv
├── agent/
│   ├── profile.py
│   ├── nutrition.py
│   ├── planner.py
│   └── validator.py
├── experiments/
│   ├── generate_plans.py
│   ├── evaluate_nutrition.py
│   └── evaluate_usability.py
├── figures/
│   └── architecture.png
└── references/
    └── references.bib

## 19. MVP PRIORITY

Do NOT spend time on:
- Complex frontend
- Mobile app
- Fine-tuning LLM
- Large-scale deployment
- Complex multi-agent architecture

Focus on:
LLM + profile + nutrition database + planner + validator + evaluation.

## 20. MOST IMPORTANT MESSAGE FOR THE PAPER

The research story should be:

"An LLM alone can generate natural-language meal plans, but reliable personalized nutrition requires structured user information, nutritional data, constraints, and validation. Therefore, this study designs an LLM-based AI Agent that combines these components and evaluates its nutritional compliance, personalization, usability, and user acceptance among university students."

## 21. CURRENT NEXT STEP

FIRST:
Finalize these 5 items before writing the full paper:

1. Exact paper title.
2. Exact LLM/model.
3. Exact study population.
4. Exact evaluation metrics.
5. Exact sample/data available.

Only after these are fixed:
write the complete paper.