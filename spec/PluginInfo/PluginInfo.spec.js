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

const PluginInfo = require('../../src/PluginInfo/PluginInfo');
const path = require('path');
const pluginsDir = path.join(__dirname, '../fixtures/plugins');

describe('PluginInfo', function () {
    it('Test 001 : should read a plugin.xml file', function () {
        let p;
        expect(function () {
            p = new PluginInfo(path.join(pluginsDir, 'ChildBrowser'));
        }).not.toThrow();

        expect(p).toBeDefined();
        expect(p.name).toEqual('Child Browser');

        expect(p.getInfo('android').length).toBe(2);
        expect(p.getAssets('android').length).toBe(2);
        expect(p.getConfigFiles('android').length).toBe(4);
        expect(p.getSourceFiles('android').length).toBe(1);
        expect(p.getPreferences('android')).toEqual({});
        expect(p.getDependencies('android')).toEqual([]);
        expect(p.getHeaderFiles('android')).toEqual([]);
        expect(p.getLibFiles('android')).toEqual([]);
        expect(p.getFrameworks('android')).toEqual([]);
        expect(p.getResourceFiles('android')).toEqual([]);
    });

    it('Test 002 : should throw when there is no plugin.xml file', function () {
        expect(() => new PluginInfo('/non/existent/dir')).toThrow();
    });

    it('Test 003: replace framework src', function () {
        const p = new PluginInfo(path.join(pluginsDir, 'org.test.src'));
        const result = p.getFrameworks('android', { cli_variables: { FCM_VERSION: '9.0.0' } });
        expect(result[2].src).toBe('com.google.firebase:firebase-messaging:9.0.0');
    });

    it('Test 004: framework src uses default variable', function () {
        const p = new PluginInfo(path.join(pluginsDir, 'org.test.src'));
        const result = p.getFrameworks('android', {});
        expect(result[2].src).toBe('com.google.firebase:firebase-messaging:11.0.1');
    });

    it('Test 005: read podspec', function () {
        const p = new PluginInfo(path.join(pluginsDir, 'org.test.plugins.withcocoapods'));
        const result = p.getPodSpecs('ios');
        expect(result.length).toBe(1);
        const podSpec = result[0];
        expect(Object.keys(podSpec.declarations).length).toBe(2);
        expect(Object.keys(podSpec.sources).length).toBe(1);
        expect(Object.keys(podSpec.libraries).length).toBe(4);
        expect(podSpec.declarations['use-frameworks']).toBe('true');
        expect(podSpec.sources['https://github.com/CocoaPods/Specs.git'].source).toBe('https://github.com/CocoaPods/Specs.git');
        expect(podSpec.libraries.AFNetworking.spec).toBe('~> 3.2');
        expect(podSpec.libraries.Eureka['swift-version']).toBe('4.1');
    });

    describe('Test 006: framework embed and link interactions', function () {
        const p = new PluginInfo(path.join(pluginsDir, 'org.test.framework_embed_link'));
        const result = p.getFrameworks(null, {});

        it('embed true, link true', function () {
            expect(result[0].embed).toBe(true);
            expect(result[0].link).toBe(true);
        });

        it('embed true, link false', function () {
            expect(result[1].embed).toBe(true);
            expect(result[1].link).toBe(false);
        });

        it('embed false, link true', function () {
            expect(result[2].embed).toBe(false);
            expect(result[2].link).toBe(true);
        });

        it('embed false, link false', function () {
            expect(result[3].embed).toBe(false);
            expect(result[3].link).toBe(false);
        });

        // Undefined means the attribute didn't exist in the framework tag XML.

        it('embed undefined, link undefined', function () {
            expect(result[4].embed).toBe(false);
            expect(result[4].link).toBe(null);
        });

        it('embed true, link undefined', function () {
            expect(result[5].embed).toBe(true);
            expect(result[5].link).toBe(null);
        });

        it('embed false, link undefined', function () {
            expect(result[6].embed).toBe(false);
            expect(result[5].link).toBe(null);
        });
    });
});
