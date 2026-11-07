import React from 'react';
import { isFormQuestionVisible } from './formsModel';
import type { FormAnswers, FormQuestion } from './formsModel';

type Props = {
  formId: string;
  question: FormQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  disabled?: boolean;
};

const inputClass = 'min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 disabled:bg-slate-50';

export const FormQuestionField: React.FC<Props> = ({ formId, question, value, onChange, error, disabled }) => {
  const describedBy = error ? `${question.id}-error` : undefined;
  const aria = {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    disabled,
  };
  const selected = Array.isArray(value) ? value as unknown[] : [];
  let control: React.ReactNode = null;

  if (question.type === 'short_text' || question.type === 'email') {
    control = (
      <input
        {...aria}
        id={question.id}
        type={question.type === 'email' ? 'email' : 'text'}
        maxLength={question.validation?.maxLength ?? 2000}
        minLength={question.validation?.minLength}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    );
  } else if (question.type === 'paragraph') {
    control = (
      <textarea
        {...aria}
        id={question.id}
        rows={4}
        maxLength={question.validation?.maxLength ?? 2000}
        minLength={question.validation?.minLength}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    );
  } else if (question.type === 'number') {
    control = (
      <input
        {...aria}
        id={question.id}
        type="number"
        min={question.validation?.min}
        max={question.validation?.max}
        value={typeof value === 'number' ? value : ''}
        onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
        className={inputClass}
      />
    );
  } else if (question.type === 'date') {
    control = (
      <input
        {...aria}
        id={question.id}
        type="date"
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    );
  } else if (question.type === 'dropdown') {
    control = (
      <select {...aria} id={question.id} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} className={inputClass}>
        <option value="">Choose an option</option>
        {question.options.map((option, index) => <option key={`${option}-${index}`} value={option}>{option}</option>)}
      </select>
    );
  } else if (question.type === 'multiple_choice' || question.type === 'checkbox') {
    const type = question.type === 'multiple_choice' ? 'radio' : 'checkbox';
    control = (
      <div className="space-y-1">
        {question.options.map((option, index) => {
          const checked = type === 'radio' ? value === option : selected.includes(option);
          return (
            <label key={`${option}-${index}`} className="flex min-h-9 items-center gap-2 text-sm text-slate-700">
              <input
                {...aria}
                type={type}
                name={`${formId}-${question.id}`}
                value={option}
                checked={checked}
                onChange={(event) => {
                  if (type === 'radio') onChange(option);
                  else onChange(event.target.checked ? [...selected, option] : selected.filter((item) => item !== option));
                }}
                className="h-4 w-4 accent-brand-600"
              />
              {option}
            </label>
          );
        })}
      </div>
    );
  } else if (question.type === 'scale') {
    const maximum = Math.min(10, Math.max(2, question.scaleMax ?? 5));
    control = (
      <div role="radiogroup" aria-labelledby={`${question.id}-label`} aria-describedby={describedBy} aria-invalid={error ? true : undefined} className="flex flex-wrap gap-2">
        {Array.from({ length: maximum }, (_, index) => index + 1).map((number) => (
          <label key={number} className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border text-sm ${value === number ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
            <input
              type="radio"
              name={`${formId}-${question.id}`}
              value={number}
              checked={value === number}
              onChange={() => onChange(number)}
              disabled={disabled}
              className="sr-only"
            />
            {number}
          </label>
        ))}
      </div>
    );
  }

  const isChoiceGroup = question.type === 'multiple_choice' || question.type === 'checkbox' || question.type === 'scale';
  const label = <>{question.label}{question.required && <span className="ml-1 text-rose-700" aria-label="required">*</span>}</>;
  const description = question.description && <p className="mb-2 whitespace-pre-wrap text-sm text-slate-600">{question.description}</p>;
  const errorMessage = error && <p id={`${question.id}-error`} className="mt-1.5 text-sm text-rose-700" role="alert">{error}</p>;

  if (isChoiceGroup) {
    return (
      <fieldset>
        <legend id={`${question.id}-label`} className="mb-2 text-sm font-medium text-slate-800">{label}</legend>
        {description}
        {control}
        {errorMessage}
      </fieldset>
    );
  }

  return (
    <div>
      <label htmlFor={question.id} className="mb-2 block text-sm font-medium text-slate-800">{label}</label>
      {description}
      {control}
      {errorMessage}
    </div>
  );
};

export const visibleFormQuestions = (questions: FormQuestion[], answers: FormAnswers) =>
  questions.filter((question) => isFormQuestionVisible(question, answers));
