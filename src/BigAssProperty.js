const { syncingCallback, retryCall, myLogWrapper } = require('./utils');
module.exports = function BigAssProperty (name, bigAssFan) {
    this.name = name;
    this.bigAssFan = bigAssFan;

    this.allFieldsUpdateQuery = {}
    this.updateCallbacks = {}

    this.setFunctions = {}

    this.createGetField = (name, query, isSettable, additionalProp, trueOpt, falseOpt, optionalFilter) => {
        let toSendOnUpdate = query.concat("GET");
        toSendOnUpdate = additionalProp ? toSendOnUpdate.concat(additionalProp) : toSendOnUpdate;
        this.allFieldsUpdateQuery[name] = toSendOnUpdate;
        this.updateCallbacks[name] = {};

        const privateVarName = `_${name}`;
        this[privateVarName] = undefined;

        const setFunction = (value, optionalCallback) => {
            // TODO ensure that value fits in "filter"
            if (typeof value == "boolean" && trueOpt && falseOpt) {
                value = value ? trueOpt : falseOpt;
            }
            let successfullyUpdated = false;
            const updateTableId = this.registerUpdateCallback(name, () => {
                successfullyUpdated = true;
                if (optionalCallback) {
                    optionalCallback(null);
                    optionalCallback = null;
                }
                this.unregisterUpdateCallback(name, updateTableId);
            });

            const toSetProperty = () => {
                this.bigAssFan.send(query.concat("SET", value))
            };

            const isSuccesfullyUpdated = function() {
                return successfullyUpdated;
            };

            const isRetriesAllFailed = function() {
                if (optionalCallback) {
                    optionalCallback(new Error("Failed to set property"));
                    optionalCallback = null; // TODO: Figure out why this is getting called twice in the first place
                                             // Espeicially this this fix can still crash
                }
            };

            retryCall(this.bigAssFan.maxRetries, this.bigAssFan.waitTimeOnRetry, toSetProperty, isSuccesfullyUpdated, isRetriesAllFailed);

        };

        this.setFunctions[name] = setFunction;

        Object.defineProperty(this, name, {
            get: function() {
                    return this[privateVarName];
                },
            set: isSettable ? setFunction : undefined
        });

        const handleUpdatedValue = value => {
            if (trueOpt) {
                this[privateVarName] = (value == trueOpt) ? true : (value == falseOpt || falseOpt == undefined ? false : value);
            } else {
                this[privateVarName] = value;
            }
            if (this.bigAssFan.onPropertyUpdate) {
                this.bigAssFan.onPropertyUpdate([this.name, name], value);
            }
            for (const key in this.updateCallbacks[name]) {
                this.updateCallbacks[name][key](value);
            }
        };

        const expectedRecieve = additionalProp ? query.concat(additionalProp) : query;
        this.bigAssFan.propertyListeners[`${this.name}.${name}`] = [expectedRecieve, handleUpdatedValue];

    }

    /**
     * Set a specific property by name
     * @param name     - Property name to set
     * @param value    - Value to set to this property
     * @param callback - Optional callback, null if success, error otherwise
     */
    this.setProperty = (name, value, callback) => {
        const thisSetFunction = this.setFunctions[name];
        if (thisSetFunction) {
            thisSetFunction(value, callback)
        }
    };

    /**
     * Register an update callback
     * @param name     - Property name to register for a callback on
     * @param callback - Callback, first arg is error (null if none), second is value
     */
    this.update = (name, callback) => {
        let updated = false;
        const id = this.registerUpdateCallback(name, value => {
            updated = true;
            this.unregisterUpdateCallback(name, id);
            if (callback) {
                callback(null, value);
            }
        });

        const functionToRequestUpdate = () => {
            this.bigAssFan.send(this.allFieldsUpdateQuery[name]);
        };

        const isUpdateSucceeded = function() { return updated; };

        const updateFailed = function() {
            if (callback) {
                callback(new Error("Cannot reach fan / property"), null);
            }
        };

        retryCall(this.bigAssFan.maxRetries, this.bigAssFan.waitTimeOnRetry, functionToRequestUpdate, isUpdateSucceeded, updateFailed);
    }

    this.updateAll = callback => {
        const syncCallback = syncingCallback(this.allFieldsUpdateQuery, callback);
        for (const fieldKey in this.allFieldsUpdateQuery) {
            this.update(fieldKey, syncCallback);
        }
    }

    this.registerUpdateCallback = (name, callback) => {
        do {
            possibleKey = Math.random()
        } while (this.updateCallbacks[name][possibleKey] != undefined);
        this.updateCallbacks[name][possibleKey] = callback;
        return possibleKey;
    }

    this.unregisterUpdateCallback = (name, identifier) => {
        if (this.updateCallbacks[name][identifier]) {
            delete this.updateCallbacks[name][identifier];
            return true
        }
        return false
    }

    this.bigAssFan.propertyTable[name] = this;
}
