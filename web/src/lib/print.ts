/**
 * Impressão de documentos A4.
 *
 * O HTML e o CSS dos documentos são os mesmos da versão atual (copiados de app.js), para a folha
 * impressa sair idêntica. Eles são renderizados num iframe isolado, sem interferência do tema da tela.
 */

export const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface Paper {
  /** HTML do documento (o mesmo da impressão). */
  body: string;
  /** CSS de impressão (o mesmo da versão atual). */
  css: string;
  /** CSS extra só para a prévia na tela (folha branca com sombra etc.). */
  previewCss?: string;
  /** HTML alternativo para a prévia (quando a versão atual usa um invólucro diferente na tela). */
  previewBody?: string;
}

const PREVIEW_BASE = 'html{background:#e9ece7}body{margin:0;padding:18px}';

/** Documento HTML completo usado na prévia e na impressão. */
export function paperDocument(paper: Paper, preview = false) {
  const css = preview ? `${paper.css}${PREVIEW_BASE}${paper.previewCss ?? ''}` : paper.css;
  const body = preview ? (paper.previewBody ?? paper.body) : paper.body;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><base href="${location.origin}/"><title>SIGASE</title><style>${css}</style></head><body>${body}</body></html>`;
}

/** Abre a janela de impressão do navegador (o usuário pode salvar como PDF). */
export function printPaper(paper: Paper) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', opacity: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(paperDocument(paper));
  doc.close();
  const run = () => {
    const win = frame.contentWindow!;
    win.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 500), { once: true });
    win.focus();
    win.print();
    setTimeout(() => frame.isConnected && frame.remove(), 120_000);
  };
  // Espera as imagens (brasão etc.) carregarem antes de imprimir.
  const pending = Array.from(doc.images).filter((img) => !img.complete);
  Promise.all(pending.map((img) => new Promise((resolve) => { img.addEventListener('load', resolve, { once: true }); img.addEventListener('error', resolve, { once: true }); }))).then(() => setTimeout(run, 60));
}
