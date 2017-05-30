'use strict';

const DiameterConnection = require('./diameter-connection').DiameterConnection;
const diameterUtil = require('./diameter-util');
const Sctp = require('sctp-addon');

exports.createClient = function(options, connectionListener) {

    Sctp.createClient(options, (err, socket) => {
        if (err) {
            return connectionListener(err);
        }
        var connection = new DiameterConnection(options, socket);
        socket.diameterConnection = connection;
        return connectionListener(null, socket);
    });
};

exports.debug = function(isOn) {
    if (isOn) {
       Sctp.debug(true);
    }
}

exports.messageToColoredString = diameterUtil.messageToColoredString;

exports.logMessage = function(message) {
    console.log(exports.messageToColoredString(message));
};
