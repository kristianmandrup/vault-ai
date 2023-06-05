import * as path from 'path';

function WebAbs(relpath: string): string {
  try {
    const abspath = path.resolve('./static', relpath);
    return abspath;
  } catch (err) {
    throw new Error(`Error converting to absolute path ${relpath}`);
  }
}
