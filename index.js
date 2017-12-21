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

    async connect(port, address) {
        this._socket.connect(port, address);
        this._socket.removeAllListeners("data");
        await new Promise((resolve, reject) => {
            this._socket.on('data', data => {
                data = JSON.parse(data);
                if (data.code != "SUCCESS_AUTH")
                    return;
                for (let meth of data.methods) {
                    Object.defineProperty(this, meth, {
                        value: async (...args) => {
                            return await this._request(meth, ...args);
                        }
                    });
                }
                this.emit("connect");
                this._socket.removeAllListeners("data");
                this._socket.on("data", (data) => {
                    data = JSON.parse(data);
                    if ("request" in data) {
                        let request = data.request;
                        delete data.request;
                        if (request in this._requests && typeof this._requests[request] == "function")
                            return this._requests[request](data);
                        console.log("Got unhandled response from request ", request);
                    } else if ("event" in data) {
                        return this.emit(data.event, data.data);
                    }
                });
                resolve(true);
            });
        });
        return this;
    }

    async _request(command, data, success = false, error = false, timeout = false) {
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
                            i
                            f(typeof error["default"] == "function")
                            return resolve(error["default"](e.code, e.data, e));
                        } else if (typeof error == "function") {
                            return resolve(error(e.code, e.data, e));
                        }
                        return reject(e);
                    }
                    catch
                        (e) {
                        return reject(e);
                    }
                };
                setTimeout(() => {
                    reject("__TIMEOUT__");
                }, timeout | 5000);
            }
        )
            ;
    }
}
;

module.exports.ConnectorServer = class ConnectorServer extends EventEmitter {
    constructor(key, handler) {
        super();
        Object.defineProperty(this, "_sockets", {value: {}});
        Object.defineProperty(this, "_handler", {value: handler});
        Object.defineProperty(this, "_server", {
            value: net.createServer(socket => {
                let sockID = +new Date;
                this._sockets[sockID] = socket;
                socket.send = (event, data) => {
                    console.log(event, data);
                    socket.write(JSON.stringify({event, data}));
                };

                socket.on("data", data => {
                    if (data != key)
                        return socket.write(JSON.stringify({code: "__WRONG_PASSCODE__"}));

                    socket.write(JSON.stringify({
                        code: "SUCCESS_AUTH",
                        methods: Object.keys(this._handler)
                    }));
                    socket.removeAllListeners("data");

                    socket.on("data", async data => {
                        try {
                            data = JSON.parse(data);
                            let result = await this._handleRequest(data, socket);
                            socket.write(JSON.stringify({
                                success: true,
                                data: result,
                                request: data._ID
                            }));
                        } catch (e) {
                            switch (typeof e) {
                                case "string":
                                    e = {code: e};
                                    break;
                                case "object":
                                    if (Array.isArray(e)) {
                                        e = {code: e[0], data: e[1]};
                                    } else if (e instanceof Error) {
                                        e = {code: "__INTERNAL_SERVER_ERROR__", data: e};
                                    }
                            }
                            socket.write(JSON.stringify({
                                success: false,
                                error: e,
                                request: data._ID
                            }));
                        }
                    });
                });
            })
        });
    }

    launch(port) {
        this._server.listen(port, () => {
            this.emit("launch");
        });
        return this;
    }

    async _handleRequest(params, socket) {
        if (params.command in this._handler)
            return await this._handler[params.command](params.data, socket);
        this.REQUIRE(false, "__INVALID_COMMAND__");
    }

    REQUIRE(condition, error) {
        if (!condition)
            throw error;
    }
};
