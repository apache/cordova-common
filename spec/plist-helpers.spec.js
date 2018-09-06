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

var plistHelpers = require('../src/util/plist-helpers');

describe('prunePLIST', function () {
    var doc = {
        FirstConfigKey: {
            FirstPreferenceName: '*',
            SecondPreferenceName: 'a + b',
            ThirdPreferenceName: 'x-msauth-$(CFBundleIdentifier:rfc1034identifier)'
        },

        SecondConfigKey: {
            FirstPreferenceName: 'abc'
        }
    };

    var xml = '<dict>' +
                '<key>FirstPreferenceName</key>' +
                '<string>*</string>' +
                '<key>SecondPreferenceName</key>' +
                '<string>a + b</string>' +
                '<key>ThirdPreferenceName</key>' +
                '<string>x-msauth-$(CFBundleIdentifier:rfc1034identifier)</string>' +
              '</dict>';

    var selector = 'FirstConfigKey';

    it('Test 01: should remove property from plist file using provided selector', function (done) {
        var pruneStatus = plistHelpers.prunePLIST(doc, xml, selector);

        expect(pruneStatus).toBeTruthy();
        expect(doc).toEqual(
            {
                SecondConfigKey: {
                    FirstPreferenceName: 'abc'
                }
            }
        );

        done();
    });
});

describe('plistGraft', function () {
    let doc = {
        'keychain-access-groups': [
            '$(AppIdentifierPrefix)io.cordova.hellocordova',
            '$(AppIdentifierPrefix)com.example.mylib'
        ]
    };

    let xml = '<array>' +
                '<string>$(AppIdentifierPrefix)io.cordova.hellocordova</string>' +
                '<string>$(AppIdentifierPrefix)com.example.mylib</string>' +
              '</array>';

    let selector = 'keychain-access-groups';

    it('Test 01: should not mangle existing plist entries', function (done) {
        var graftStatus = plistHelpers.graftPLIST(doc, xml, selector);

        expect(graftStatus).toBeTruthy();
        expect(doc).toEqual(
            {
                'keychain-access-groups': [
                    '$(AppIdentifierPrefix)io.cordova.hellocordova',
                    '$(AppIdentifierPrefix)com.example.mylib'
                ]
            }
        );

        done();
    });
});
