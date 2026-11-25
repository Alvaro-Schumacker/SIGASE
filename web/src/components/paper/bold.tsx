import { Group, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';

/*
 * Negrito do nome de guerra.
 *
 * O documento guarda o trecho em negrito no próprio "nome de guerra" do retrato salvo (profile.war_name,
 * militaryWarName…). A impressão (print/legacy.ts → reqRichName) interpreta esse texto assim:
 *   - trecho contínuo do nome ("Silva Fonseca") → negrito nesse trecho;
 *   - senão, cada termo na ordem: palavra inteira ("Fonseca") ou só a inicial quando abreviado ("M.").
 * Aqui fazemos o caminho inverso: estado de cada palavra ↔ texto do nome de guerra.
 */

export type WordState = 'none' | 'full' | 'initial';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
export const nameWords = (full: string) => String(full || '').trim().split(/\s+/).filter(Boolean);

/** Estado de negrito de cada palavra do nome completo (mesma regra da impressão). */
export function wordStates(full: string, war: string): WordState[] {
  const words = nameWords(full);
  const states: WordState[] = words.map(() => 'none');
  const w = fold(String(war || '').trim());
  if (!w || !words.length) return states;

  // 1) Trecho contínuo.
  const joined = words.map(fold).join(' ');
  const at = joined.indexOf(w);
  if (at >= 0) {
    let pos = 0;
    words.forEach((word, i) => {
      const end = pos + word.length;
      if (end > at && pos < at + w.length) states[i] = 'full';
      pos = end + 1;
    });
    return states;
  }

  // 2) Termos na ordem: palavra inteira ou inicial ("M.").
  let cur = 0;
  for (const t of String(war).trim().split(/\s+/)) {
    const ft = fold(t.replace(/\.+$/, ''));
    if (!ft) continue;
    const initial = /\.$/.test(t) || ft.length === 1;
    const ok = (k: number) => states[k] === 'none' && (initial ? fold(words[k]).startsWith(ft) : fold(words[k]) === ft);
    let hit = -1;
    for (let k = cur; k < words.length && hit < 0; k++) if (ok(k)) hit = k;
    for (let k = 0; k < words.length && hit < 0; k++) if (ok(k)) hit = k;
    if (hit < 0) continue;
    states[hit] = initial ? 'initial' : 'full';
    cur = hit + 1;
  }
  return states;
}

/** Monta o texto do nome de guerra a partir do estado das palavras ("M. Fonseca"). */
export function warFromStates(full: string, states: WordState[]) {
  return nameWords(full)
    .map((word, i) => (states[i] === 'full' ? word : states[i] === 'initial' ? `${word.charAt(0).toLocaleUpperCase('pt-BR')}.` : ''))
    .filter(Boolean)
    .join(' ');
}

/**
 * Ctrl+B sobre uma seleção (posições de caractere dentro do nome completo).
 * Selecionar só o começo de uma palavra (ex.: a letra "M") alterna a inicial; selecionar a palavra alterna ela inteira.
 */
export function toggleRange(full: string, war: string, from: number, to: number) {
  const states = wordStates(full, war);
  const spans: [number, number][] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(full).trim()))) spans.push([m.index, m.index + m[0].length]);
  const hit = spans.map(([s, e], i) => (e > from && s < to ? i : -1)).filter((i) => i >= 0);
  if (!hit.length) return war;

  if (hit.length === 1) {
    const i = hit[0];
    const [s, e] = spans[i];
    const partial = from <= s && to < e; // começa no início da palavra e não vai até o fim
    const target: WordState = partial ? 'initial' : 'full';
    states[i] = states[i] === target ? 'none' : target;
    return warFromStates(full, states);
  }
  const allFull = hit.every((i) => states[i] === 'full');
  hit.forEach((i) => (states[i] = allFull ? 'none' : 'full'));
  return warFromStates(full, states);
}

const NEXT: Record<WordState, WordState> = { none: 'full', full: 'initial', initial: 'none' };
const HINT: Record<WordState, string> = { none: 'sem negrito', full: 'palavra em negrito', initial: 'só a inicial em negrito' };

/** Alternativa clicável ao Ctrl+B: cada clique alterna sem negrito → palavra inteira → só a inicial. */
export function BoldWordsPicker({ label, full, war, onChange }: { label: string; full: string; war: string; onChange: (war: string) => void }) {
  const words = nameWords(full);
  if (!words.length) return null;
  const states = wordStates(full, war);
  return (
    <Stack gap={4}>
      <Text size="xs" fw={600}>
        {label}
      </Text>
      <Group gap={4}>
        {words.map((w, i) => (
          <Tooltip key={i} label={`${HINT[states[i]]} · clique para mudar`} withArrow zIndex={400} openDelay={300}>
            <UnstyledButton
              onClick={() => onChange(warFromStates(full, states.map((s, j) => (j === i ? NEXT[s] : s))))}
              style={{
                padding: '2px 9px',
                borderRadius: 999,
                fontSize: 12,
                fontFamily: "'Times New Roman', serif",
                border: `1px solid ${states[i] === 'none' ? 'var(--mantine-color-default-border)' : 'var(--mantine-color-sigase-5)'}`,
                background: states[i] === 'none' ? undefined : 'var(--mantine-color-sigase-light)',
                transition: 'background 120ms, border-color 120ms',
              }}
            >
              {states[i] === 'initial' ? (
                <>
                  <b>{w.charAt(0)}</b>
                  {w.slice(1)}
                </>
              ) : states[i] === 'full' ? (
                <b>{w}</b>
              ) : (
                w
              )}
            </UnstyledButton>
          </Tooltip>
        ))}
      </Group>
    </Stack>
  );
}
