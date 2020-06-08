/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const path = require('path');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const yaml = require('js-yaml');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    } else if (!fs.statSync(dir).isDirectory()) {
        fs.unlinkSync(dir);
        fs.mkdirSync(dir);
    }
}

let pending = [];
const active = [];
const fail = [];

if (global._hydroModule) {
    for (const filename in global._hydroModule) {
        const m = {
            ...yaml.safeLoad(zlib.gunzipSync(Buffer.from(global._hydroModule[filename], 'base64'))),
            filename,
            isBuiltin: true,
        };
        pending.push(m);
    }
}

async function unzip() {
    for (const i of pending) {
        try {
            if (i.file) {
                i.files = {};
                ensureDir(path.resolve(os.tmpdir(), 'hydro', i.id));
                for (const n in i.file) {
                    if (i.file[n] === null) {
                        ensureDir(path.resolve(os.tmpdir(), 'hydro', i.id, n));
                    } else {
                        const e = path.resolve(os.tmpdir(), 'hydro', i.id, n);
                        fs.writeFileSync(e, Buffer.from(i.file[n], 'base64'), { mode: 755 });
                        i.files[n] = e;
                    }
                }
            }
        } catch (e) {
            i.fail = true;
            fail.push(i.id);
            console.error(`Module Load Fail: ${i.id}`);
            console.error(e);
        }
    }
}

async function preload() {
    for (const i of pending) {
        try {
            if (i.os) {
                if (!i.os.includes(os.platform().toLowerCase())) throw new Error('Unsupported OS');
            }
        } catch (e) {
            i.fail = true;
            fail.push(i.id);
            console.error(`Module Load Fail: ${i.id}`);
            console.error(e);
        }
    }
}

async function handler() {
    for (const i of pending) {
        if (i.handler && !i.fail) {
            try {
                console.log(`Handler init: ${i.id}`);
                console.time(`Handler init: ${i.id}`);
                eval(i.handler);
                console.timeEnd(`Handler init: ${i.id}`);
            } catch (e) {
                i.fail = true;
                fail.push(i.id);
                console.error(`Handler Load Fail: ${i.id}`);
            }
        }
    }
}

async function locale() {
    for (const i of pending) {
        if (i.locale && !i.fail) {
            try {
                global.Hydro.lib.i18n(i.locale);
                console.log(`Locale init: ${i.id}`);
            } catch (e) {
                i.fail = true;
                fail.push(i.id);
                console.error(`Locale Load Fail: ${i.id}`);
            }
        }
    }
}

async function template() {
    for (const i of pending) {
        if (i.template && !i.fail) {
            try {
                Object.assign(global.Hydro.template, i.template);
                console.log(`Template init: ${i.id}`);
            } catch (e) {
                i.fail = true;
                fail.push(i.id);
                console.error(`Template Load Fail: ${i.id}`);
            }
        }
    }
}

async function model() {
    for (const i of pending) {
        if (i.model && !i.fail) {
            try {
                console.log(`Model init: ${i.id}`);
                console.time(`Model init: ${i.id}`);
                const m = eval(i.model);
                if ((m || {}).index) await m.index();
                console.timeEnd(`Model init: ${i.id}`);
            } catch (e) {
                i.fail = true;
                fail.push(i.id);
                console.error(`Model Load Fail: ${i.id}`);
            }
        }
    }
}

async function lib() {
    for (const i of pending) {
        if (i.lib && !i.fail) {
            try {
                console.log(`Lib init: ${i.id}`);
                console.time(`Lib init: ${i.id}`);
                eval(i.lib);
                console.timeEnd(`Lib init: ${i.id}`);
            } catch (e) {
                i.fail = true;
                fail.push(i.id);
                console.error(`Lib Load Fail: ${i.id}`);
            }
        }
    }
}

async function service() {
    for (const i of pending) {
        if (i.service && !i.fail) {
            try {
                console.time(`Service init: ${i.id}`);
                const m = eval(i.service);
                if ((m || {}).init) await m.init();
                console.timeEnd(`Service init: ${i.id}`);
            } catch (e) {
                i.fail = true;
                fail.push(i.id);
                console.error(`Service Load Fail: ${i.id}`);
                console.error(e);
            }
        }
    }
}

async function script() {
    for (const i of pending) {
        if (i.script && !i.fail) {
            try {
                console.time(`Script init: ${i.id}`);
                eval(i.script);
                console.timeEnd(`Script init: ${i.id}`);
            } catch (e) {
                i.fail = true;
                fail.push(i.id);
                console.error(`Script Load Fail: ${i.id}`);
                console.error(e);
            }
        }
        if (!i.fail) active.push(i.name);
    }
}

async function install() {
    const setup = require('./service/setup');
    await setup.setup();
}

const builtinLib = [
    'axios', 'download', 'i18n', 'mail', 'markdown',
    'md5', 'misc', 'paginate', 'hash.hydro', 'rank',
    'template', 'validator', 'nav', 'sysinfo',
];

const builtinModel = [
    'builtin', 'document', 'domain', 'blacklist', 'opcount',
    'setting', 'token', 'user', 'problem', 'record',
    'contest', 'message', 'solution', 'training', 'file',
    'discussion', 'system',
];

const builtinHandler = [
    'home', 'problem', 'record', 'judge', 'user',
    'contest', 'training', 'discussion', 'manage', 'import',
    'misc', 'homework', 'domain',
];

const builtinScript = [
    'install', 'uninstall', 'rating', 'recalcRating',
];

async function loadAsMaster() {
    ensureDir(path.resolve(os.tmpdir(), 'hydro'));
    pending.push(...await require('./lib/hpm').getInstalled());
    await unzip();
    await preload();
    require('./lib/i18n');
    require('./utils');
    require('./error');
    require('./permission');
    await Promise.all([locale(), template()]);
    try {
        require('./options');
    } catch (e) {
        await install();
        require('./options');
    }
    const bus = require('./service/bus');
    await new Promise((resolve) => {
        const h = () => {
            console.log('Database connected');
            bus.unsubscribe(['system_database_connected'], h);
            resolve();
        };
        bus.subscribe(['system_database_connected'], h);
        require('./service/db');
    });
    for (const i of builtinLib) require(`./lib/${i}`);
    await lib();
    require('./service/gridfs');
    require('./service/monitor');
    const server = require('./service/server');
    await server.prepare();
    await service();
    for (const i of builtinModel) {
        const m = require(`./model/${i}`);
        if (m.ensureIndexes) await m.ensureIndexes();
    }
    const system = require('./model/system');
    const dbVer = await system.get('db.ver');
    if (dbVer !== 1) {
        const ins = require('./script/install');
        await ins.run({ username: 'Root', password: 'rootroot' });
    }
    for (const i of builtinHandler) require(`./handler/${i}`);
    await model();
    await handler();
    for (const i in global.Hydro.handler) {
        await global.Hydro.handler[i]();
    }
    const notfound = require('./handler/notfound');
    await notfound();
    for (const i in global.Hydro.service) {
        if (global.Hydro.service[i].postInit) {
            try {
                await global.Hydro.service[i].postInit();
            } catch (e) {
                console.error(e);
            }
        }
    }
    for (const i of builtinScript) require(`./script/${i}`);
    await script();
    pending = [];
    await server.start(await system.get('server.port'));
}

async function loadAsWorker() {
    pending.push(...await require('./lib/hpm').getInstalled());
    await preload();
    require('./lib/i18n');
    require('./utils');
    require('./error');
    require('./permission');
    require('./options');
    await Promise.all([locale(), template()]);
    const bus = require('./service/bus');
    await new Promise((resolve) => {
        const h = () => {
            console.log('Database connected');
            bus.unsubscribe(['system_database_connected'], h);
            resolve();
        };
        bus.subscribe(['system_database_connected'], h);
        require('./service/db');
    });
    for (const i of builtinLib) require(`./lib/${i}`);
    await lib();
    require('./service/gridfs');
    const server = require('./service/server');
    await server.prepare();
    await service();
    for (const i of builtinModel) require(`./model/${i}`);
    for (const i of builtinHandler) require(`./handler/${i}`);
    await model();
    await handler();
    for (const i in global.Hydro.handler) {
        await global.Hydro.handler[i]();
    }
    const notfound = require('./handler/notfound');
    await notfound();
    for (const i in global.Hydro.service) {
        if (global.Hydro.service[i].postInit) {
            try {
                await global.Hydro.service[i].postInit();
            } catch (e) {
                console.error(e);
            }
        }
    }
    for (const i of builtinScript) require(`./script/${i}`);
    await script();
    pending = [];
    await server.start();
}

async function terminate() {
    for (const task of global.onDestory) {
        // eslint-disable-next-line no-await-in-loop
        await task();
    }
    process.exit(0);
}

async function load() {
    global.Hydro = {
        handler: {},
        service: {},
        model: {},
        script: {},
        lib: {},
        nodeModules: {
            bson: require('bson'),
            'js-yaml': require('js-yaml'),
            mongodb: require('mongodb'),
        },
        template: {},
        ui: {},
    };
    global.onDestory = [];
    if (cluster.isMaster) {
        console.log(`Master ${process.pid} Starting`);
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', async (input) => {
            try {
                const t = eval(input.toString().trim()); // eslint-disable-line no-eval
                if (t instanceof Promise) console.log(await t);
                else console.log(t);
            } catch (e) {
                console.warn(e);
            }
        });
        process.on('unhandledRejection', (e) => console.log(e));
        process.on('SIGINT', terminate);
        await loadAsMaster();
        cluster.on('exit', (worker, code, signal) => {
            console.log(`Worker ${worker.process.pid} exit: ${code} ${signal}`);
        });
        cluster.on('disconnect', (worker) => {
            console.log(`Worker ${worker.process.pid} disconnected`);
        });
        cluster.on('listening', (worker, address) => {
            console.log(`Worker ${worker.process.pid} listening at `, address);
        });
        cluster.on('online', (worker) => {
            console.log(`Worker ${worker.process.pid} is online`);
        });
        for (let i = 0; i < numCPUs; i++) {
            cluster.fork();
        }
    } else {
        console.log(`Worker ${process.pid} Starting`);
        await loadAsWorker();
        console.log(`Worker ${process.pid} Started`);
    }
}

module.exports = {
    load, pending, active, fail,
};

if (!module.parent) {
    load().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
