const { ObjectID } = require('bson');
const { ProblemNotFoundError } = require('../error');
const validator = require('../lib/validator');
const db = require('../service/db.js');

const coll = db.collection('problem');
const collStatus = db.collection('problem.status');

/**
 * @typedef {import('../interface').Pdoc} Pdoc
 * @typedef {import('bson').ObjectID} ObjectID
 * @typedef {import('mongodb').Cursor} Cursor
 */

/**
 * @param {string} title
 * @param {string} content
 * @param {number} owner
 * @param {number} pid
 * @param {import('bson').ObjectID} data
 * @param {string[]} category
 * @param {string[]} tag
 * @param {boolean} hidden
 */
async function add({
    title,
    content,
    owner,
    pid = null,
    data = null,
    category = [],
    tag = [],
    hidden = false,
}) {
    validator.checkTitle(title);
    validator.checkContent(content);
    await coll.insertOne({
        content,
        owner,
        pid,
        title,
        data,
        category,
        tag,
        hidden,
        nSubmit: 0,
        nAccept: 0,
    });
    return pid;
}
/**
 * @param {string|ObjectID} pid
 * @param {number} uid
 * @returns {Pdoc}
 */
async function get(pid, uid = null) {
    let query = {};
    if (pid.generationTime || pid.length === 24) query = { _id: new ObjectID(pid) };
    else query = { pid: parseInt(pid) || pid };
    const pdoc = await coll.findOne(query);
    if (!pdoc) throw new ProblemNotFoundError(pid);
    if (uid) {
        query.uid = uid;
        pdoc.psdoc = await collStatus.findOne(query);
    }
    return pdoc;
}
/**
 * @param {ObjectID} pid
 * @returns {Pdoc}
 */
async function getById(_id) {
    _id = new ObjectID(_id);
    const pdoc = await coll.findOne({ _id });
    if (!pdoc) throw new ProblemNotFoundError(_id);
    return pdoc;
}
/**
 * @param {string|ObjectID} pid
 * @param {number} uid
 * @returns {Pdoc[]}
 */
function getMany(query, sort, page, limit) {
    return coll.find(query).sort(sort).skip((page - 1) * limit).limit(limit)
        .toArray();
}
/**
 * @param {object} query
 * @returns {Cursor}
 */
function getMulti(query) {
    return coll.find(query);
}
/**
 * @param {ObjectID} _id
 * @param {object} query
 * @returns {Pdoc}
 */
async function edit(_id, $set) {
    if ($set.title) validator.checkTitle($set.title);
    if ($set.content) validator.checkContent($set.content);
    await coll.findOneAndUpdate({ _id }, { $set });
    const pdoc = await getById(_id);
    if (!pdoc) throw new ProblemNotFoundError(_id);
    return pdoc;
}
function count(query) {
    return coll.find(query).count();
}
async function random(query) {
    const pdocs = coll.find(query);
    const pcount = await pdocs.count();
    if (pcount) {
        const pdoc = await pdocs.skip(Math.floor(Math.random() * pcount)).limit(1).toArray()[0];
        return pdoc.pid;
    } return null;
}
async function getList(pids) {
    const r = {};
    for (const pid of pids) r[pid] = await get(pid); // eslint-disable-line no-await-in-loop
    return r;
}

module.exports = {
    add,
    get,
    getMany,
    edit,
    count,
    random,
    getById,
    getMulti,
    getList,
};
