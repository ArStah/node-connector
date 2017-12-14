const net = require("net");
const EventEmitter = require("events").EventEmitter;

module.exports.ConnectorClient = class ConnectorClient extends EventEmitter {
    constructor(key) {
        super();
        this._socket = new net.Socket()
                .on('connect', () => {
                    this._socket.write(key);
                })
                .on('error', err => {
                    this.emit("error", err);
                })
                .on('close', () => {
                    this.emit("disconnect");
                });
        this._authorized = false;
        this._requests = {};
        this._key = key;
    }

    connect(port, address) {
        this._socket.connect(port, address);

        this._socket.removeAllListeners("data");
        this._socket.on('data', data => {
            if (data != "SUCCESS_AUTH")
                return;
            this.emit("connect");
            this._socket.removeAllListeners("data");
            this._socket.on("data", (data) => {
                data = JSON.parse(data);
                if ("request" in data) {
                    let request = data.request;
                    delete data.request;
                    return this._response(request, data);
                } else if ("event" in data) {
                    return this.emit(data.event, data.data);
                }
            });
        });
        return this;
    }

    async _response(request, data) {
        if (request in this._requests && typeof this._requests[request] == "function")
            this._requests[request](data);
    }

    async request(command, data, success, error) {
        let _ID = +new Date;
        this._socket.write(JSON.stringify({
            command,
            data,
            _ID
        }));
        return await new Promise((resolve, reject) => {
            this._requests[_ID] = (data) => {
                try {
                    if (data.success) {
                        if (typeof success == "function")
                            return resolve(success(data.data));
                        return resolve(data.data);
                    }
                    let e = data.error;
                    if (typeof error == "object") {
                        if (typeof error[e.code] == "function")
                            return resolve(error[e.code](e.data, e));
                        if (typeof error["default"] == "function")
                            return resolve(error["default"](e.code, e.data, e));
                    } else if (typeof error == "function") {
                        return resolve(error(e.code, e.data, e));
                    }
                    return reject(e);
                } catch (e) {
                    return reject(e);
                }
            };
            setTimeout(() => {
                //reject([]);
            }, 5000);
        });
    }
};

module.exports.ConnectorServer = class ConnectorServer extends EventEmitter {
    constructor(key) {
        super();
        this._sockets = {};
        this._commands = {};
        this._server = net.createServer(socket => {
            let sockID = +new Date;
            this._sockets[sockID] = socket;
            socket.send = (event, data) => {
                console.log(event, data);
                socket.write(JSON.stringify({event, data}));
            };

            socket.on("data", data => {
                if (data != key)
                    return socket.write("__NEED_CODE__");

                socket.write("SUCCESS_AUTH");
                socket.removeAllListeners("data");

                socket.on("data", data => {
                    data = JSON.parse(data);
                    this._handleRequest(data, socket).then(result => {
                        socket.write(JSON.stringify({
                            success: true,
                            data: result,
                            request: data._ID
                        }));
                    }).catch(e => {
                        if (typeof e == "string") {
                            e = {code: e};
                        } else if (Array.isArray(e)) {
                            e = {code: e[0], data: e[1]};
                        }
                        console.warn({"someError": e});
                        socket.write(JSON.stringify({
                            success: false,
                            error: e,
                            request: data._ID
                        }));
                    });
                });
            });
        });
    }

    launch(port) {
        this._server.listen(port, () => {
            this.emit("launch");
        });
        return this;
    }

    async _handleRequest(params, socket) {
        if (params.command in this._commands)
            return await this._commands[params.command](params.data, socket);
        this.REQUIRES(false, "__INVALID_COMMAND__");
    }

    register(command, handler) {
        this._commands[command] = handler;
        return this;
    }

    REQUIRES(condition, error) {
        if (!condition)
            throw error;
    }
};
