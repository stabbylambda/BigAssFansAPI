var { syncingCallback, retryCall, myLogWrapper } = require('./utils');
module.exports = function BigAssProperty (name, bigAssFan) {
    this.name = name;
    this.bigAssFan = bigAssFan;

    this.allFieldsUpdateQuery = {}
    this.updateCallbacks = {}

    this.setFunctions = {}

    this.createGetField = function(name, query, isSettable, additionalProp, trueOpt, falseOpt, optionalFilter) {
        var toSendOnUpdate = query.concat("GET");
        toSendOnUpdate = additionalProp ? toSendOnUpdate.concat(additionalProp) : toSendOnUpdate;
        this.allFieldsUpdateQuery[name] = toSendOnUpdate;
        this.updateCallbacks[name] = {};

        var privateVarName = '_' + name;
        this[privateVarName] = undefined;

        var setFunction = function(value, optionalCallback) {
            // TODO ensure that value fits in "filter"
            if (typeof value == "boolean" && trueOpt && falseOpt) {
                value = value ? trueOpt : falseOpt;
            }
            var successfullyUpdated = false;
            var updateTableId = this.registerUpdateCallback(name, function() {
                successfullyUpdated = true;
                if (optionalCallback) {
                    optionalCallback(null);
                    optionalCallback = null;
                }
                this.unregisterUpdateCallback(name, updateTableId);
            }.bind(this))

            var toSetProperty = function () {
                this.bigAssFan.send(query.concat("SET", value))
            }.bind(this)

            var isSuccesfullyUpdated = function() {
                return successfullyUpdated;
            }

            var isRetriesAllFailed = function() {
                if (optionalCallback) {
                    optionalCallback(new Error("Failed to set property"));
                    optionalCallback = null; // TODO: Figure out why this is getting called twice in the first place
                                             // Espeicially this this fix can still crash
                }
            }

            retryCall(this.bigAssFan.maxRetries, this.bigAssFan.waitTimeOnRetry, toSetProperty, isSuccesfullyUpdated, isRetriesAllFailed);

        }.bind(this)

        this.setFunctions[name] = setFunction;

        Object.defineProperty(this, name, {
            get: function() {
                    return this[privateVarName];
                },
            set: isSettable ? setFunction : undefined
        });

        var handleUpdatedValue = function(value) {
            if (trueOpt) {
                this[privateVarName] = (value == trueOpt) ? true : (value == falseOpt || falseOpt == undefined ? false : value);
            } else {
                this[privateVarName] = value;
            }
            if (this.bigAssFan.onPropertyUpdate) {
                this.bigAssFan.onPropertyUpdate([this.name, name], value);
            }
            for (var key in this.updateCallbacks[name]) {
                this.updateCallbacks[name][key](value);
            }
        }.bind(this)

        var expectedRecieve = additionalProp ? query.concat(additionalProp) : query;
        this.bigAssFan.propertyListeners[this.name + "." + name] = [expectedRecieve, handleUpdatedValue];

    }.bind(this)

    /**
     * Set a specific property by name
     * @param name     - Property name to set
     * @param value    - Value to set to this property
     * @param callback - Optional callback, null if success, error otherwise
     */
    this.setProperty = function(name, value, callback) {
        var thisSetFunction = this.setFunctions[name]
        if (thisSetFunction) {
            thisSetFunction(value, callback)
        }
    }.bind(this);

    /**
     * Register an update callback
     * @param name     - Property name to register for a callback on
     * @param callback - Callback, first arg is error (null if none), second is value
     */
    this.update = function(name, callback) {
        var updated = false;
        var id = this.registerUpdateCallback(name, function (value){
            updated = true;
            this.unregisterUpdateCallback(name, id);
            if (callback) {
                callback(null, value);
            }
        }.bind(this));

        var functionToRequestUpdate = function() {
            this.bigAssFan.send(this.allFieldsUpdateQuery[name]);
        }.bind(this)

        var isUpdateSucceeded = function() { return updated; }

        var updateFailed = function() {
            if (callback) {
                callback(new Error("Cannot reach fan / property"), null);
            }
        }

        retryCall(this.bigAssFan.maxRetries, this.bigAssFan.waitTimeOnRetry, functionToRequestUpdate, isUpdateSucceeded, updateFailed);
    }.bind(this)

    this.updateAll = function(callback) {
        var syncCallback = syncingCallback(this.allFieldsUpdateQuery, callback);
        for (var fieldKey in this.allFieldsUpdateQuery) {
            this.update(fieldKey, syncCallback);
        }
    }.bind(this)

    this.registerUpdateCallback = function(name, callback) {
        do {
            possibleKey = Math.random()
        } while (this.updateCallbacks[name][possibleKey] != undefined);
        this.updateCallbacks[name][possibleKey] = callback;
        return possibleKey;
    }.bind(this)

    this.unregisterUpdateCallback = function(name, identifier) {
        if (this.updateCallbacks[name][identifier]) {
            delete this.updateCallbacks[name][identifier];
            return true
        }
        return false
    }.bind(this)

    this.bigAssFan.propertyTable[name] = this;
}
