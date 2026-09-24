// ── Command records ────────────────────────────────────────────────────────
// Things the palette does rather than navigates to. Each record carries a
// command id; the palette hands that id to its onCommand prop, which App.jsx
// wires to the handlers it already owns.
//
// Command ids match the `val` of COMMAND_PATTERNS in vocabulary.js, so a query
// that parses to a command and a query that merely matches its label both land
// on the same record.

import { KIND_COMMAND, makeRecord, nameTokens } from './record.js';

const COMMANDS = [
  { id: 'theme.toggle', label: 'Toggle dark mode', aliases: ['theme', 'dark mode', 'light mode', 'appearance'] },
  { id: 'display', label: 'Display settings', aliases: ['text size', 'settings', 'font size', 'density'] },
  { id: 'whatsNew', label: "What's new", aliases: ['whats new', 'release notes', 'changelog', 'updates'] },
  { id: 'guide', label: 'Open guide', aliases: ['help', 'how to', 'tutorial', 'guide'] },
  { id: 'league.switch', label: 'Switch league', aliases: ['change league', 'another league'] },
  { id: 'league.connect', label: 'Connect a league', aliases: ['connect', 'link league', 'add league', 'sign in'] },
  { id: 'export', label: 'Export', aliases: ['share image', 'download', 'export image'] },
];

// Aliases for a command are distinct from its own theme handling: "dark mode"
// and "light mode" both parse to theme commands in vocabulary.js, and both
// resolve to the one toggle record here rather than two near-identical rows.
const PARSED_COMMAND_ALIASES = {
  'theme.dark': 'theme.toggle',
  'theme.light': 'theme.toggle',
};

export function resolveCommandId(parsedCommand) {
  return PARSED_COMMAND_ALIASES[parsedCommand] ?? parsedCommand;
}

export function buildCommandRecords() {
  return COMMANDS.map((command) => makeRecord({
    kind: KIND_COMMAND,
    id: command.id,
    label: command.label,
    sublabel: 'Command',
    tokens: [
      ...nameTokens(command.label),
      ...command.aliases.flatMap((alias) => nameTokens(alias)),
    ],
    command: command.id,
    weight: 0.1,
  }));
}
