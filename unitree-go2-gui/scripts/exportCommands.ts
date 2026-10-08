import { writeFileSync } from 'node:fs';
import { COMMANDS } from '../src/lib/data/commands.ts';

/// The relay and the PyInstaller bundle read the command table from the repository root.
const TARGET = new URL('../../commands_1.1.7.json', import.meta.url);

writeFileSync(TARGET, JSON.stringify(COMMANDS, null, 4) + '\n');
