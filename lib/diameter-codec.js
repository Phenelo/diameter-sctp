'use strict';

const _ = require('lodash');
const diameterTypes = require('./diameter-types');
const diameterUtil = require('./diameter-util');
const dictionary = require('./diameter-dictionary');

const DIAMETER_MESSAGE_HEADER_LENGTH_IN_BYTES = 20;
const DIAMETER_MESSAGE_AVP_HEADER_LENGTH_IN_BYTES = 8;
const DIAMETER_MESSAGE_VENDOR_ID_LENGTH_IN_BYTES = 4;

// Byte positions for header fields
const DIAMETER_MESSAGE_HEADER_VERSION = 0;
const DIAMETER_MESSAGE_HEADER_LENGTH = 1;
const DIAMETER_MESSAGE_HEADER_COMMAND_CODE = 5;
const DIAMETER_MESSAGE_HEADER_FLAGS = 4;
const DIAMETER_MESSAGE_HEADER_FLAG_REQUEST = 0;
const DIAMETER_MESSAGE_HEADER_FLAG_PROXIABLE = 1;
const DIAMETER_MESSAGE_HEADER_FLAG_ERROR = 2;
const DIAMETER_MESSAGE_HEADER_FLAG_POTENTIALLY_RETRANSMITTED = 3;
const DIAMETER_MESSAGE_HEADER_APPLICATION_ID = 8;
const DIAMETER_MESSAGE_HEADER_HOP_BY_HOP_ID = 12;
const DIAMETER_MESSAGE_HEADER_END_TO_END_ID = 16;

// Byte postions for AVP fields
const DIAMETER_MESSAGE_AVP_CODE = 0;
const DIAMETER_MESSAGE_AVP_FLAGS = 4;
const DIAMETER_MESSAGE_AVP_FLAG_VENDOR = 0;
const DIAMETER_MESSAGE_AVP_FLAG_MANDATORY = 1;
const DIAMETER_MESSAGE_AVP_LENGTH = 5;
const DIAMETER_MESSAGE_AVP_VENDOR_ID = 8;
const DIAMETER_MESSAGE_AVP_VENDOR_ID_DATA = 12;
const DIAMETER_MESSAGE_AVP_NO_VENDOR_ID_DATA = 8;


const readUInt24BE = function(buffer, offset) {
    return buffer.readUInt8(offset) * 256 * 256 + buffer.readUInt8(offset + 1) * 256 + buffer.readUInt8(offset + 2);
};

// wow, this is terrible.. must change
const writeUInt24BE = function(buffer, offset, value) {
    let i = Math.floor(value / (256 * 256));
    buffer.writeUInt8(i, offset);
    value = value % (256 * 256);
    i = Math.floor(value / (256));
    buffer.writeUInt8(Math.floor(value / 256), offset + 1);
    value = value % 256;
    buffer.writeUInt8(value, offset + 2);
};

const getBit = function(num, bit) {
    return ((num >> (7 - bit)) % 2 !== 0);
};

// another beauty..
const getIntFromBits = function(array) {
    let s = '';
    _.each(array, function(bit) {
        s += bit ? '1' : '0';
    });
    return parseInt(s, 2);
};

exports.decodeMessageHeader = function(buffer) {
    const message = {
        _timeReceived: _.now(),
        header: {},
        body: []
    };
    message.header.version = buffer.readUInt8(DIAMETER_MESSAGE_HEADER_VERSION);
    message.header.length = readUInt24BE(buffer, DIAMETER_MESSAGE_HEADER_LENGTH);
    message.header.commandCode = readUInt24BE(buffer, DIAMETER_MESSAGE_HEADER_COMMAND_CODE);
    const flags = buffer.readUInt8(DIAMETER_MESSAGE_HEADER_FLAGS);
    message.header.flags = {
        request: getBit(flags, DIAMETER_MESSAGE_HEADER_FLAG_REQUEST),
        proxiable: getBit(flags, DIAMETER_MESSAGE_HEADER_FLAG_PROXIABLE),
        error: getBit(flags, DIAMETER_MESSAGE_HEADER_FLAG_ERROR),
        potentiallyRetransmitted: getBit(flags, DIAMETER_MESSAGE_HEADER_FLAG_POTENTIALLY_RETRANSMITTED)
    };
    message.header.applicationId = buffer.readUInt32BE(DIAMETER_MESSAGE_HEADER_APPLICATION_ID);
    message.header.hopByHopId = buffer.readUInt32BE(DIAMETER_MESSAGE_HEADER_HOP_BY_HOP_ID);
    message.header.endToEndId = buffer.readUInt32BE(DIAMETER_MESSAGE_HEADER_END_TO_END_ID);
    return message;
};

const inflateMessageHeader = function(message) {
    const command = dictionary.getCommandByCode(message.header.commandCode);
    if (command == null) {
        throw new Error('Can\'t find command with code ' + message.header.commandCode);
    }
    message.command = command.name;
    const application = dictionary.getApplicationById(message.header.applicationId);
    if (application == null) {
        throw new Error('Can\'t find application with ID ' + message.header.applicationId);
    }
    message.header.application = application.name;
};

const findApplication = function(applicationName) {
    let application;
    if (!_.isNumber(applicationName)) {
        application = dictionary.getApplicationByName(applicationName);
    } else {
        application = dictionary.getApplicationById(applicationName);
    }
    return application;
};

const findCommand = function(commandName) {
    let command;
    if (!_.isNumber(commandName)) {
        command = dictionary.getCommandByName(commandName);
    } else {
        command = dictionary.getCommandByCode(commandName);
    }
    return command;
};

exports.constructRequest = function(applicationName, commandName, proxiable, sessionId) {
    const application = findApplication(applicationName);
    if (application == undefined) {
        throw new Error('Application ' + applicationName + ' not found in dictionary. ');
    }
    const command = findCommand(commandName);
    if (command === undefined) {
        throw new Error('Command ' + commandName + ' not found in dictionary. ');
    }

    const request = {
        header: {
            version: 1,
            commandCode: _.parseInt(command.code),
            flags: {
                request: true,
                proxiable: proxiable,
                error: false,
                potentiallyRetransmitted: false
            },
            applicationId: _.parseInt(application.code),
            application: application.name,
            hopByHopId: -1, // needs to be set by client
            endToEndId: diameterUtil.random32BitNumber()
        },
        body: [],
        command: command.name
    };

    request.body.push(['Session-Id', sessionId.toString()]);

    return request;
};

exports.constructResponse = function(message) {
    const response = {
        header: {
            version: message.header.version,
            commandCode: message.header.commandCode,
            flags: {
                request: false,
                proxiable: message.header.flags.proxiable,
                error: false,
                potentiallyRetransmitted: message.header.flags.potentiallyRetransmitted
            },
            applicationId: message.header.applicationId,
            application: message.header.application,
            hopByHopId: message.header.hopByHopId,
            endToEndId: message.header.endToEndId
        },
        body: [],
        command: message.command
    };

    const sessionId = _.find(message.body, function(avp) {
        return avp[0] === 'Session-Id';
    });
    if (sessionId) {
        response.body.push(['Session-Id', sessionId[1]]);
    }
    return response;
};

const decodeAvpHeader = function(buffer, start) {
    const avp = {};
    avp.codeInt = buffer.readUInt32BE(start + DIAMETER_MESSAGE_AVP_CODE);
    const flags = buffer.readUInt8(start + DIAMETER_MESSAGE_AVP_FLAGS);
    avp.flags = {
        vendor: getBit(flags, DIAMETER_MESSAGE_AVP_FLAG_VENDOR),
        mandatory: getBit(flags, DIAMETER_MESSAGE_AVP_FLAG_MANDATORY)
    };
    avp.length = readUInt24BE(buffer, start + DIAMETER_MESSAGE_AVP_LENGTH);

    return avp;
};

const decodeAvp = function(buffer, start, appId) {
    const avp = decodeAvpHeader(buffer, start);

    const hasVendorId = avp.flags.vendor;
    if (hasVendorId) {
        avp.vendorId = buffer.readUInt32BE(start + DIAMETER_MESSAGE_AVP_VENDOR_ID);
    } else {
        avp.vendorId = 0;
    }

    const avpTag = dictionary.getAvpByCodeAndVendorId(avp.codeInt, avp.vendorId);
    if (avpTag == null) {
        throw new Error('Unable to find AVP for code ' + avp.codeInt + ' and vendor id ' + avp.vendorId + ', for app ' + appId);
    }
    avp.code = avpTag.name;

    const dataPosition = hasVendorId ? DIAMETER_MESSAGE_AVP_VENDOR_ID_DATA : DIAMETER_MESSAGE_AVP_NO_VENDOR_ID_DATA;

    avp.dataRaw = buffer.slice(start + dataPosition, start + avp.length);
    if (avpTag.type === 'Grouped') {
        avp.avps = decodeAvps(avp.dataRaw, 0, avp.dataRaw.length, appId);
    } else {
        avp.data = diameterTypes.decode(avpTag.type, avp.dataRaw);
        if (avpTag.enums) {
            const enumValue = _.find(avpTag.enums, {
                code: avp.data
            });
            if (enumValue == null) {
                throw new Error('No enum value found for ' + avp.code + ' code ' + avp.data);
            }
            avp.data = enumValue.name;
        }
    }
    return avp;
};

const decodeAvps = function(buffer, start, end, appId) {
    const avps = [];
    let cursor = start;
    while (cursor < end) {
        const avp = decodeAvp(buffer, cursor, appId);
        avps.push(avp);
        cursor += avp.length;
        if (cursor % 4 !== 0) {
            cursor += 4 - cursor % 4; // round to next 32 bit
        }
    }
    return avps;
};

// Converts avp objects to array form, e.g. [['key', 'value'], ['key', 'value']]
const avpsToArrayForm = function(avps) {
    return _.map(avps, function(avp) {
        if (avp.avps) {
            return [avp.code, avpsToArrayForm(avp.avps)];
        }
        return [avp.code, avp.data];
    });
};

exports.decodeMessage = function(buffer) {
    const message = exports.decodeMessageHeader(buffer);
    const avps = decodeAvps(buffer, DIAMETER_MESSAGE_HEADER_LENGTH_IN_BYTES,
        message.header.length, message.header.applicationId);
    inflateMessageHeader(message);
    message.body = avpsToArrayForm(avps);
    message._timeProcessed = _.now();
    return message;
};

const encodeAvps = function(avps, appId) {
    const avpBuffers = _.map(avps, function(avp) {
        return encodeAvp(avp, appId);
    });
    return Buffer.concat(avpBuffers);
};

const encodeAvp = function(avp, appId) {
    let avpTag;
    if (!_.isNumber(avp[0])) {
        avpTag = dictionary.getAvpByName(avp[0]);
    } else {
        avpTag = dictionary.getAvpByCode(avp[0]);
    }
    if (avpTag == null) {
        throw new Error('Unknown AVP code ' + avp[0] + ' for app ' + appId);
    }
    let value = avp[1];
    let avpDataBuffer;
    if (avpTag.type === 'Grouped') {
        avpDataBuffer = encodeAvps(value, appId);
    } else {
        if (avpTag.enums) {
            let enumCode;
            if (!_.isNumber(value)) {
                enumCode = _.find(avpTag.enums, {
                    name: value
                });
            } else {
                enumCode = _.find(avpTag.enums, {
                    code: value
                });
            }
            if (enumCode == null) {
                throw new Error('Invalid enum value ' + value + ' for ' + avpTag.name);
            }
            value = enumCode.code;
        }
        avpDataBuffer = diameterTypes.encode(avpTag.type, value);
    }

    let avpHeaderLength = DIAMETER_MESSAGE_AVP_HEADER_LENGTH_IN_BYTES;
    if (avpTag.flags.vendorBit) {
        // 4 extra bytes for vendor id
        avpHeaderLength += DIAMETER_MESSAGE_VENDOR_ID_LENGTH_IN_BYTES;
    }
    const avpHeaderBuffer = new Buffer(avpHeaderLength);
    avpHeaderBuffer.writeUInt32BE(_.parseInt(avpTag.code), DIAMETER_MESSAGE_AVP_CODE);

    const flags = [avpTag.flags.vendorBit, avpTag.flags.mandatory, avpTag.flags['protected']];
    const flagsInt = getIntFromBits(_.flatten([flags, [false, false, false, false, false]]));
    avpHeaderBuffer.writeUInt8(flagsInt, DIAMETER_MESSAGE_AVP_FLAGS);
    writeUInt24BE(avpHeaderBuffer, DIAMETER_MESSAGE_AVP_LENGTH, avpDataBuffer.length + avpHeaderBuffer.length);

    if (avpTag.vendorId > 0) {
        avpHeaderBuffer.writeUInt32BE(_.parseInt(avpTag.vendorId), DIAMETER_MESSAGE_AVP_VENDOR_ID);
    }

    if (avpDataBuffer.length % 4 !== 0) {
        const filler = new Buffer(4 - avpDataBuffer.length % 4);
        filler.fill(0);
        avpDataBuffer = Buffer.concat([avpDataBuffer, filler]);
    }
    return Buffer.concat([avpHeaderBuffer, avpDataBuffer]);
};

exports.encodeMessage = function(message) {
    let buffer = new Buffer(DIAMETER_MESSAGE_HEADER_LENGTH_IN_BYTES);
    buffer.writeUInt8(message.header.version, DIAMETER_MESSAGE_HEADER_VERSION);
    writeUInt24BE(buffer, DIAMETER_MESSAGE_HEADER_COMMAND_CODE, message.header.commandCode);
    const flags = _.values(message.header.flags);
    const flagsInt = getIntFromBits(_.flatten([flags, [false, false, false, false]]));
    buffer.writeUInt8(flagsInt, DIAMETER_MESSAGE_HEADER_FLAGS);
    buffer.writeUInt32BE(message.header.applicationId, DIAMETER_MESSAGE_HEADER_APPLICATION_ID);
    buffer.writeUInt32BE(message.header.hopByHopId, DIAMETER_MESSAGE_HEADER_HOP_BY_HOP_ID);
    buffer.writeUInt32BE(message.header.endToEndId, DIAMETER_MESSAGE_HEADER_END_TO_END_ID);

    const avpBuffers = _.map(message.body, function(avp) {
        return encodeAvp(avp, message.header.applicationId);
    });

    buffer = Buffer.concat(_.flatten([buffer, avpBuffers]));
    writeUInt24BE(buffer, DIAMETER_MESSAGE_HEADER_LENGTH, buffer.length);
    return buffer;
};
