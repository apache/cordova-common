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
const pluginPassthrough = new PluginInfo(path.join(pluginsDir, 'org.test.xmlpassthrough'));

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

    describe('Framework', () => {
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

        it('Test 006: framework supports xml passthrough', function () {
            const frameworks = pluginPassthrough.getFrameworks('android', {});
            expect(frameworks.length).toBe(1);
            expect(frameworks[0].anattrib).toBe('value');
        });
    });

    describe('Podspec', () => {
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
    });

    // describe('Preference', () => {
    //     // XML passthrough for preferences is not supported because multiple preferences will override each other.
    //     // https://github.com/apache/cordova-common/issues/182
    //     // it('Test 007: Preference supports xml passthrough', function () {
    //     //     const preferences = pluginPassthrough.getPreferences('android');
    //     //     console.log(preferences);
    //     //     expect(preferences.passthroughpref.anattrib).toBe('value');
    //     // });
    // });

    describe('Asset', () => {
        it('Test 008: Asset supports xml passthrough', function () {
            const assets = pluginPassthrough.getAssets('android');
            expect(assets.length).toBe(1);
            expect(assets[0].anattrib).toBe('value');
        });
    });

    describe('Dependency', () => {
        it('Test 009: Dependency supports xml passthrough', function () {
            const dependencies = pluginPassthrough.getDependencies('android');
            expect(dependencies.length).toBe(1);
            expect(dependencies[0].anattrib).toBe('value');
        });
    });

    describe('Config File', () => {
        it('Test 010: config-file supports xml passthrough', function () {
            const configFiles = pluginPassthrough.getConfigFiles('android');
            expect(configFiles.length).toBe(1);
            expect(configFiles[0].anattrib).toBe('value');
        });
    });

    describe('Edit Config', () => {
        it('Test 011: edit-config supports xml passthrough', function () {
            const editConfigs = pluginPassthrough.getEditConfigs('android');
            expect(editConfigs.length).toBe(1);
            expect(editConfigs[0].anattrib).toBe('value');
        });
    });

    describe('Source File', () => {
        it('Test 012: source-file supports xml passthrough', function () {
            const sourceFiles = pluginPassthrough.getSourceFiles('android');
            expect(sourceFiles.length).toBe(1);
            expect(sourceFiles[0].anattrib).toBe('value');
        });
    });

    describe('Header File', () => {
        it('Test 013: header-file supports xml passthrough', function () {
            const headerFiles = pluginPassthrough.getHeaderFiles('android');
            expect(headerFiles.length).toBe(1);
            expect(headerFiles[0].anattrib).toBe('value');
        });
    });

    describe('Resource File', () => {
        it('Test 014: resource-file supports xml passthrough', function () {
            const resourceFiles = pluginPassthrough.getResourceFiles('android');
            expect(resourceFiles.length).toBe(1);
            expect(resourceFiles[0].anattrib).toBe('value');
        });
    });

    describe('Lib File', () => {
        it('Test 015: lib-file supports xml passthrough', function () {
            const libFiles = pluginPassthrough.getLibFiles('android');
            expect(libFiles.length).toBe(1);
            expect(libFiles[0].anattrib).toBe('value');
        });
    });

    describe('Hook', () => {
        it('Test 016: hook supports xml passthrough', function () {
            const hooks = pluginPassthrough.getHookScripts('hi', 'android');
            expect(hooks.length).toBe(1);
            expect(hooks[0].attrib.anattrib).toBe('value');
        });
    });

    describe('JS Module', () => {
        it('Test 017: js-modules supports xml passthrough', function () {
            const modules = pluginPassthrough.getJsModules('android');
            expect(modules.length).toBe(1);
            expect(modules[0].anattrib).toBe('value');
        });
    });

    describe('Engine', () => {
        it('Test 018: engine supports xml passthrough', function () {
            const engines = pluginPassthrough.getEngines('android');
            expect(engines.length).toBe(1);
            expect(engines[0].anattrib).toBe('value');
        });
    });

    describe('Platform', () => {
        it('Test 019: platform supports xml passthrough', function () {
            const platforms = pluginPassthrough.getPlatforms();
            expect(platforms.length).toBe(1);
            expect(platforms[0].anattrib).toBe('value');
        });
    });
});
