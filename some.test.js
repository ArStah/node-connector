const aconnector = require("./index.js");
const ConnectorServer = aconnector.ConnectorServer;
const ConnectorClient = aconnector.ConnectorClient;

let Serv, Cl, key = "key";
it("Create Server", () => {
    Serv = new ConnectorServer(key, {
        mul([a, b]) {
            return a * b;
        },
        add([a, b]) {
            return a + b;
        },
        err() {
            throw "__SOME_ERROR__";
        },
        nativeErr() {
            throw new TypeError("Div by zero");
        }
    });
});

it("Create Client", () => {
    Cl = new ConnectorClient(key);
});

let port = 1234;

it("Launch Server", async () => {
    Serv.launch(port);
});

it("Connect Client", async () => {
    await Cl.connect(port, "localhost");
});

it("Add 5 + 10", async () => {
    let res = await Cl.add([5, 10]);
    if (res != 15)
        throw new Error(`Expect 15 got ${res}`);
});

it("Mul 5 * 10", async () => {
    let res = await Cl.mul([5, 10]);
    if (res != 5 * 10)
        throw new Error(`Expect ${5 * 10} got ${res}`);
});

it("Catch error", async () => {
    let gotErr = false;
    try {
        let res = await Cl.err();
    } catch (err) {
        gotErr = true;
    }
    if (!gotErr)
        throw new Error("Didnt catch an error");
});

it("Catch native error", async () => {
    let gotErr = false;
    try {
        let res = await Cl.nativeErr();
    } catch (err) {
        if (err.code == "__INTERNAL_SERVER_ERROR__")
            gotErr = true;
    }
    if (!gotErr)
        throw new Error("Didnt catch an error");
});