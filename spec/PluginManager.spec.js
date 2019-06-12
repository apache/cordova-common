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

// Promise-matchers do not work with jasmine 2.0.
// require('promise-matchers');

var fs = require('fs-extra');
var path = require('path');
var rewire = require('rewire');
var PluginManager = rewire('../src/PluginManager');
var PluginInfo = require('../src/PluginInfo/PluginInfo');
var ConfigChanges = require('../src/ConfigChanges/ConfigChanges');

var DUMMY_PLUGIN = path.join(__dirname, 'fixtures/plugins/org.test.plugins.dummyplugin');
var FAKE_PLATFORM = 'cordova-atari';
var FAKE_LOCATIONS = {
    root: '/some/fake/path',
    platformWww: '/some/fake/path/platform_www',
    www: '/some/www/dir'
};

describe('PluginManager class', function () {

    beforeEach(function () {
        spyOn(ConfigChanges, 'PlatformMunger');
        spyOn(fs, 'outputJsonSync');
        spyOn(fs, 'writeFileSync');
        spyOn(fs, 'ensureDirSync');
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
        var actions, manager;
        var FAKE_PROJECT;
        var failed = jasmine.createSpy('failed');
        var ActionStackOrig = PluginManager.__get__('ActionStack');

        beforeEach(function () {
            FAKE_PROJECT = jasmine.createSpyObj('project', ['getInstaller', 'getUninstaller', 'write']);
            manager = new PluginManager('windows', FAKE_LOCATIONS, FAKE_PROJECT);
            actions = jasmine.createSpyObj('actions', ['createAction', 'push', 'process']);
            actions.process.and.returnValue(Promise.resolve());
            PluginManager.__set__('ActionStack', function () { return actions; });
        });

        afterEach(function () {
            PluginManager.__set__('ActionStack', ActionStackOrig);
        });

        describe('addPlugin method', function () {
            it('Test 003 : should reject if "plugin" parameter is not specified', function (done) {
                manager.addPlugin(null, {})
                    .then(function () {
                        done.fail('promise should not have resolved for no valid PluginInfo instance');
                    })
                    .catch(err => {
                        expect(err).toBeDefined();
                        expect(err).toMatch(/first parameter should be a PluginInfo instance/);
                        done();
                    });
            });

            it('Test 004 : should reject if "plugin" parameter is not a PluginInfo instance', function (done) {
                manager.addPlugin({}, {})
                    .then(function () {
                        done.fail('promise should not have resolved for no valid PluginInfo instance');
                    })
                    .catch(err => {
                        expect(err).toBeDefined();
                        expect(err).toMatch(/first parameter should be a PluginInfo instance/);
                        done();
                    });
            });

            it('Test 005 : should return a promise, iterate through all plugin\'s files and frameworks, then resolve the promise', function (done) {
                manager.addPlugin(new PluginInfo(DUMMY_PLUGIN), {})
                    .then(function () {
                        expect(FAKE_PROJECT.getInstaller.calls.count()).toBe(16);
                        expect(FAKE_PROJECT.getUninstaller.calls.count()).toBe(16);

                        expect(actions.push.calls.count()).toBe(16);
                        expect(actions.process).toHaveBeenCalled();
                        expect(FAKE_PROJECT.write).toHaveBeenCalled();
                    })
                    .catch(failed)
                    .then(function () {
                        expect(failed).not.toHaveBeenCalled();
                        done();
                    });
            });

            it('Test 006 : should save plugin metadata to www directory', function (done) {
                var metadataPath = path.join(manager.locations.www, 'cordova_plugins.js');
                var platformWwwMetadataPath = path.join(manager.locations.platformWww, 'cordova_plugins.js');

                manager.addPlugin(new PluginInfo(DUMMY_PLUGIN), {})
                    .then(function () {
                        expect(fs.writeFileSync).toHaveBeenCalledWith(metadataPath, jasmine.any(String), 'utf-8');
                        expect(fs.writeFileSync).not.toHaveBeenCalledWith(platformWwwMetadataPath, jasmine.any(String), 'utf-8');
                    })
                    .catch(failed)
                    .then(function () {
                        expect(failed).not.toHaveBeenCalled();
                        done();
                    });
            });

            it('Test 007 : should save plugin metadata to both www ans platform_www directories when options.usePlatformWww is specified', function (done) {
                var metadataPath = path.join(manager.locations.www, 'cordova_plugins.js');
                var platformWwwMetadataPath = path.join(manager.locations.platformWww, 'cordova_plugins.js');

                manager.addPlugin(new PluginInfo(DUMMY_PLUGIN), { usePlatformWww: true })
                    .then(function () {
                        expect(fs.writeFileSync).toHaveBeenCalledWith(metadataPath, jasmine.any(String), 'utf-8');
                        expect(fs.writeFileSync).toHaveBeenCalledWith(platformWwwMetadataPath, jasmine.any(String), 'utf-8');
                    })
                    .catch(failed)
                    .then(function () {
                        expect(failed).not.toHaveBeenCalled();
                        done();
                    });
            });
        });
    });
});
