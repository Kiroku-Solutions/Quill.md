import fs from 'node:fs';
import path from 'node:path';
import { FRAMEWORK_PRESETS } from '../src/lib/services/framework-presets.js'; // Can't import .ts easily without loader

// Wait, I can just use JSON.stringify if I read it carefully...
