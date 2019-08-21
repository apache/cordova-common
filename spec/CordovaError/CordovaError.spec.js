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

var CordovaError = require('../../src/CordovaError/CordovaError');

describe('CordovaError class', function () {
    it('Test 001 : should be constructable', function () {
        expect(new CordovaError('error')).toEqual(jasmine.any(CordovaError));
    });

    it('Test 002 : getErrorCodeName works', function () {
        var error002_1 = new CordovaError('error', 0);
        expect(error002_1.getErrorCodeName()).toEqual('UNKNOWN_ERROR');
        var error002_2 = new CordovaError('error', 1);
        expect(error002_2.getErrorCodeName()).toEqual('EXTERNAL_TOOL_ERROR');
    });

    it('Test 003 : toString works', function () {
        var error003_1 = new CordovaError('error', 0);
        expect(error003_1.toString(false)).toEqual('error');
        expect(error003_1.toString(true).substring(0, 12)).toEqual('CordovaError');
        var error003_2 = new CordovaError('error', 1);
        expect(error003_2.toString(false)).toEqual('External tool failed with an error: error');
    });
});
