
/**
 * This function supplies a callback which can be called
 * N times, where N is the number of elements in
 * tableBeingUpdated. Once this supplied callback has been
 * called these N times it will call the passed in callback
 */
function syncingCallback (tableBeingUpdated, callback) {
    var callCount = 0;
    var lengthOfTable = Object.keys(tableBeingUpdated).length;

    var callbackForUser = function() {
        if (++callCount == lengthOfTable) {
            callback();
        }
    }

    return callback ? callbackForUser : undefined;
}

/**
 * Will retry a given call until success or failure
 *
 * @param maxRetries      - Maximum number of retries
 * @param waitTimeOnRetry - Time between each retry
 * @param toCall          - Function to call as a part of each retry
 * @param isSuccess       - Function to call to check if retry was successful (Returns true/false)
 * @param isFailure       - Function to call if all retries were a failure
 */
var retryCall = function(maxRetries, waitTimeOnRetry, toCall, isSuccess, isFailure) {
    var tried = 0;
    var retry = function() {
        if (!isSuccess()) {
            if (++tried >= maxRetries) {
                myLogWrapper("Failed - no more retries left");
                clearInterval(id);
                isFailure();
            } else {
                myLogWrapper("Failed - retrying : " + tried);
                toCall();
            }
        } else {
            clearInterval(id);
        }
    }.bind(this.bigAssFan);
    var id = setInterval(retry, waitTimeOnRetry);
    toCall();
}

/**
 * Simple logging wrapper so that logging can be turned on/off
 */
var myLogWrapper = function(msg) {
    var logging = process.env['BIG_ASS_LOG'] === "true";
    if (logging) {
        console.log(msg);
    }
};

module.exports = {
    myLogWrapper,
    retryCall,
    syncingCallback
};
