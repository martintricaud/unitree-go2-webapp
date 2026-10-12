import { writeFileSync } from 'node:fs';
import { COMMAND_TABLE } from './commandTable.ts';

/// The relay and the PyInstaller bundle read the command table from the repository root.
const TARGET = new URL('../../commands_1.1.7.json', import.meta.url);

writeFileSync(TARGET, JSON.stringify(COMMAND_TABLE, null, 4) + '\n');
