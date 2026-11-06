import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

type SelectChangeEvent = {
  target: { value: string };
  currentTarget: { value: string };
};

interface CustomSelectProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'children' | 'value' | 'name'> {
  value?: string | number;
  defaultValue?: string | number;
  name?: string;
  required?: boolean;
  onChange?: (event: SelectChangeEvent) => void;
  children?: React.ReactNode;
}

interface Option {
  value: string;
  label: string;
  disabled: boolean;
}

const textContent = (node: React.ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textContent(node.props.children);
  return '';
};

const collectOptions = (children: React.ReactNode): Option[] =>
  React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement<{ value?: string | number; disabled?: boolean; children?: React.ReactNode }>(child)) return [];
    if (child.type === React.Fragment) return collectOptions(child.props.children);
    if (child.type !== 'option') return [];
    const value = child.props.value ?? textContent(child.props.children);
    return [{
      value: String(value),
      label: textContent(child.props.children),
      disabled: Boolean(child.props.disabled),
    }];
  });

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  defaultValue,
  onChange,
  children,
  className = '',
  disabled,
  name,
  required,
  ...buttonProps
}) => {
  const [uncontrolledValue, setUncontrolledValue] = useState(String(defaultValue ?? ''));
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const options = useMemo(() => collectOptions(children), [children]);
  const selectedValue = value === undefined ? uncontrolledValue || options[0]?.value || '' : String(value);
  const selectedOption = options.find((option) => option.value === selectedValue);
  const selectedIndex = options.findIndex((option) => option.value === selectedValue && !option.disabled);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[selectedIndex >= 0 ? selectedIndex : 0]?.focus();
  }, [open, selectedIndex]);

  const enabledOptionIndices = options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0);
  const focusOptionAt = (position: number) => {
    if (!enabledOptionIndices.length) return;
    const optionIndex = enabledOptionIndices[(position + enabledOptionIndices.length) % enabledOptionIndices.length];
    optionRefs.current[optionIndex]?.focus();
  };

  const selectOption = (option: Option) => {
    if (option.disabled) return;
    if (value === undefined) setUncontrolledValue(option.value);
    onChange?.({ target: { value: option.value }, currentTarget: { value: option.value } });
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative inline-block w-full">
      {name && <input type="hidden" name={name} value={selectedValue} />}
      <button
        {...buttonProps}
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required}
        aria-controls={listboxId}
        onClick={() => setOpen((isOpen) => !isOpen)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={`inline-flex w-full items-center justify-between gap-2 text-left ${className}`}
      >
        <span className="min-w-0 flex-1 truncate">{selectedOption?.label || 'Select an option'}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <ul id={listboxId} role="listbox" className="absolute left-0 top-full z-[70] mt-1 max-h-64 min-w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
          {options.map((option, index) => (
            <li key={`${option.value}-${index}`}>
              <button
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="option"
                aria-selected={option.value === selectedValue}
                tabIndex={-1}
                disabled={option.disabled}
                onClick={() => selectOption(option)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    focusOptionAt(enabledOptionIndices.indexOf(index) + 1);
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    focusOptionAt(enabledOptionIndices.indexOf(index) - 1);
                  } else if (event.key === 'Home') {
                    event.preventDefault();
                    focusOptionAt(0);
                  } else if (event.key === 'End') {
                    event.preventDefault();
                    focusOptionAt(enabledOptionIndices.length - 1);
                  }
                }}
                className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm ${
                  option.value === selectedValue ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-700 hover:bg-slate-50'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {option.label}
                {option.value === selectedValue && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
