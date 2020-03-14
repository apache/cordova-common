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

const endent = require('endent');
const CordovaError = require('../../src/CordovaError');

describe('CordovaError class', () => {
    let error;

    beforeEach(() => {
        error = new CordovaError('error');
    });

    it('should be an error', () => {
        expect(error).toEqual(jasmine.any(Error));
    });

    it('should have a name property', () => {
        expect(error.name).toEqual('CordovaError');
    });

    it('should have a working toString method', () => {
        expect(error.toString()).toEqual('CordovaError: error');
    });

    describe('given a cause', () => {
        let cause;

        beforeEach(() => {
            cause = new Error('cause');
            error = new CordovaError('error', cause);
        });

        it('should save it', () => {
            expect(error.cause()).toBe(cause);
            expect(CordovaError.cause(error)).toBe(cause);
        });

        it('should include the cause in toString result', () => {
            const stringifiedError = 'CordovaError: error: cause';
            expect(String(error)).toEqual(stringifiedError);
            expect(error.toString()).toEqual(stringifiedError);
        });

        it('should include the cause stack in CordovaError.fullStack', () => {
            cause.stack = 'CAUSE_STACK';
            error.stack = 'ERROR_STACK';

            expect(CordovaError.fullStack(error)).toEqual(endent`
                ERROR_STACK
                caused by: CAUSE_STACK
            `);
        });
    });

    describe('given options', () => {
        it('should apply name option', () => {
            const name = 'FooError';
            error = new CordovaError('error', { name });

            expect(error.name).toEqual(name);
        });

        it('should apply cause option', () => {
            const cause = new Error('cause');
            error = new CordovaError('error', { cause });

            expect(CordovaError.cause(error)).toBe(cause);
        });

        it('should apply info option', () => {
            const info = { foo: 'bar' };
            error = new CordovaError('error', { info });

            expect(CordovaError.info(error)).toEqual(info);
        });
    });
});
