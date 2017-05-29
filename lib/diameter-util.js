'use strict';

const chalk = require('chalk');
const _ = require('lodash');


exports.random32BitNumber = function() {
    const max32 = Math.pow(2, 32) - 1;
    return Math.floor(Math.random() * max32);
};

const avpsToString = function(avps, indent) {
    const indentString = _.repeat(' ', indent);
    return _.reduce(avps, function(out, avp) {
        out += indentString + chalk.cyan(avp[0]) + ': ';
        if (avp[1] instanceof Array) {
            out += '\n' + avpsToString(avp[1], indent + 2);
        } else {
            if (_.isString(avp[1])) {
                out += '"' + avp[1] + '"';
            } else {
                out += avp[1];
            }
            out += '\n';
        }
        return out;
    }, '');
};

const flagsToString = function(flags) {
    let messageString = '';
    _.each(_.keys(flags), function(key) {
        if (flags[key]) {
            messageString += _.startCase(key) + ' [x]  ';
        } else {
            messageString += chalk.gray(_.startCase(key) + ' [ ]  ');
        }
    });
    return messageString;
};

exports.messageToColoredString = function(message) {
    let messageString = chalk.gray(_.repeat('-', 80)) + '\n';
    messageString += chalk.gray('Application: ' + message.header.application) + '\n';

    if (message.header.flags.request) {
        messageString += chalk.yellow(message.command) + '\n';
    } else if (!message.header.flags.request && !message.header.flags.error) {
        messageString += chalk.bold.green(message.command) + '\n';
    } else {
        messageString += chalk.red(message.command) + '\n';
    }

    messageString += flagsToString(message.header.flags);

    messageString += '\n';
    messageString += chalk.gray(_.repeat('-', 80)) + '\n';
    messageString += avpsToString(message.body, 0);
    messageString += chalk.gray(_.repeat('-', 80));
    return messageString;
};
