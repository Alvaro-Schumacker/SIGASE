import { ActionIcon, Autocomplete, Popover, ScrollArea, Select, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import dayjs from 'dayjs';
import { type CSSProperties, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { toggleRange } from './bold';
import { longDate } from '../../print/legacy';
import './paper.css';

interface FieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  bold?: boolean;
  /** Largura em "ch" para campos curtos no meio do texto (ex.: número do boletim). */
  inlineWidth?: number;
  style?: CSSProperties;
  maxLength?: number;
}

const cls = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

/** Campo de uma linha que parece texto da folha. */
export function InlineInput({ value, onChange, placeholder, invalid, bold, inlineWidth, style, maxLength }: FieldProps) {
  return (
    <input
      className={cls('doc-field', bold && 'doc-field-bold', !!inlineWidth && 'doc-field-inline')}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      data-invalid={invalid || undefined}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.currentTarget.value)}
      style={{ ...(inlineWidth ? { width: `${Math.max(inlineWidth, (value || placeholder || '').length + 1)}ch` } : {}), ...style }}
    />
  );
}

/** Texto de várias linhas que cresce conforme o conteúdo. */
export function InlineTextarea({ value, onChange, placeholder, invalid, bold, style, maxLength }: FieldProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={cls('doc-field', bold && 'doc-field-bold')}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      data-invalid={invalid || undefined}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.currentTarget.value)}
      style={style}
    />
  );
}

/** Texto livre com sugestões (ex.: serviços do aditamento). */
export function InlineSuggest({ value, onChange, placeholder, invalid, bold, data, autoWidth }: FieldProps & { data: string[]; autoWidth?: boolean }) {
  return (
    <Autocomplete
      // Com autoWidth o campo cresce junto com o texto (como numa linha de texto corrido).
      style={autoWidth ? { width: `${Math.max(9, (value || placeholder || '').length + 2)}ch`, maxWidth: '75%', flex: '0 0 auto' } : undefined}
      variant="unstyled"
      data={data}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      limit={30}
      comboboxProps={{ withinPortal: true, zIndex: 400 }}
      classNames={{ input: cls('doc-field', bold && 'doc-field-bold') }}
      styles={{ input: { height: 'auto', minHeight: 0, lineHeight: 'inherit', fontSize: 'inherit', fontFamily: 'inherit', padding: '0 2px' } }}
      error={invalid}
    />
  );
}

/** Data exibida por extenso, como na impressão; clique para escolher no calendário. */
export function InlineDate({ value, onChange, invalid, weekday = true, upper = false, placeholder = 'escolher data', format }: { value: string | null; onChange: (v: string) => void; invalid?: boolean; weekday?: boolean; upper?: boolean; placeholder?: string; format?: (iso: string) => string }) {
  const [open, setOpen] = useState(false);
  const text = value ? (format ? format(value) : longDate(value, weekday)) : placeholder;
  return (
    <Popover opened={open} onChange={setOpen} position="bottom" withArrow shadow="md" zIndex={400}>
      <Popover.Target>
        <span
          role="button"
          tabIndex={0}
          className="doc-date"
          data-invalid={invalid || undefined}
          aria-invalid={invalid || undefined}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen(true)}
          style={value ? undefined : { color: '#b3b9b2', fontStyle: 'italic', fontWeight: 'normal' }}
        >
          {upper && value ? text.toUpperCase() : text}
        </span>
      </Popover.Target>
      <Popover.Dropdown>
        <DatePicker
          value={value}
          onChange={(d) => {
            if (d) onChange(dayjs(d).format('YYYY-MM-DD'));
            setOpen(false);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

/** Lista de opções que parece texto (ex.: comportamento, TAF, subunidade). */
export function InlineSelect({ value, onChange, data, invalid, placeholder = 'escolher' }: { value: string; onChange: (v: string) => void; data: (string | { value: string; label: string })[]; invalid?: boolean; placeholder?: string }) {
  const labelOf = (v: string) => {
    const item = data.find((d) => (typeof d === 'string' ? d : d.value) === v);
    return item ? (typeof item === 'string' ? item : item.label) : v;
  };
  const shown = value ? labelOf(value) : placeholder;
  return (
    <Select
      variant="unstyled"
      data={data}
      value={value || null}
      onChange={(v) => onChange(v ?? '')}
      allowDeselect={false}
      placeholder={placeholder}
      comboboxProps={{ withinPortal: true, zIndex: 400, width: 'max-content' }}
      rightSection={<span />}
      rightSectionWidth={0}
      error={invalid}
      style={{ display: 'inline-block', width: `${shown.length <= 10 ? shown.length + 2 : shown.length * 0.82 + 2.5}ch`, verticalAlign: 'baseline' }}
      classNames={{ input: 'doc-field' }}
      styles={{ input: { height: 'auto', minHeight: 0, lineHeight: 'inherit', fontSize: 'inherit', fontFamily: 'inherit', fontWeight: 'inherit', padding: '0 2px', cursor: 'pointer' } }}
    />
  );
}

/** Nome de militar clicável: abre a busca no efetivo. O conteúdo exibido (com negrito do nome de guerra) vem pronto em HTML. */
export function InlinePerson({
  html,
  onPick,
  options,
  invalid,
  placeholder = 'clique para escolher o militar',
  bold,
}: {
  html: string;
  onPick: (id: string) => void;
  options: { value: string; label: string }[];
  invalid?: boolean;
  placeholder?: string;
  /** Permite marcar o negrito selecionando parte do nome e apertando Ctrl+B. */
  bold?: { full: string; war: string; onChange: (war: string) => void };
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const clickTimer = useRef<number>(undefined);

  // Ctrl+B com parte do nome selecionada: alterna o negrito dessas palavras.
  useEffect(() => {
    if (!bold) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'b') return;
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || !sel.toString().trim()) return;
      const node = sel.anchorNode;
      const el = node instanceof Element ? node : node?.parentElement;
      const host = el?.closest<HTMLElement>(`[data-bold-id="${CSS.escape(id)}"]`);
      if (!host) return;
      e.preventDefault();
      // Posição da seleção dentro do nome (para distinguir "só a inicial" de "palavra inteira").
      const range = sel.getRangeAt(0);
      const before = document.createRange();
      before.selectNodeContents(host);
      before.setEnd(range.startContainer, range.startOffset);
      const from = before.toString().length;
      const to = from + range.toString().length;
      bold.onChange(toggleRange(bold.full, bold.war, from, to));
      sel.removeAllRanges();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [bold, id]);

  return (
    <Popover opened={open} onChange={setOpen} position="bottom-start" withArrow shadow="md" zIndex={400} width={380} trapFocus>
      <Popover.Target>
        <span
          role="button"
          tabIndex={0}
          className="doc-date"
          data-bold-id={bold ? id : undefined}
          data-invalid={invalid || undefined}
          aria-invalid={invalid || undefined}
          title={bold ? 'Clique para trocar o militar · selecione parte do nome e aperte Ctrl+B para o negrito' : 'Clique para trocar o militar'}
          // Duplo clique ou arrastar seleciona o texto (para o Ctrl+B); só um clique simples abre a busca.
          onClick={(e) => {
            window.clearTimeout(clickTimer.current);
            if (e.detail > 1) return setOpen(false);
            clickTimer.current = window.setTimeout(() => {
              if (!window.getSelection()?.toString().trim()) setOpen((o) => !o);
            }, bold ? 240 : 0);
          }}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen(true)}
          {...(html ? { dangerouslySetInnerHTML: { __html: html } } : {})}
          style={html ? undefined : { color: '#b3b9b2', fontStyle: 'italic', fontWeight: 'normal' }}
        >
          {html ? undefined : placeholder}
        </span>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <PersonSearch
          options={options}
          onPick={(v) => {
            onPick(v);
            setOpen(false);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

/** Busca no efetivo: digite e clique (ou Enter no primeiro resultado). */
function PersonSearch({ options, onPick }: { options: { value: string; label: string }[]; onPick: (id: string) => void }) {
  const [term, setTerm] = useState('');
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
  const list = options.filter((o) => fold(o.label).includes(fold(term))).slice(0, 50);
  return (
    <>
      <TextInput
        data-autofocus
        size="sm"
        placeholder="Buscar no efetivo (nome, guerra ou posto)"
        value={term}
        onChange={(e) => setTerm(e.currentTarget.value)}
        onKeyDown={(e) => e.key === 'Enter' && list[0] && onPick(list[0].value)}
        mb={6}
      />
      <ScrollArea.Autosize mah={260} type="auto">
        {list.map((o) => (
          <UnstyledButton key={o.value} className="person-option" onClick={() => onPick(o.value)}>
            {o.label}
          </UnstyledButton>
        ))}
        {!list.length && <div className="doc-ghost" style={{ padding: 8 }}>Ninguém encontrado.</div>}
      </ScrollArea.Autosize>
    </>
  );
}

/** Botão pequeno das ferramentas de linha (aparece ao passar o mouse). */
export function RowTool({ label, onClick, children, color = 'gray', disabled }: { label: string; onClick: () => void; children: ReactNode; color?: string; disabled?: boolean }) {
  return (
    <Tooltip label={label} withArrow zIndex={400}>
      <ActionIcon size="sm" variant="light" color={color} onClick={onClick} disabled={disabled} aria-label={label}>
        {children}
      </ActionIcon>
    </Tooltip>
  );
}

/** Conta nomes separados por vírgula, ponto e vírgula, quebra de linha ou " e ". */
export const countNames = (text: string) =>
  String(text || '')
    .split(/[,;\n]+|\s+e\s+/)
    .map((x) => x.trim())
    .filter(Boolean).length;
