import { register } from 'tsx/esm/api';
import { fileURLToPath } from 'node:url';
register({ tsconfig: fileURLToPath(new URL('../tsconfig.framework.json', import.meta.url)) });
