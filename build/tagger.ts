import { writeFileSync } from 'fs';
import path from 'path';
import ora from 'ora';
import packageJson from 'package-json';
import { gt } from 'semver';
import { getWorkspaces } from './utils';


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
            bumpMap[name] = meta.version;
        } catch (e) {
            console.error(e);
        }
        spinner.text = `Loading workspaces (${++progress}/${folders.length})`;
    }));
    spinner.succeed();

    if (Object.keys(bumpMap).length) {
        for (const name in bumpMap) {
            console.log(`tagging ${name}@${bumpMap[name]} ...`);
            const pkg = require(path.resolve(`${name}/package.json`));
            pkg.version = '10'+ pkg.version;
            pkg.author = 'Tsukiyuki Miyako';
            pkg.repository = 'https://github.com/hstc-acm/HSOJ-hydro';
            writeFileSync(path.resolve(`${name}/package.json`), JSON.stringify(pkg));
        }
    }
    const spacepkg = require(`../package.json`);
    spacepkg.private = false;
    writeFileSync(path.resolve(`package.json`), JSON.stringify(spacepkg));
    console.log('Tagged successfully.');
})();