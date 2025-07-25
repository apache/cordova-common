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

const fs = require('node:fs');
const path = require('node:path');
const PluginInfo = require('../src/PluginInfo/PluginInfo');
const ConfigChanges = require('../src/ConfigChanges/ConfigChanges');
const ActionStack = require('../src/ActionStack');
const PluginManager = require('../src/PluginManager');

const DUMMY_PLUGIN = path.join(__dirname, 'fixtures/plugins/org.test.plugins.dummyplugin');
const FAKE_PLATFORM = 'cordova-atari';
const FAKE_LOCATIONS = {
    root: '/some/fake/path',
    platformWww: '/some/fake/path/platform_www',
    www: '/some/www/dir'
};

describe('PluginManager class', function () {
    beforeEach(function () {
        spyOn(ConfigChanges, 'PlatformMunger');
        spyOn(fs, 'writeFileSync');
        spyOn(fs, 'mkdirSync');
    });

    it('Test 001 : should be constructable', function () {
        expect(new PluginManager(FAKE_PLATFORM, FAKE_LOCATIONS)).toEqual(jasmine.any(PluginManager));
    });

    it('Test 002 : should return new instance for every PluginManager.get call', function () {
        expect(PluginManager.get(FAKE_PLATFORM, FAKE_LOCATIONS)).toEqual(jasmine.any(PluginManager));
        expect(PluginManager.get(FAKE_PLATFORM, FAKE_LOCATIONS))
            .not.toBe(PluginManager.get(FAKE_PLATFORM, FAKE_LOCATIONS));
    });

    describe('instance', function () {
        let manager;
        let FAKE_PROJECT;

        beforeEach(function () {
            FAKE_PROJECT = jasmine.createSpyObj('project', ['getInstaller', 'getUninstaller', 'write']);
            manager = new PluginManager('windows', FAKE_LOCATIONS, FAKE_PROJECT);
            spyOn(ActionStack.prototype, 'createAction');
            spyOn(ActionStack.prototype, 'push');
            spyOn(ActionStack.prototype, 'process').and.resolveTo();
        });

        describe('doOperation', function () {
            it('should reject if the operation is invalid', function () {
                return expectAsync(manager.doOperation('test', {}, {})).toBeRejected();
            });
        });

        describe('addPlugin method', function () {
            it('should return a promise', function () {
                return expectAsync(manager.addPlugin(new PluginInfo(DUMMY_PLUGIN), {})).toBeResolved();
            });

            it('Test 003 : should reject if "plugin" parameter is not specified or not a PluginInfo instance', () => {
                return Promise.resolve()
                    .then(() => expectAsync(manager.addPlugin(null, {})).toBeRejected())
                    .then(() => expectAsync(manager.addPlugin({}, {})).toBeRejected());
            });

            it('Test 004 : should iterate through all plugin\'s files and frameworks', () => {
                return manager.addPlugin(new PluginInfo(DUMMY_PLUGIN), {})
                    .then(function () {
                        expect(FAKE_PROJECT.getInstaller.calls.count()).toBe(16);
                        expect(FAKE_PROJECT.getUninstaller.calls.count()).toBe(16);

                        expect(ActionStack.prototype.push.calls.count()).toBe(16);
                        expect(ActionStack.prototype.process).toHaveBeenCalled();
                        expect(FAKE_PROJECT.write).toHaveBeenCalled();
                    });
            });

            it('Test 005 : should save plugin metadata to www directory', () => {
                const metadataPath = path.join(manager.locations.www, 'cordova_plugins.js');
                const platformWwwMetadataPath = path.join(manager.locations.platformWww, 'cordova_plugins.js');

                return manager.addPlugin(new PluginInfo(DUMMY_PLUGIN), {})
                    .then(function () {
                        expect(fs.writeFileSync).toHaveBeenCalledWith(metadataPath, jasmine.any(String), 'utf8');
                        expect(fs.writeFileSync).not.toHaveBeenCalledWith(platformWwwMetadataPath, jasmine.any(String), 'utf8');
                    });
            });

            it('Test 006 : should save plugin metadata to both www ans platform_www directories when options.usePlatformWww is specified', () => {
                const metadataPath = path.join(manager.locations.www, 'cordova_plugins.js');
                const platformWwwMetadataPath = path.join(manager.locations.platformWww, 'cordova_plugins.js');

                return manager.addPlugin(new PluginInfo(DUMMY_PLUGIN), { usePlatformWww: true })
                    .then(function () {
                        expect(fs.writeFileSync).toHaveBeenCalledWith(metadataPath, jasmine.any(String), 'utf8');
                        expect(fs.writeFileSync).toHaveBeenCalledWith(platformWwwMetadataPath, jasmine.any(String), 'utf8');
                    });
            });
        });

        describe('removePlugin method', function () {
            it('should return a promise', function () {
                return expectAsync(manager.removePlugin(new PluginInfo(DUMMY_PLUGIN), {})).toBeResolved();
            });

            it('should reject if "plugin" parameter is not specified or not a PluginInfo instance', () => {
                return Promise.resolve()
                    .then(() => expectAsync(manager.removePlugin(null, {})).toBeRejected())
                    .then(() => expectAsync(manager.removePlugin({}, {})).toBeRejected());
            });

            // The rest of this is essentially identical to the addPlugin flow
        });
    });
});
