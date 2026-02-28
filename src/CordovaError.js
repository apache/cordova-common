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

// @ts-check

const { deprecate } = require('node:util');

/**
 * @public
 * @typedef {Object} CordovaErrorOptions
 * @param {String} [name] - Name of the error.
 * @param {Error} [cause] - Indicates that the new error was caused by `cause`.
 * @param {Object} [info] - Specifies arbitrary informational properties.
 */

class CordovaError extends Error {
    #stackObj = {};
    #info;
    #name;
    #cause;

    /**
     * @param {String} message - Error message
     * @param {Error|CordovaErrorOptions} [causeOrOpts] - The Error that caused
     * this to be thrown or a CordovaErrorOptions object.
     */
    constructor (message, causeOrOpts = {}) {
        super(message);

        const opts = causeOrOpts instanceof Error ? { cause: causeOrOpts } : causeOrOpts;

        this.#name = opts.name ?? this.constructor.name;
        this.#cause = opts.cause;
        this.#info = opts.info;

        if (this.#cause) {
            this.message = `${message}: ${this.#cause.message}`;
        }

        delete this.stack; // Remove the existing stack property so it calls our getter
        Error.captureStackTrace(this.#stackObj, this.constructor);
    }

    toString () {
        return `${this.#name}: ${this.message}`;
    }

    get name () {
        return this.#name;
    }

    get cause () {
        return this.#cause;
    }

    get info () {
        return this.#info;
    }

    get stack () {
        if (this.#cause) {
            return `${this.#stackObj.stack}\ncaused by: ${this.#cause.stack}`;
        }

        return this.#stackObj.stack;
    }

    set stack (value) {
        this.#stackObj.stack = value;
    }
}

CordovaError.info = deprecate((err) => err.info, 'info(err) is deprecated. Use err.info instead.');
CordovaError.cause = deprecate((err) => err.cause, 'cause(err) is deprecated. Use err.cause instead.');
CordovaError.fullStack = deprecate((err) => err.stack, 'fullStack(err) is deprecated. Use err.stack instead.');

module.exports = CordovaError;
