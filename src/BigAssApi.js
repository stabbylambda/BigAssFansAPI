const dgram = require("dgram");
const BigAssFan = require('./BigAssFan');
const BigAssLight = require('./BigAssLight');
const BigAssProperty = require('./BigAssProperty');
const { syncingCallback, retryCall, myLogWrapper } = require('./utils');

function FanMaster (numberOfExpectedFans) {
    this.allFans = {}; // Dictionary of fan name -> BigAssFan
    this.connectionOpen = false;
    this.fanPort = 31415;
    this.everyone = "255.255.255.255";
    this.server = dgram.createSocket("udp4");
    this.pollingIntervalForFans = 1000;
    this.dispatchForFans = {};
    this.numberOfExpectedFans = numberOfExpectedFans ? numberOfExpectedFans : 1;
    this.theAllFan = new BigAssFan("ALL", "ALL", this.everyone, this); // If you wanted to broadcast to everyone

    this.onFanConnection = () => {}; // Callback you can register for
    this.onFanFullyUpdated = () => {}; // Callback you can register for

    this.broadcastToFans = (message) => {
        this.sendRaw(`<ALL;${message}>`, this.everyone);
    };

    this.sendRaw = (message, address) => {
        myLogWrapper(`Sending: ${message}`);
        const buffMessage = new Buffer(message);
        this.server.send(buffMessage, 0, buffMessage.length, this.fanPort, address);
    };

    this.rescanForFans = () => {
        this.broadcastToFans("DEVICE;ID;GET");
    };

    this.rescanUntilAllFans = () => {
        const pollForFans = () => {
            if (Object.keys(this.allFans).length < this.numberOfExpectedFans) {
                this.rescanForFans();
            } else {
                clearInterval(id);
            }
        };
        const id = setInterval(pollForFans, this.pollingIntervalForFans);
        pollForFans();
    };

    this.server.on('close', (msg, rinfo) => {
        this.connectionOpen = false;
    });

    let handleNewFan = (msg, address) => {
        if (msg[0] == "ALL") {
            return; // Message not addressed to us
        }
        const deviceType = msg[4].split(",",1); // Grab first part of string before ","
        if (deviceType == "FAN") {
            const newFan = new BigAssFan(msg[0], msg[3], address, this);
            this.allFans[msg[0]] = newFan;
            this.onFanConnection(newFan);
            newFan.updateAll(() => this.onFanFullyUpdated(newFan));
        } else if (deviceType == "LIGHT") {
            let newLight = new BigAssLight(msg[0], msg[3], address, this);
            this.allFans[msg[0]] = newLight;
            this.onFanConnection(newLight);
            newLight.updateAll(() => this.onFanFullyUpdated(newLight));
        } else if (deviceType == "SWITCH") {
            myLogWrapper("Skipping wall control - TODO : Add support for wall control");
        } else {
            myLogWrapper("Received message from unknown fan - rescanning");
            this.rescanForFans();
        }
    };

    this.server.on("message", (msg, rinfo) => {
        myLogWrapper(`server got: ${msg} from ${rinfo.address}:${rinfo.port}`);
        const splitMessage = (`${msg}`).replace(/<|>|\(|\)/g, "").split(";");
        const fanId = splitMessage.shift();
        if (this.dispatchForFans[fanId]) {
            this.dispatchForFans[fanId](splitMessage);
        } else {
            splitMessage.unshift(fanId);
            handleNewFan(splitMessage, rinfo.address);
        }
    });

    this.server.bind(this.fanPort, () => {
        this.server.setBroadcast(true);
        this.connectionOpen = true;
        this.rescanUntilAllFans();
    });
}

exports.FanMaster = FanMaster;
exports.BigAssFan = BigAssFan;
