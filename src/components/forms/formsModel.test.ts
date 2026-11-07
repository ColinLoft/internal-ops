import { describe, expect, it } from 'vitest';
import {
  csvCell,
  isFormQuestionVisible,
  readFormSchema,
  validateFormAnswers,
} from './formsModel';

describe('company forms schema', () => {
  it('reads existing Drive form field names without changing stored IDs', () => {
    const schema = readFormSchema('Legacy name', {
      title: 'Legacy form',
      description: 'Existing details',
      questions: [
        { id: 'one', type: 'long_text', label: 'Tell us more', required: true, options: [] },
        { id: 'two', type: 'checkboxes', label: 'Choose', required: false, options: ['A', 'B'] },
        { id: 'three', type: 'rating', label: 'Rate', required: false, options: [] },
      ],
    });

    expect(schema.title).toBe('Legacy form');
    expect(schema.questions.map(({ id, type }) => [id, type])).toEqual([
      ['one', 'paragraph'],
      ['two', 'checkbox'],
      ['three', 'scale'],
    ]);
  });

  it('enforces required fields, valid options, and field-specific constraints', () => {
    const schema = readFormSchema('Intake', {
      title: 'Intake',
      questions: [
        { id: 'email', type: 'email', label: 'Email', required: true, options: [] },
        { id: 'choices', type: 'multiple_choice', label: 'Choice', required: true, options: ['Yes', 'No'] },
        { id: 'age', type: 'number', label: 'Age', required: false, options: [], validation: { min: 18, max: 120 } },
        { id: 'date', type: 'date', label: 'Date', required: false, options: [] },
      ],
    });

    expect(validateFormAnswers(schema, {})).toEqual({
      email: 'This question is required.',
      choices: 'This question is required.',
    });
    expect(validateFormAnswers(schema, { email: 'not-an-email', choices: 'Other', age: 12, date: '2026-02-31' })).toEqual({
      email: 'Enter a valid email address.',
      choices: 'Choose one of the listed options.',
      age: 'Enter a number of at least 18.',
      date: 'Enter a valid date.',
    });
  });

  it('applies choice-based conditions and does not require hidden fields', () => {
    const schema = readFormSchema('Conditional', {
      title: 'Conditional',
      questions: [
        { id: 'staff', type: 'multiple_choice', label: 'Are you staff?', required: true, options: ['Yes', 'No'] },
        { id: 'details', type: 'paragraph', label: 'Staff details', required: true, options: [], condition: { questionId: 'staff', operator: 'equals', value: 'Yes' } },
        { id: 'other', type: 'short_text', label: 'If not, explain', required: true, options: [], condition: { questionId: 'staff', operator: 'not_equals', value: 'Yes' } },
      ],
    });

    expect(isFormQuestionVisible(schema.questions[1], { staff: 'Yes' })).toBe(true);
    expect(isFormQuestionVisible(schema.questions[1], { staff: 'No' })).toBe(false);
    expect(isFormQuestionVisible(schema.questions[2], {})).toBe(false);
    expect(validateFormAnswers(schema, { staff: 'No', other: 'Guest' })).toEqual({});
    expect(validateFormAnswers(schema, { staff: 'Yes', other: 'stale answer' })).toEqual({
      details: 'This question is required.',
    });
  });

  it('validates checkbox values and rejects answers to unknown fields', () => {
    const schema = readFormSchema('Preferences', {
      title: 'Preferences',
      questions: [{ id: 'topics', type: 'checkbox', label: 'Topics', required: true, options: ['A', 'B'] }],
    });

    expect(validateFormAnswers(schema, { topics: ['A', 'Unknown'], extra: 'value' })).toEqual({
      extra: 'This answer does not belong to the form.',
      topics: 'Choose only from the listed options.',
    });
    expect(validateFormAnswers(schema, { topics: ['A', 'B'] })).toEqual({});
  });

  it('escapes CSV quotes and serializes checkbox answers', () => {
    expect(csvCell('A "quoted" answer')).toBe('"A ""quoted"" answer"');
    expect(csvCell(['First', 'Second'])).toBe('"First; Second"');
  });
});
