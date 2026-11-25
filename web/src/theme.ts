import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Verde militar do SIGASE (mesma base da versão atual: #293e30 / #405c46).
const sigase: MantineColorsTuple = [
  '#eef3ed', '#dde7db', '#bacdb6', '#94b18e', '#75996d',
  '#618a58', '#55804c', '#456c3d', '#3a5f34', '#293e30',
];

const brass: MantineColorsTuple = [
  '#fbf6ea', '#f2e9d2', '#e4d1a3', '#d6b871', '#caa348',
  '#c3962f', '#bf9021', '#a97d15', '#966f0e', '#826000',
];

export const theme = createTheme({
  primaryColor: 'sigase',
  primaryShade: { light: 7, dark: 5 },
  colors: { sigase, brass },
  fontFamily: "'DM Sans', system-ui, sans-serif",
  headings: { fontFamily: "'Manrope', 'DM Sans', sans-serif", fontWeight: '800' },
  defaultRadius: 'md',
  cursorType: 'pointer',
  components: {
    Card: { defaultProps: { withBorder: true, radius: 'lg', padding: 'lg' } },
    Paper: { defaultProps: { radius: 'lg' } },
    Button: { defaultProps: { radius: 'md' } },
    Badge: { defaultProps: { radius: 'sm', variant: 'light' } },
    Modal: { defaultProps: { radius: 'lg', centered: true, overlayProps: { blur: 3, backgroundOpacity: 0.35 } } },
    Drawer: { defaultProps: { overlayProps: { blur: 2, backgroundOpacity: 0.3 } } },
  },
});
