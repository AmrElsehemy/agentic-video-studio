// Imported for its effect: puts the keys from .secrets/*.env into process.env (see secrets.mjs).
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadSecrets} from './secrets.mjs';

loadSecrets({root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')});
