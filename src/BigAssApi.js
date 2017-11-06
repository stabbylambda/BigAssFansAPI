const dgram = require("dgram");
const BigAssFan = require('./BigAssFan');
const BigAssLight = require('./BigAssLight');
const BigAssProperty = require('./BigAssProperty');
const { syncingCallback, retryCall, myLogWrapper } = require('./utils');

function FanMaster (numberOfExpectedDevices) {
    this.allDevices = {}; // Dictionary of fan name -> BigAssDevice
    this.sonnectionOpen = false;
    this.fanPort = 31415;
    this.everyone = "255.255.255.255";
    this.server = dgram.createSocket("udp4");
    this.pollingIntervalForDevices = 1000;
    this.dispatchForDevices = {};
    this.numberOfExpectedDevices = numberOfExpectedDevices ? numberOfExpectedDevices : 1;
    this.theAllDevice = new BigAssFan("ALL", "ALL", this.everyone, this); // If you wanted to broadcast to everyone

    this.onDeviceConnection = () => {}; // Callback you can register for
    this.onDeviceFullyUpdated = () => {}; // Callback you can register for

    this.broadcastToDevices = (message) => {
        this.sendRaw(`<ALL;${message}>`, this.everyone);
    };

    this.sendRaw = (message, address) => {
        myLogWrapper(`Sending: ${message}`);
        const buffMessage = new Buffer(message);
        this.server.send(buffMessage, 0, buffMessage.length, this.fanPort, address);
    };

    this.rescanForDevices = () => {
        this.broadcastToDevices("DEVICE;ID;GET");
    };

    this.rescanUntilAllDevices = () => {
        const pollForDevices = () => {
            if (Object.keys(this.allDevices).length < this.numberOfExpectedDevices) {
                this.rescanForDevices();
            } else {
                clearInterval(id);
            }
        };
        const id = setInterval(pollForDevices, this.pollingIntervalForDevices);
        pollForDevices();
    };

    this.server.on('close', (msg, rinfo) => {
        this.connectionOpen = false;
    });

    let handleNewDevice = (msg, address) => {
        if (msg[0] == "ALL") {
            return; // Message not addressed to us
        }
        const deviceType = msg[4].split(",",1); // Grab first part of string before ","
        if (deviceType == "FAN") {
            const newDevice = new BigAssFan(msg[0], msg[3], address, this);
            this.allDevices[msg[0]] = newDevice;
            this.onDeviceConnection(newDevice);
            newDevice.updateAll(() => this.onDeviceFullyUpdated(newDevice));
        } else if (deviceType == "LIGHT") {
            let newLight = new BigAssLight(msg[0], msg[3], address, this);
            this.allDevices[msg[0]] = newLight;
            this.onDeviceConnection(newLight);
            newLight.updateAll(() => this.onDeviceFullyUpdated(newLight));
        } else if (deviceType == "SWITCH") {
            myLogWrapper("Skipping wall control - TODO : Add support for wall control");
        } else {
            myLogWrapper("Received message from unknown fan - rescanning");
            this.rescanForDevices();
        }
    };

    this.server.on("message", (msg, rinfo) => {
        myLogWrapper(`server got: ${msg} from ${rinfo.address}:${rinfo.port}`);
        const splitMessage = (`${msg}`).replace(/<|>|\(|\)/g, "").split(";");
        const fanId = splitMessage.shift();
        if (this.dispatchForDevices[fanId]) {
            this.dispatchForDevices[fanId](splitMessage);
        } else {
            splitMessage.unshift(fanId);
            handleNewDevice(splitMessage, rinfo.address);
        }
    });

    this.server.bind(this.fanPort, () => {
        this.server.setBroadcast(true);
        this.connectionOpen = true;
        this.rescanUntilAllDevices();
    });
}

exports.FanMaster = FanMaster;
exports.BigAssFan = BigAssFan;
