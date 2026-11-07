export type FormQuestionType =
  | 'short_text'
  | 'paragraph'
  | 'email'
  | 'number'
  | 'date'
  | 'multiple_choice'
  | 'checkbox'
  | 'dropdown'
  | 'scale'
  | 'section';

export type FormCondition = {
  questionId: string;
  operator: 'equals' | 'not_equals' | 'contains';
  value: string;
};

export type FormQuestion = {
  id: string;
  type: FormQuestionType;
  label: string;
  description?: string;
  required: boolean;
  options: string[];
  scaleMax?: number;
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
  };
  condition?: FormCondition;
};

export type FormSchema = {
  title: string;
  description: string;
  questions: FormQuestion[];
};

export type FormAnswers = Record<string, unknown>;

const QUESTION_TYPES: FormQuestionType[] = [
  'short_text',
  'paragraph',
  'email',
  'number',
  'date',
  'multiple_choice',
  'checkbox',
  'dropdown',
  'scale',
  'section',
];

export const FORM_QUESTION_TYPES: Array<{ value: FormQuestionType; label: string }> = [
  { value: 'short_text', label: 'Short answer' },
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'email', label: 'Email' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'checkbox', label: 'Checkboxes' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'scale', label: 'Linear scale' },
  { value: 'section', label: 'Section heading' },
];

export const hasFormOptions = (type: FormQuestionType) =>
  type === 'multiple_choice' || type === 'checkbox' || type === 'dropdown';

export const createFormQuestion = (type: FormQuestionType = 'short_text'): FormQuestion => ({
  id: crypto.randomUUID(),
  type,
  label: type === 'section' ? 'Untitled section' : 'Untitled question',
  required: false,
  options: hasFormOptions(type) ? ['Option 1'] : [],
  ...(type === 'scale' ? { scaleMax: 5 } : {}),
});

export const readFormSchema = (name: string, value: unknown): FormSchema => {
  const content = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const questions = Array.isArray(content.questions) ? content.questions : [];
  return {
    title: typeof content.title === 'string' ? content.title : name,
    description: typeof content.description === 'string' ? content.description : '',
    questions: questions
      .filter((question): question is Record<string, unknown> => Boolean(question) && typeof question === 'object' && !Array.isArray(question))
      .map((question, index) => {
        const legacyType = question.type === 'long_text' ? 'paragraph'
          : question.type === 'checkboxes' ? 'checkbox'
            : question.type === 'rating' ? 'scale'
              : question.type;
        const type = QUESTION_TYPES.includes(legacyType as FormQuestionType)
          ? legacyType as FormQuestionType
          : 'short_text';
        const validation = question.validation && typeof question.validation === 'object'
          ? question.validation as FormQuestion['validation']
          : {};
        const rawCondition = question.condition && typeof question.condition === 'object'
          ? question.condition as Record<string, unknown>
          : null;
        const operator = rawCondition?.operator;
        return {
          id: typeof question.id === 'string' && question.id ? question.id : `legacy-question-${index + 1}`,
          type,
          label: typeof question.label === 'string' ? question.label : `Question ${index + 1}`,
          description: typeof question.description === 'string' ? question.description : undefined,
          required: question.required === true,
          options: Array.isArray(question.options) ? question.options.filter((option): option is string => typeof option === 'string') : [],
          ...(typeof question.scaleMax === 'number' ? { scaleMax: Math.min(10, Math.max(2, question.scaleMax)) } : {}),
          ...(Object.keys(validation).some((key) => ['minLength', 'maxLength', 'min', 'max'].includes(key))
            ? { validation }
            : {}),
          ...(rawCondition
            && typeof rawCondition.questionId === 'string'
            && typeof rawCondition.value === 'string'
            && ['equals', 'not_equals', 'contains'].includes(String(operator))
            ? { condition: { questionId: rawCondition.questionId, operator: operator as FormCondition['operator'], value: rawCondition.value } }
            : {}),
        };
      }),
  };
};

export const isFormQuestionVisible = (question: FormQuestion, answers: FormAnswers): boolean => {
  const condition = question.condition;
  if (!condition) return true;
  const parentValue = answers[condition.questionId];
  if (parentValue == null || parentValue === '') return false;
  if (condition.operator === 'contains') {
    return Array.isArray(parentValue) && parentValue.includes(condition.value);
  }
  const matches = String(parentValue ?? '') === condition.value;
  return condition.operator === 'equals' ? matches : !matches;
};

const isEmptyAnswer = (value: unknown) =>
  value == null
  || (typeof value === 'string' && value.trim() === '')
  || (Array.isArray(value) && value.length === 0);

const isValidDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export const validateFormAnswers = (schema: FormSchema, answers: FormAnswers) => {
  const errors: Record<string, string> = {};
  const validIds = new Set(schema.questions.filter((question) => question.type !== 'section').map((question) => question.id));

  Object.keys(answers).forEach((id) => {
    if (!validIds.has(id)) errors[id] = 'This answer does not belong to the form.';
  });

  schema.questions.forEach((question) => {
    if (question.type === 'section' || !isFormQuestionVisible(question, answers)) return;
    const value = answers[question.id];
    if (isEmptyAnswer(value)) {
      if (question.required) errors[question.id] = 'This question is required.';
      return;
    }

    const validation = question.validation ?? {};
    if (['short_text', 'paragraph', 'email'].includes(question.type)) {
      if (typeof value !== 'string') {
        errors[question.id] = 'Enter text for this question.';
        return;
      }
      if (validation.minLength !== undefined && value.length < validation.minLength) errors[question.id] = `Enter at least ${validation.minLength} characters.`;
      if (validation.maxLength !== undefined && value.length > validation.maxLength) errors[question.id] = `Use ${validation.maxLength} characters or fewer.`;
      if (question.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[question.id] = 'Enter a valid email address.';
      return;
    }

    if (question.type === 'number' || question.type === 'scale') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors[question.id] = 'Enter a valid number.';
        return;
      }
      const minimum = question.type === 'scale' ? 1 : validation.min;
      const maximum = question.type === 'scale' ? question.scaleMax ?? 5 : validation.max;
      if (minimum !== undefined && value < minimum) errors[question.id] = `Enter a number of at least ${minimum}.`;
      if (maximum !== undefined && value > maximum) errors[question.id] = `Enter a number no greater than ${maximum}.`;
      if (question.type === 'scale' && !Number.isInteger(value)) errors[question.id] = 'Choose a whole number on the scale.';
      return;
    }

    if (question.type === 'date') {
      if (typeof value !== 'string' || !isValidDate(value)) errors[question.id] = 'Enter a valid date.';
      return;
    }

    if (question.type === 'multiple_choice' || question.type === 'dropdown') {
      if (typeof value !== 'string' || !question.options.includes(value)) errors[question.id] = 'Choose one of the listed options.';
      return;
    }

    if (question.type === 'checkbox') {
      if (!Array.isArray(value) || value.some((option) => typeof option !== 'string' || !question.options.includes(option))) {
        errors[question.id] = 'Choose only from the listed options.';
      }
    }
  });

  return errors;
};

export const csvCell = (value: unknown) => {
  const text = Array.isArray(value) ? value.join('; ') : value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};
