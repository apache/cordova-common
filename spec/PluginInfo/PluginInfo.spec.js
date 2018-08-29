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

var PluginInfo = require('../../src/PluginInfo/PluginInfo');
var path = require('path');
var pluginsDir = path.join(__dirname, '../fixtures/plugins');

describe('PluginInfo', function () {
    it('Test 001 : should read a plugin.xml file', function () {
        /* eslint-disable no-unused-vars */
        var p;
        var prefs;
        var assets;
        var deps;
        var configFiles;
        var infos;
        var srcFiles;
        var headerFiles;
        var libFiles;
        var resourceFiles;
        var getFrameworks;
        expect(function () {
            p = new PluginInfo(path.join(pluginsDir, 'ChildBrowser'));
            prefs = p.getPreferences('android');
            assets = p.getAssets('android');
            deps = p.getDependencies('android');
            configFiles = p.getConfigFiles('android');
            infos = p.getInfo('android');
            srcFiles = p.getSourceFiles('android');
            headerFiles = p.getHeaderFiles('android');
            libFiles = p.getLibFiles('android');
            getFrameworks = p.getFrameworks('android');
            resourceFiles = p.getResourceFiles('android');
        }).not.toThrow();
        expect(p).toBeDefined();
        expect(p.name).toEqual('Child Browser');
        // TODO: Add some expectations for results of getSomething.
        /* eslint-enable no-unused-vars */
    });
    it('Test 002 : should throw when there is no plugin.xml file', function () {
        expect(function () {
            new PluginInfo('/non/existent/dir'); /* eslint no-new : 0 */
        }).toThrow();
    });

    it('Test 003: replace framework src', function () {
        var p = new PluginInfo(path.join(pluginsDir, 'org.test.src'));
        var result = p.getFrameworks('android', {cli_variables: { FCM_VERSION: '9.0.0' }});
        expect(result[2].src).toBe('com.google.firebase:firebase-messaging:9.0.0');
    });

    it('Test 004: framework src uses default variable', function () {
        var p = new PluginInfo(path.join(pluginsDir, 'org.test.src'));
        var result = p.getFrameworks('android', {});
        expect(result[2].src).toBe('com.google.firebase:firebase-messaging:11.0.1');
    });

    it('Test 005: read podspec', function () {
        var p = new PluginInfo(path.join(pluginsDir, 'org.test.plugins.withcocoapods'));
        var result = p.getPodSpecs('ios');
        expect(result.length).toBe(1);
        var podSpec = result[0];
        expect(Object.keys(podSpec.declarations).length).toBe(2);
        expect(Object.keys(podSpec.sources).length).toBe(1);
        expect(Object.keys(podSpec.libraries).length).toBe(4);
        expect(podSpec.declarations['use-frameworks']).toBe('true');
        expect(podSpec.sources['https://github.com/CocoaPods/Specs.git'].source).toBe('https://github.com/CocoaPods/Specs.git');
        expect(podSpec.libraries['AFNetworking'].spec).toBe('~> 3.2');
        expect(podSpec.libraries['Eureka']['swift-version']).toBe('4.1');
    });
});
