/**
    Licensed to the Apache Software Foundation (ASF) under one
    or more contributor license agreements.  See the NOTICE file
    distributed with this work for additional information
    regarding copyright ownership.  The ASF licenses this file
    to you under the Apache License, Version 2.0 (the
    "License"); you may not use this file except in compliance
    with the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing,
    software distributed under the License is distributed on an
    "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, either express or implied.  See the License for the
    specific language governing permissions and limitations
    under the License.
*/

/**
 * A derived exception class. See usage example in cli.js
 * Based on:
 * stackoverflow.com/questions/1382107/whats-a-good-way-to-extend-error-in-javascript/8460753#8460753
 * @param {String} message Error message
 * @param {Number} [code=0] Error code
 * @constructor
 */
class CordovaError extends Error {
    constructor (message, code) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.code = code || CordovaError.UNKNOWN_ERROR;
    }

    /**
     * Translates instance's error code number into error code name, e.g. 0 -> UNKNOWN_ERROR
     * @returns {string} Error code string name
     */
    getErrorCodeName () {
        return Object.keys(CordovaError)
            .find(key => CordovaError[key] === this.code);
    }

    /**
     * Converts CordovaError instance to string representation
     * @param   {Boolean}  [isVerbose]  Set up verbose mode. Used to provide more
     *   details including information about error code name
     * @return  {String}              Stringified error representation
     */
    toString (isVerbose) {
        var codePrefix = '';

        if (this.code !== CordovaError.UNKNOWN_ERROR) {
            codePrefix = 'code: ' + this.code + (isVerbose ? (' (' + this.getErrorCodeName() + ')') : '') + ' ';
        }

        return isVerbose ? codePrefix + this.stack : codePrefix + this.message;
    }
}

// TODO: Extend error codes according the projects specifics
CordovaError.UNKNOWN_ERROR = 0;

module.exports = CordovaError;
