/* eslint-disable no-await-in-loop */
/* eslint-disable import/no-dynamic-require */
import { writeFileSync } from 'fs';
import path from 'path';
import ora from 'ora';
import packageJson from 'package-json';
import { gt } from 'semver';
import { getWorkspaces, spawnAsync } from './utils';

const tag = 'yuuka';

(async () => {
    let folders = await getWorkspaces();
    if (process.argv[2]) {
        folders = folders.filter((p) => p.startsWith(process.argv[2]));
    }

    const spinner = ora();
    const bumpMap = {};

    let progress = 0;
    spinner.start(`Loading workspaces (0/${folders.length})`);
    await Promise.all(folders.map(async (name) => {
        let meta;
        try {
            meta = require(`../${name}/package.json`);
            if (!meta.private && /^[0-9.]+$/.test(meta.version)) {
                try {
                    const { version } = await packageJson(meta.name, { version: tag });
                    if (typeof version === 'string' && gt(meta.version, version)) bumpMap[name] = meta.version;
                } catch (e) {
                    if (e.name === 'VersionNotFoundError') bumpMap[name] = meta.version;
                    else throw e;
                }
            }
        } catch (e) {
            console.error(e);
        }
        spinner.text = `Loading workspaces (${++progress}/${folders.length})`;
    }));
    spinner.succeed();

    if (Object.keys(bumpMap).length) {
        for (const name in bumpMap) {
            console.log(`publishing ${name}@${bumpMap[name]} ...`);
            if (tag === 'yuuka') {
                const pkg = require(`${name}/package.json`);
                pkg.version += '-yuuka';
                writeFileSync(path.resolve(`${name}/package.json`), JSON.stringify(pkg));
            }
            await spawnAsync(
                `yarn npm publish --access public --tag ${tag}`,
                path.resolve(name),
            );
        }
    }
    console.log('Release created successfully.');
})();
