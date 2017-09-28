'use strict';

const _ = require('lodash');
const diameterCodec = require('./diameter-codec');
const diameterUtil = require('./diameter-util');


const DIAMETER_MESSAGE_HEADER_LENGTH_IN_BYTES = 20;

const getSessionId = function(message) {
    const sessionIdAvp = _.find(message.body, function(avp) {
        return avp[0] === 'Session-Id';
    });
    if (sessionIdAvp !== undefined) return sessionIdAvp[1];
    return undefined;
};

function DiameterConnection(options, socket) {
    if (!(this instanceof DiameterConnection)) {
        return new DiameterConnection(options, socket);
    }
    options = options || {};
    const self = this;
    self.socket = socket;
    self.options = options;
    self.pendingRequests = {};
    self.hopByHopIdCounter = diameterUtil.random32BitNumber();

    let buffer;

    self.socket.on('data', function(data) {

        buffer = new Buffer(0);

        try {
            buffer = Buffer.concat([buffer, data instanceof Buffer ? data : new Buffer(data)]);

            // If we collected header
            if (buffer.length >= DIAMETER_MESSAGE_HEADER_LENGTH_IN_BYTES) {
                const messageLength = diameterCodec.decodeMessageHeader(buffer).header.length;

                // If we collected the entire message
                if (buffer.length >= messageLength) {
                    const message = diameterCodec.decodeMessage(buffer);

                    if (message.header.flags.request) {
                        const response = diameterCodec.constructResponse(message);

                        if (_.isFunction(self.options.log)) {
                            self.options.log(false, message);
                        }

                        self.socket.emit('diameterMessage', {
                            sessionId: getSessionId(message),
                            message: message,
                            response: response,
                            callback: function(response) {
                                if (_.isFunction(self.options.log)) {
                                    self.options.log(true, response);
                                }
                                const responseBuffer = diameterCodec.encodeMessage(response);
                                setImmediate(function() {
                                    self.socket.write(responseBuffer);
                                });
                            }
                        });
                    } else {
                        const pendingRequest = self.pendingRequests[message.header.hopByHopId];
                        if (pendingRequest != null) {
                            if (_.isFunction(self.options.log)) {
                                self.options.log(false, message);
                            }
                            delete self.pendingRequests[message.header.hopByHopId];
                            pendingRequest.callback(null, message);
                        } else {
                            self.socket.emit('error', 'No pending request for this message (' + message.body + ')');
                        }
                    }
                    buffer = buffer.slice(messageLength);
                }
                else {
                    self.socket.emit('error', 'Buffer length is less than decoded message length.');
                }
            }
            else {
                self.socket.emit('error', 'Buffer length is < DIAMETER_MESSAGE_HEADER_LENGTH_IN_BYTES.');
            }
        } catch (err) {
            self.socket.emit('error', err);
        }
    });

    self.createRequest = function(application, command, proxiable, sessionId) {
        if (sessionId === undefined) {
            sessionId = diameterUtil.random32BitNumber();
        }
        if (proxiable === undefined) {
            proxiable = false;
        }
        return diameterCodec.constructRequest(application, command, proxiable, sessionId);
    };

    self.sendRequest = function(request, cb) {
        if (this.socket === undefined) {
            return cb('Socket not bound to session');
        }
        request.header.hopByHopId = this.hopByHopIdCounter++;
        if (_.isFunction(this.options.log)) {
            this.options.log(true, request);
        }
        const requestBuffer = diameterCodec.encodeMessage(request);
        this.socket.write(requestBuffer);
        this.pendingRequests[request.header.hopByHopId] = {
            'request': request,
            'callback': cb
        };
    };

    self.end = function() {
        socket.end();
    };
}

exports.DiameterConnection = DiameterConnection;
