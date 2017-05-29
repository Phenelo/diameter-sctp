'use strict';

const _ = require('lodash');
const fs = require('fs');
const path = require('path');


const dictionaryLocation = path.normalize(__dirname + '/../dictionary.json');
const dictionary = JSON.parse(fs.readFileSync(dictionaryLocation, 'utf8'));

const cache = {
    avpsByName: {},
    avpsByCode: [],
    commandsByName: {},
    commandsByCode: [],
    applicationsByName: {},
    applicationsById: [],
    avpsByCodeAndVendorId: []
}

exports.getApplicationById = function(appId) {
    const cached = cache.applicationsById[appId];
    if (cached !== undefined) return cached;
    const app = _.find(dictionary.applications, {code: appId});
    cache.applicationsById[appId] = app;
    return app;
};

exports.getApplicationByName = function(name) {
    const cached = cache.applicationsByName[name];
    if (cached !== undefined) return cached;
    const app = _.find(dictionary.applications, {name: name});
    cache.applicationsByName[name] = app;
    return app;
};

exports.getCommandByCode = function(code) {
    const cached = cache.commandsByCode[code];
    if (cached !== undefined) return cached;
    const command = _.find(dictionary.commands, {code: code});
    cache.commandsByCode[code] = command;
    return command;
};

exports.getCommandByName = function(name) {
    const cached = cache.commandsByName[name];
    if (cached !== undefined) return cached;
    const command = _.find(dictionary.commands, {name: name});
    cache.commandsByName[name] = command;
    return command;
};

exports.getAvpByCode = function(code) {
    const cached = cache.avpsByCode[code];
    if (cached !== undefined) return cached;
    const avp = _.find(dictionary.avps, {code: code});
    cache.avpsByCode[code] = avp;
    return avp;
};

exports.getAvpByCodeAndVendorId = function(code, vendorId) {
    if (cache.avpsByCodeAndVendorId[vendorId] === undefined) cache.avpsByCodeAndVendorId[vendorId] = [];
    const vendorAvps = cache.avpsByCodeAndVendorId[vendorId];
    let avp = vendorAvps[code];
    if (avp !== undefined) return avp;
    avp = _.find(dictionary.avps, {code: code, vendorId: vendorId});
    vendorAvps[code] = avp;
    return avp;
};

exports.getAvpByName = function(name) {
    const cached = cache.avpsByName[name];
    if (cached !== undefined) return cached;
    const avp = _.find(dictionary.avps, {name: name});
    cache.avpsByName[name] = avp;
    return avp;
};
